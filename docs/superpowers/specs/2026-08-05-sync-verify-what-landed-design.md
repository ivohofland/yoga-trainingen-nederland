# Verify what landed, and refuse to commit what did not

*Design for issue #22. Follows #20, which decided the whole run before writing any of
it; this checks that the writing did what it said. Same theme as #19 — hash the
artifact, not the intention — applied to the destination rather than the source.*

## Goal

`scripts/sync-archive.ts` hashes a body when it **reads** it, then writes the
destination from that same source file. It never looks at what actually landed.

So the pipeline has no answer to a partial or corrupt write. A short write — disk
full, an interrupted process, a filesystem reporting success before it flushed —
produces a destination file whose real hash differs from the `.sha256` copied in
beside it, and the run commits and pushes both under a message asserting every body
was verified.

It surfaces later and badly. The next run's Rule 2 compares the destination against
the source, finds different content, and refuses the whole push for **every**
provider — the append-only rule firing correctly on a state this script created
itself. The obvious escape is the one CLAUDE.md forbids in as many words: never fix
a mismatch by re-hashing the file.

## The related window #20 accepted, closed as a side effect

#20 split verification and writing into two passes, so pass 2 re-reads the source
and the bytes written are no longer provably the bytes verified. Its design accepts
that window deliberately and its **correction note of 2026-08-03** records what
actually bounds the residual: not the dirty-clone check — a body copied in pass 2 is
committed in the same run, so the working tree that check would inspect is already
clean — but **Rule 1 and Rule 2 on the *next* run**.

Pass 3 closes the window outright, in the run that opened it. That is the side
effect, and it is also why this design cannot describe a failure as a bad write:
after pass 3 exists, a mismatch has two causes, and they are not the same event.

## Pass 3 — verify what landed

Immediately after the copy loop, before the `if (!added.length)` early return. Two
comparisons per `rel` in `added`:

**The body.** `sha256` of `dest/rel` as it now exists, against
`publishedHash(archiveDir, rel)`.

The authority is the **source-side** sidecar — the one the public repo committed —
never the destination's own copy of it. A receipt that landed corrupt could agree
with a body that landed corrupt, and a check comparing a file to the receipt that
travelled with it proves only that the two arrived together.

**The receipt.** `Buffer.compare` of the destination sidecar against the source
sidecar. Byte equality, not a hash check: nothing publishes a hash *of* a sidecar.
Pass 2's comment already claims the receipt travels with the body "so the private
repo is self-contained"; this is what makes that a verified statement rather than an
assumption. A corrupt receipt breaks self-containedness exactly as completely as a
corrupt body, and it is a `Buffer.compare` on a file measured in bytes.

`publishedHash()` is non-null for everything in `added` — pass 1 established that,
and it is the only reason this pass may treat a null **here** as a failure rather
than as #7's `skipped`. A sidecar that has since stopped listing this body is not a
gap; it is the same drift the second comparison exists to catch.

One sidecar can serve several bodies — `site-2026-07.html` and `site-2026-07.pdf`
share `site-2026-07.sha256`, which is the JS-rendered-price pair the whole archive is
built around. Pass 2 already copies it once per body, and pass 3 compares it once per
body for the same reason: `mislanded` is keyed by body, and a receipt that landed
corrupt has broken the evidence for **both** of them. Two entries there is the
correct report, not a duplicate.

### What is deliberately not re-checked

- **`unchanged` bodies.** Already transitively verified from the destination side,
  in this same run: pass 1 read the destination and `Buffer.compare`d it against a
  source buffer it had just matched to the published hash. Pass 3 would add nothing.
- **`skipped` and `refused` bodies.** Never written.

So the pass reads exactly the bytes this run wrote, and nothing else. Zero cost on a
no-op run, which is almost every run.

## The disposition: a fifth outcome

`SyncResult` gains **`mislanded: string[]`**. Cause-neutral by construction — it
says the copy is wrong, not why.

It is not folded into `refused`, for the reason #7 refused to fold `skipped` into it.
A Rule 1 or Rule 2 refusal carries a guarantee that **the destination was never
touched**; this one carries the opposite. Collapsing them would make the one field a
caller reads to know the state of the tree mean two incompatible things.

| | `refused` | `mislanded` |
|---|---|---|
| Claim | the body contradicts its receipt, or dated evidence | what we wrote is not what we published |
| Destination | untouched | holds files, uncommitted |
| Written this run | nothing | `added`, including the bad one |

**On failure:**

- **`added` stays populated**, bad body included. `added` means *written to the
  destination tree*; `pushed` means *in the archive*. The two were only ever equal by
  luck, and #20 is the story of what happens when a return value describes a tree
  tidier than the one on disk. Emptying `added` here would reconstruct that lie in
  the code that fixed it.
- **No `git add`, no commit, no push.** Return before all three. A run whose receipt
  failed must not produce an archive commit at all.
- **Nothing deleted, nothing moved, nothing re-hashed into agreement.**
- `process.exitCode = 1`.
- A mislanded run **cannot** print `up-to-date`: `added` is non-empty whenever
  `mislanded` is, so the early return is unreachable. That hazard closes itself
  rather than needing a second guard — but the reasoning is worth stating, because
  #7 had to add such a guard and the next reader will look for one.

**The good copies from a failed run are not committed either.** Whole-run atomicity
is what #20 established, and committing part of a run whose verification failed is
the shape being removed. Mechanically it would also require `git add --force --
<subdir>` to become path-by-path, reopening the trap that `--force` comment exists to
guard: a plain `add` that stages nothing while the script reports success.

### The diagnosis: which of the two causes

A mismatch means either the write was short or corrupt (destination bad, source
fine), or the source drifted in the window between pass 1's hash and pass 2's read
(destination is a faithful copy of a now-different source — an evidence event). The
instructions differ, so the message must not guess. On failure, pass 3 re-reads the
source and reports what it sees now:

```
✗ archief: 1 body kwam VERKEERD aan in de kloon:
    testco/site-2026-07.pdf — wat er landde komt niet overeen met de gepubliceerde hash
  Er is NIETS vastgelegd en NIETS gepusht. Er is ook niets verwijderd: dit
  script haalt nooit iets uit een bewijsboom.

  Het bronbestand in data/archives/ klopt zelf nog wél met zijn gepubliceerde
  hash — het kopiëren ging mis, niet de capture.
```

…and when the source no longer matches:

```
  Het bronbestand in data/archives/ klopt ZELF niet meer met zijn gepubliceerde
  hash. Het kopiëren ging goed; de BRON is veranderd. Zoek uit waaróm — hash hem
  niet opnieuw. Opruimen in de kloon is veilig, maar de volgende run weigert
  terecht onder regel 1 tot dit is uitgezocht.
```

A third branch covers a source that cannot be read at all: reported as such, never
guessed at. This mirrors the provenance check's **tooling** tier — an artifact we
hold but could not read is a hole in our own machinery, and reporting it as a finding
about the file is the `strings` disaster that put a false sentence into the dataset.

Without the split the message has to pick one, and "the write was short" is a
confidently wrong sentence about what may be an evidence event — which would send the
author round a loop: clear the debris, re-run, get refused by Rule 1, and read a real
evidence change as a flaky disk.

## The interaction with #20's dirty-clone gate

The state pass 3 leaves — untracked bodies in the destination, at least one of which
failed its receipt — is exactly what #20's gate refuses to sync on top of. Every
subsequent run stops there until a human acts. That is correct, and it is the
deadlock #22 names.

What is *not* correct is the advice the gate currently gives:

> Verwijder wat hier niet hoort, leg vast wat er wél hoort, en draai daarna opnieuw.

**Commit what belongs** is how the corrupt body enters the archive's history — the
one outcome pass 3 exists to prevent. And it is wrong for every case the gate fires,
not only this one: there is no untracked body under that subdirectory a human should
ever `git add` by hand, because committing it asserts the sync verified it and the
sync did not.

So the sentence goes, replaced by a procedure whose safety the author can **check**
rather than take on faith:

```
  Leg hier NIETS met de hand vast: deze sync heeft deze bestanden nooit
  geverifieerd, en dat is precies wat vastleggen zou beweren.
  Elke body die hier hoort staat óók in data/archives/. Controleer dat per pad
  hierboven — klopt het, dan is dit een kopie en nooit het enige exemplaar, en
  kopieert en controleert de volgende run hem alsnog:
    git -C <repo> clean -ndx -- yoga-trainingen-directory/data/archives   (kijken)
    git -C <repo> clean -fdx -- yoga-trainingen-directory/data/archives   (opruimen)
  `git clean` raakt nooit iets aan dat is vastgelegd.
```

`<repo>` is interpolated from `o.repoPath`, not printed literally: a command the
author has to complete by hand is one they can complete wrongly, in the one place
where a wrong path is a `clean` run against some other repository.

Three things about that, each load-bearing:

- **`git clean`, not `rm`.** Its safety property is structural rather than a matter
  of care: it cannot remove a tracked file, and everything ever archived is tracked.
  An instruction that depends on the author being careful in an evidence tree is the
  instruction that destroyed 364 lines of research.
- **`-x` is deliberate**, and paired with the gate's own `--ignored`. The private repo
  can inherit the public one's `.gitignore` — that possibility is why `git add
  --force` exists twenty lines further down. Without `-x`, a body the gate lists could
  be one `clean` silently declines to remove, and an instruction that appears to do
  nothing is worse than no instruction. It stays safe for the reason above: tracked
  files are untouchable either way.
- **The "always a copy" claim is held to a check, not asserted.** It is true of
  everything this code can produce — the source is still in `data/archives/`, so the
  destination copy is never the only exemplar of anything. But the gate also fires on
  files no version of this script wrote, and a universal claim that is merely usually
  true is not a sentence this project ships. The author verifies it per listed path;
  the dry run exists to make that possible.

This correction is what lets the disposition work without persistent state. The
specific message prints once, in a run whose output may have scrolled away days ago;
the gate's message has to be correct **without knowing what put the file there**, and
after this change it is.

### Two mechanisms considered and rejected

- **A resume marker.** The failing run records the paths it wrote and failed; the next
  run recognises them as its own debris and re-copies. No manual step — at the price
  of persistent on-disk state that survives a crash and can lie, and of the script
  overwriting a body in the destination. The moment Rule 2 has a carve-out keyed on a
  marker the script wrote itself, append-only stops being a property and becomes a
  promise.
- **Teaching the gate to classify.** The gate could hash each untracked body it finds
  and tell the author which are disposable. But its virtue is that it stops for
  anything it cannot account for, and its junk exclusion is by **name rather than
  pattern** precisely so it does not quietly grow to cover things that matter.
  Classification leads one obvious step further — *…so we can proceed* — and that step
  is #20 reopened.

## The test seam

`fs.copyFileSync` cannot be made to write short from inside a test, so the corrupt
landing needs a seam. `SyncOptions` gains a **`copyFile`** defaulting to
`fs.copyFileSync`, used for both the body and the receipt.

Direct precedent in this repo: `archive.ts` injects `Capture` with the comment
*"Injected so a test can drive captureNode without a browser — and, in #6, make the
capture fail on demand"*, and `SyncOptions` already carries `push: boolean` as a test
affordance. The alternative — exporting pass 3 and testing it in isolation — pins the
arithmetic and leaves the entire disposition (no commit, exit code, `added` still
populated, file left untouched) to a wiring assertion, which is the pattern issue #18
is open against.

One seam covers both causes, through the real `syncArchive()`:

```ts
// the short write
copyFile: (src, dst) => fs.writeFileSync(dst, fs.readFileSync(src).subarray(0, 4))

// the TOCTOU drift
copyFile: (src, dst) => { fs.writeFileSync(src, "de bron veranderde onder ons")
                          fs.copyFileSync(src, dst) }
```

The default is exercised by every other test in the file, so the seam cannot drift
away from the real thing unnoticed.

## Tests — `src/lib/sync-archive.test.ts`

| # | Test | Pins |
|---|---|---|
| 1 | a truncated landing: `mislanded` names it, **no commit is made**, exit non-zero | the headline |
| 2 | the mislanded file is still on disk **byte-for-byte as it landed**; so are the good copies and their receipts | never deletes, never repairs — the analogue of #20's leftover assertion |
| 3 | the failing body sorts **before** a good one: `added` holds both, `mislanded` only the first | pass 3 examines every file rather than stopping at the first failure. #20's sort trap, inverted |
| 4 | `added` is populated and `pushed` is false on a mislanded run | the return value describes the tree, not a tidier version of it |
| 5 | a **perfect body with a corrupt receipt** is mislanded too | a body-only fix is green on 1–4 and red here |
| 6 | the drifting fake: the message says the **source** changed, and does not say the copy broke | the diagnosis. A cause-blind message passes any test that only asserts "mislanded" |
| 7 | the run **after** a mislanded run: the gate refuses, names the paths, and does not tell the author to commit anything | the interaction — the deadlock is named and the advice is safe |
| 8 | a clean multi-body run still commits every body **and** every receipt, `mislanded` empty | pass 3 must not become a new way to stop backing evidence up |

Tests 1 and 5 are **demonstrated red** against the pre-fix code, not merely green
after it: the same fixtures must be shown to produce a commit containing the corrupt
artifact today. Since `mislanded` does not exist before the fix, "red" here means the
committed-corruption assertion, not a compile error.

## Non-goals

- **Deleting, moving, or repairing anything. Ever** — including the file that failed
  its own receipt. Beyond the append-only rule: that file is the only diagnostic
  evidence of the failure. A partial body whose length is 40% of its source says
  *disk full* to a human, and says nothing at all once it is gone.
- **Re-hashing a mismatching file into agreement.** Forbidden by CLAUDE.md, and the
  reason this check is worth having.
- **Committing the good copies from a failed run.**
- **Classifying inside the dirty-clone gate**, per above.
- **The unpushed-commit route to a false `up-to-date`** recorded in #20's second
  correction note (fetch works, push rejected, clean tree, local branch ahead of
  `origin/main`). Pre-existing, still open, still its own issue.
- **#19's question of where the source digest is read from.** Orthogonal: that is
  about how a `.sha256` is produced, this is about checking a copy against one.
- No change to Rule 1, Rule 2, `skipped`, `isBody`, or `IGNORABLE_JUNK`.

## Risk

This is the backup mechanism, and the two failure modes are opposite — the dangerous
one is not the bug being fixed. Too strict, and evidence silently stops being backed
up: the failure that once left 32 captures, including the two the published Yoga Den
price finding rests on, on a single laptop. Too permissive is today's bug.

Mitigations, in order:

1. Test 8 pins that a clean multi-body run still commits every body and every
   receipt. That is the regression that would matter most.
2. Tests 1 and 5 are demonstrated red first, so they show the defect rather than
   asserting its absence.
3. Pass 3 reads only what this run wrote, so a no-op run is untouched — and the
   corpus is currently clean: 465 bodies, 0 skipped, 0 refused, clone clean.
4. No file under `data/` is moved, re-hashed, or re-captured. The sync stays
   append-only, and gains no code path that removes anything.
