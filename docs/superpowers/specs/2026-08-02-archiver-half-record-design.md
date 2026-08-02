# The archiver must name what it wrote, and never claim half a record

*Design for issue #6. Depends on #10 (the `captureNode` seam) and #13 (held artifacts are found by directory scan).*

## Goal

Three defects in `scripts/archive.ts`, all the same shape: **the record ends up claiming evidence that is not on disk.**

1. `saveLocalCopy` returns a `.pdf` path when the fallback wrote a `.png` — the record names a file that does not exist.
2. A failed local capture followed by a successful Wayback submission writes `archived_url` with no `local_snapshot` — a record claiming a public archive it holds no local copy for.
3. If `page.pdf()` and the `.png` fallback both fail, the error propagates before the sidecar is written, leaving an orphan body with no receipt.

None fires on today's corpus (0 `.png`, 0 orphans, verified). All three are reachable by ordinary use.

## Why this matters here

This project's guarantee is that every cited page is held **twice** — a public archive and a dated local copy — and that a published `.sha256` proves the body is unaltered. Each defect breaks a different part of that:

- (1) makes `local_snapshot` name a non-existent file, so the record's own pointer is wrong.
- (2) produces exactly the state `methodologie.md` promises cannot happen (*"elke geciteerde pagina wordt … dubbel bewaard"*) and CLAUDE.md states as "ALWAYS both".
- (3) is one of two live triggers for **#7**: an unhashed body is pushed unverified (no sidecar ⇒ `publishedHash` returns null ⇒ no check), and the next successful capture writes different bytes plus a matching sidecar, tripping sync's append-only Rule 2 — which then refuses **the entire push, for every provider**.

## The seam

Fixes 1 and 3 live inside `saveLocalCopy`, which is unexported and needs a Playwright page. Faking a browser was considered and rejected in #10 for reasons that still hold: the stub must track Playwright's API, and `page.pdf()` only fails on non-headless Chromium, so the fallback branch is close to untriggerable deliberately.

Extract the decision instead:

```ts
/** Hash whatever was written for this capture and return the artifact the record should
 *  name. Split out of saveLocalCopy so it is testable without a browser — the same move
 *  #10 made for captureNode: the decision comes out, the IO stays in the caller. */
export function finishCapture(base: string, html: string): string
```

It writes `${base}.sha256` listing whichever of `.html`/`.pdf`/`.png` exist (that logic is already `existsSync`-conditional today), then returns the repo-relative path of what was **actually** written: `.pdf` if present, else `.png`, else `.html`.

## The three fixes

**1 — name what you wrote.** `finishCapture`'s return replaces the unconditional `return path.relative(process.cwd(), \`${base}.pdf\`)`.

**3 — never orphan a body.** The `.png` fallback gets its own `.catch`, so a screenshot failure no longer propagates past the sidecar write:

```ts
await page.pdf({ path: `${base}.pdf`, fullPage: true } as never).catch(async () => {
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch((e) => {
    console.warn(`\n    let op: alleen HTML vastgelegd — pdf én png mislukt (${(e as Error).message})`);
  });
});
```

**An html-only capture is a degraded success, loudly flagged.** `page.content()` is what we actually fetched; the `.pdf` is a rendering of it. Discarding a real fetch because a rendering failed would destroy evidence, and this repo's archiver never deletes. The warning is the signal to re-run — deliberately not a failure, because the html frequently *is* where the fact lives (the JS-rendered-price trap cuts both ways: 7 providers' prices exist only in the HTML).

Consequence: every body that reaches disk now gets hashed, which removes #7's orphan trigger entirely.

**2 — no half-record.** In `captureNode`, immediately after the capture `catch`:

```ts
// A record must never claim a public archive it holds no local copy for. CLAUDE.md:
// "ALWAYS both". Returning here means no submission, no archived_url, and no 10-30s
// throttle pause on a run that has already failed. The run still exits non-zero and
// names the source; the next run retries both halves together.
if (failedCapture) return { changed, failedCapture };
```

## What #13 already handles

Two things that would otherwise belong here are already done:

- An **orphan body is still readable**: `artifactsFor` derives held artifacts from a directory scan, not from the sidecar, so an unhashed `.html` is found and searched. #13's own correction note explains why. Fix 3 is therefore about #7's push path, not about provenance.
- A **`.png` in `local_snapshot` does not make a claim opaque**, because `saveLocalCopy` always writes the `.html` first, so a readable twin is always present. The opaque state stays reserved for hand-placed image-only captures.

## Tests

`finishCapture` is exported and takes a base path, so all of fixes 1 and 3 are testable with plain files:

| # | Test | Pins |
|---|---|---|
| 1 | `.html` + `.pdf` on disk → returns the `.pdf` path | the normal case is unchanged |
| 2 | `.html` + `.png`, no `.pdf` → returns the **`.png`** path | fix 1: the record names what exists |
| 3 | `.html` only → returns the `.html` path, sidecar lists exactly one file | fix 3: html-only is a real capture, hashed |
| 4 | every returned path exists on disk | the defect in one assertion, format-agnostic |

Fix 2 goes through the `captureNode` seam from #10:

| # | Test | Pins |
|---|---|---|
| 5 | a throwing `capture` + a `submitWayback` that **throws if called** → no `archived_url`, no submission, `failedCapture` set | "never submitted", enforced rather than observed |

## Non-goals

- No change to `isDirectFileUrl` or `saveDirectFile` — the direct-download path already derives its extension from the URL and returns it correctly.
- No OCR, no new readable formats. That is #13's non-goal too, and still true.
- No integrity rule that `archived_url` implies `local_snapshot`. Fix 2 makes the state unreachable from the archiver; a loader rule would catch it only after a bad record was committed, in a different tool. If a record ever acquires that shape by hand, that is a separate finding.
- `#7`'s other trigger — a hand-placed body whose sidecar is never written — is untouched here. Fix 3 closes the crash path only.

## Folded in

The parked citation error from #13's final review: both correction notes cite `provenance.ts:606-610` for issue #7's crash-between-writes reference, which is the unrelated *"never move the author's files"* paragraph. The correct span is ~637-638. Two characters in each of the spec and the plan.

## Risk

`saveLocalCopy` is how all evidence enters this project, and the extraction touches its write path. The failure modes are asymmetric: a bug that writes *less* is visible (a missing artifact fails provenance), while a bug that writes the *wrong sidecar* is invisible and corrupts the receipt every later check depends on.

Mitigations, in order:

1. `finishCapture` is directly tested, including that its returned path exists.
2. `npm run provenance` must stay **165/165** on the real corpus.
3. A no-op smoke run before merge: `npm run archive -- _references --no-sync` **without** `--force`. Every reference already has a snapshot, so nothing should be captured and the tree must stay clean. A run that re-captures means the skip logic broke.
4. No archive file may be added, moved, or re-hashed by this work — `git status` clean after the smoke run is the check.
