# A held artifact we cannot read is not a body we do not have

*Design for issue #13. Prerequisite for #6, whose first fix starts declaring `.png` in `local_snapshot`.*

## Goal

`artifactsFor()` decides what is "present" by file extension rather than by asking the disk, so any archived artifact that is not `.pdf` or `.html` reports as **absent** — and the run prints *"snapshot-body niet in deze checkout; alleen de hash is publiek"* about a file it is holding.

Make presence a fact about the disk, and give a held-but-unextractable artifact its own honest state.

## Why this exists

The project separates three tiers on purpose (`FINDING_TIER`), and the separation is load-bearing:

- **structural** — you cited a page that is in no archive
- **content** (`no_evidence`) — we opened the artifact and the fact is not in it
- **tooling** (`unreadable`) — we hold a capture and could not extract a character; reporting that as `content` would print *"the page states no price"* about a named business on the strength of our own broken extractor

A held image belongs in none of them, and today it lands somewhere worse than any: the **CI-limitation** bucket. "The body is not in this checkout" is a statement about the *environment* — nobody's fault, nothing to fix. So the project excuses itself for evidence it is holding and could, with different tooling, read.

**An image can be primary evidence**, not merely a fallback artifact: a photo of a certificate, or a programme published only as an image. That is a legitimate capture. Today it would be filed as missing.

## Root cause

`src/lib/provenance.ts`, current:

```ts
const readable = withheldBodies(cwd)
  ? []
  : READABLE.map((ext) => path.join(cwd, base + ext)).filter((f) => fs.existsSync(f));
…
const present = new Set(readable.map((f) => path.basename(f)));
return {
  readable,
  bodyWithheld: hashed.some((name) => !present.has(name)),
  nothingCaptured: readable.length === 0 && hashed.length === 0,
};
```

`present` is derived from `readable`, and `readable` is derived from `READABLE = [".pdf", ".html"]`. An artifact in any other format is hashed in its sidecar, sits on disk, and can never be "present".

Reachable formats today, none of them hypothetical:

- `.png` — the `page.pdf()` screenshot fallback in `scripts/archive.ts`
- `.docx` / `.pptx` / `.xlsx` / `.zip` — explicitly supported by `isDirectFileUrl()`
- **anything hand-placed** — a source with no `url` is never touched by the archiver, so its body is placed by hand. `brochure-curriculum-2026-07` already works this way.

## The fix: ask the disk, not the extension

```ts
const held     = hashed.filter((name) => fs.existsSync(path.join(cwd, dir, name)));
const readable = held.filter(isReadable);            // .pdf, .html — we extract text
const opaque   = held.filter((n) => !isReadable(n)); // no extraction available
bodyWithheld   = hashed.some((name) => !held.includes(name));
```

`bodyWithheld` becomes a truthful statement about disk presence, independent of extractability. `withheldBodies(cwd)` still forces `held = []`, so the CI simulation is unchanged.

This also closes a latent bug: `readable` currently probes `base + ext` rather than the sidecar's **listed filenames**, so a capture named off-pattern is invisible to the gate even when hashed and present.

## The new state

**Not a `ProvenanceReason`.** Those are findings, and `scripts/provenance.ts` ends with `if (findings.length > 0) process.exit(1)` — so making image evidence a finding would break the build for adding a certificate photo, punishing exactly the evidence this design exists to admit.

It is a counter alongside `skipped`, carrying the filenames so the report can name them.

Order in `allProvenance` encodes the distinction, and each step means something different:

1. `bodyWithheld` → **skipped** — genuinely absent. The CI case. *Unchanged.*
2. `readable.length === 0 && opaque.length > 0` → **opaque** — held, no extraction available. *New.*
3. `texts.length === 0` → **`unreadable` finding** — a format we commit to reading yielded nothing, so something is broken. Build fails. *Unchanged.*

Step 3 still catches a shell `.pdf` even when a `.png` sits beside it: step 2 requires `readable.length === 0`, so the presence of a broken PDF keeps the claim on the finding path. A format we promised to read and could not is our failure; a format with no text layer is not.

## One state, not two

`.docx` contains text we simply do not extract; `.png` contains none. Both share the opaque state, and the **message names the file**:

```
• 2 claim(s) op niet-uitleesbaar bewijs:
    tribes-cert-2026-08-02.png     (beeld — geen tekstlaag)
    yoga-den-tarieven-2026-08-02.docx  (geen tekstextractie voor dit formaat)
```

Zero such captures exist today (229 `.html`, 236 `.pdf`, nothing else), so a third machine category would be speculative. The named filename is the signal: a `.png` line reads as expected, a `.docx` line reads as a prompt to add support. If those become common, that is when the category earns its existence.

## Reporting

The coverage line in `scripts/validate.ts` and `scripts/provenance.ts` gains the opaque count and its filenames. The build stays green. The run must never imply the opaque claims were verified — they were not; they simply were not *verifiable* by this tool.

## Tests — `src/lib/provenance.test.ts`

`artifactsFor` is exported and takes a `cwd`, and this file already builds temp-dir fixtures in seven places, so every case below is testable without touching the corpus.

| # | Test | Why |
|---|---|---|
| 1 | a held `.png` reports `bodyWithheld: false` | the bug: a file on disk must not report as absent |
| 2 | a claim whose only artifact is a held `.png` is counted **opaque**, not skipped, and produces no finding | the whole point — honest, and the build stays green |
| 3 | a held `.png` **plus a missing `.html`** still reports `bodyWithheld: true` | one absent body must not be masked by a present one |
| 4 | a `.pdf` that yields no text is still an `unreadable` **finding** | the tooling tier is untouched; broken stays broken |
| 5 | a shell `.pdf` beside a held `.png` still reaches the finding | step 2 must not swallow step 3 |
| 6 | a held `.docx` is opaque and the message names it | the signal that earns a future category |
| 7 | `PROVENANCE_WITHHOLD_BODIES=1` reports everything withheld, as before | the CI-honesty path is unchanged |

## Non-goals

- **OCR.** Reading text out of an image is a different project. This design is its precondition — you cannot sensibly add OCR while images are classified as absent.
- **`.docx`/`.xlsx` text extraction.** Same reasoning; the opaque message is what would justify it.
- Any change to how `.pdf`/`.html` are extracted, or to `READABLE`'s membership.

## Risk

`allProvenance` is a build gate, and the two failure modes are opposite and both bad: too permissive and claims pass vacuously over evidence nobody opened; too strict and CI blocks on legitimate captures. The change touches `bodyWithheld`, which is precisely the mechanism keeping CI honest rather than green.

Mitigations:

1. Test 7 pins the CI path directly.
2. `npm run test:ci` must report the **same skipped count** as before the change — a drop means the fix leaked into the withheld path.
3. `npm run provenance` on the real corpus must stay at 165/165 with zero opaque, since no non-`.pdf`/`.html` artifact exists yet. Any opaque count on today's corpus means the format detection is wrong.

## Sequencing

**#13 → #6.** #6's first fix makes `saveLocalCopy` return the artifact it actually wrote, which starts declaring `.png` in `local_snapshot`. Landing that before this design would manufacture the exact misreport this one removes.
