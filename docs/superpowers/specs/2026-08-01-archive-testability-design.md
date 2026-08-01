# Making `captureNode` testable

*Design for issue #10. Prerequisite for #6, which fixes bugs in the code this spec makes reachable.*

## Goal

`scripts/archive.ts` has no tests and cannot have any: `main()` runs at module scope, so importing the file launches Chromium, and `captureNode` is not exported. Give it the same seam `scripts/sync-archive.ts` already has, and pin the behaviour that is correct today.

**No behaviour changes.** This is infrastructure. The bugs in this file are #6 and #13 and stay there.

## Why this exists

`captureNode` was extracted in PR #5 so a provider's `sources[]` entry and a reference document flow through one capture routine — same naming, same `.sha256` sidecar, same Wayback-pointless rule. The reasoning was that two parallel routines would drift, and the thing they would drift on is the sidecar the whole evidentiary chain reads.

That argument is sound and the extraction is unpinned. Nothing asserts the two paths still agree. One behavioural change already slipped through it unnoticed: the old inline loop used `if (!url) continue`, which skipped the trailing per-source write; `captureNode` returns `false` instead and falls through to it, so a url-less source now triggers a redundant rewrite of identical bytes. Benign — and exactly the class of drift the extraction existed to prevent.

`sync-archive.ts` shows the bar this repo already holds a script to: five tests, including one that greps `archive.ts` to prove the sync is *wired in*, because "a backup nobody runs is not a backup".

## The seam

`captureNode` takes its dependencies explicitly:

```ts
export type Capture = (dir: string, sourceId: string, url: string, query?: string) => Promise<string>;

export interface CaptureDeps {
  capture: Capture;
  submitWayback: (url: string) => Promise<string | null>;
  force: boolean;
  skipWayback: boolean;
}

export async function captureNode(
  node: import("yaml").YAMLMap,
  dir: string,
  deps: CaptureDeps,
): Promise<CaptureResult>
```

Three things fall out of injecting `capture`, and they are the point of choosing it over a fake browser:

- **The `browser` parameter disappears.** It exists only to hand to `saveLocalCopy`. Once capture is injected, Playwright is closed over by the default and becomes an implementation detail of one function rather than a parameter threaded through the module.
- **`today` needs no injection.** Only `saveLocalCopy` uses it, to build the filename. A fake capture picks its own paths, so the test controls filenames without a clock seam.
- **A test can make capture fail on demand**, which is what #6 needs and what a fake browser makes awkward (`page.pdf()` only fails on non-headless Chromium, so the fallback branch is close to untriggerable deliberately).

`WAYBACK_POINTLESS` stays a direct import. It is a pure constant, and `wayback.ts` exists precisely so the archiver and the validator read one copy of that rule.

## Killing the hidden global

`failedCaptures` is module-level mutable state that `captureNode` pushes into. It returns its outcome instead:

```ts
export interface CaptureResult {
  changed: boolean;
  /** The source id whose LOCAL capture threw this run, or null. */
  failedCapture: string | null;
}
```

`main()` accumulates into its own array and keeps the existing tally, stderr message and non-zero exit. Same behaviour, no invisible mutation, and the failure path becomes assertable.

## Entrypoint guard

Mirroring `sync-archive.ts` exactly:

```ts
if (process.argv[1] && path.resolve(process.argv[1]).endsWith("archive.ts")) {
  if (SYNC_ONLY) syncArchive();
  else main().catch((e) => { console.error(e); process.exit(1); });
}
```

The argv-derived constants (`ALL`, `FORCE`, `ids`, `today`, …) stay module-scope and `main()` keeps reading them, passing them down explicitly. Evaluating them on import is harmless; launching a browser is not.

## Tests — `src/lib/archive.test.ts`

Every test uses a fake `capture` and a fake `submitWayback`. No browser, no network, temp dirs only. They pin behaviour that is **correct today**, so this ships green.

| # | Test | Why it matters |
|---|---|---|
| 1 | a source with no `url` is skipped **and announces itself** | silence made an unarchivable source indistinguishable from a captured one |
| 2 | an existing on-disk `local_snapshot` is skipped without `--force` | "already archived" means the file exists, not that the YAML declares a path |
| 3 | `--force` re-captures anyway | the escape hatch must actually escape |
| 4 | a Wayback-pointless URL never gets `archived_url` written | the rule twelve records once disagreed with |
| 5 | `--skip-wayback` suppresses submission | |
| 6 | `dir` reaches `deps.capture()` and the written `local_snapshot`, for both a provider node and a reference node — not hardcoded to one directory | a provider source and a reference document must actually write to their own directory, not silently share one |
| 7 | wiring: both loops call `captureNode` | mirrors `sync-archive.test.ts`'s wiring test |

**Correction, post-review (2026-08-01).** Test 6 originally shipped with an added
`assert.deepEqual({changed, failed}, {changed, failed})` across the two invocations, and this
table described it (as it still did until this correction) as pinning that "a provider id and
`_references` run the identical *code* path — same decisions, same writes… the extraction's
entire claim." Review found that assertion tautological: `dir` drives none of `captureNode`'s
branching (`hasLocal`, `WAYBACK_POINTLESS`, `excluded`, `skipWayback`, `force` are all
`dir`-independent) — only the `deps.capture()` call and `node.set` depend on it. With identical
node content and deps, both invocations were guaranteed equal for any two `dir` values; the
assertion could not go red. It was dropped in commit 2b939f0, and the test renamed and
re-commented to say what it actually pins (row 6 above) — `dir` is threaded through rather than
hardcoded — and what it does not: end-to-end agreement between `main()`'s provider loop and
`archiveReferences()` remains untested by design, checked only at the grep level, by test 7.

**Deliberately not here: #6's bug tests.** A test for a bug must go red before it goes green, and #10 must ship green. They belong in #6's PR, where they will be red on arrival — and where the seam built here is what lets them exist at all.

## Non-goals

- No `ArchiveOptions` object and no `defaultOptions()`. `sync-archive.ts` needs one because `syncArchive()` is called from two places with different settings; `captureNode` has one caller shape. Adding it here is ceremony.
- `main()`, `archiveReferences()` and `selectedReferenceFiles()` stay untested. `selectedReferenceFiles` carried a real bug — a mistyped provider id running green alongside a matched reference — fixed unpinned in PR #5 and tracked as **#14**. It deserves pinning, but as its own change: smuggling a second guard's coverage into a testability refactor blurs what this change is.
- `saveLocalCopy` is untouched. Its return value lies about which artifact it wrote; that is #6.
- No OCR, no new artifact formats. That is #13.

## Risk

`captureNode` is the single path every provider source and every reference archives through. A mistake breaks all archiving, and archiving is how evidence enters this project.

Mitigations, in order:

1. The refactor is mechanical — parameters replacing module reads, no logic moved.
2. The seven tests above.
3. A no-op smoke run before merge: `npm run archive -- _references --no-sync` **without** `--force`. Every reference already has a local snapshot, so the correct outcome is that nothing is captured, nothing is written, and the run exits 0. A run that suddenly re-captures means the "already archived" test in the seam is wrong.

## Sequencing

**#10 → #13 → #6.**

#10 and #13 are independent of each other. #6 depends on both: on #10 for testability, and on #13 because #6's first fix starts declaring `.png` in `local_snapshot`, and until #13 lands a held `.png` is classified as "body not in this checkout" — so shipping #6 first would manufacture the exact misreport #13 exists to fix.
