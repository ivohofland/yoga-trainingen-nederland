# Verify the whole run before writing any of it

*Design for issue #20. Follows #7, which fixed what the sync **attests** to; this fixes what it **does**.*

## Goal

`scripts/sync-archive.ts` says, on a refusal:

> Er is NIETS gepusht.

and returns `added: []`. Rule 1's own comment puts it plainly: *"A body that fails its own receipt must never be pushed as though it satisfied it."*

But bodies are copied into the destination **inside** the loop, as each one verifies, while the refusal is decided **after** it. Every body that verified before the loop reached the failing one is already in the destination working tree when the run reports that nothing was pushed.

Nothing is committed or pushed, so the private repo's *history* stays correct. The leak is confined to the destination working tree — which is a real clone on disk, not a scratch buffer.

## Why it is worse than a stale file

The leftover is byte-identical to the source. So on the **next** run:

1. it matches, so it counts as `unchanged` and never enters `added`
2. with nothing else new, `added.length === 0`
3. the early return fires: **`up-to-date`, exit 0**

A body the author believes is backed up sits in a working tree, uncommitted and unpushed, while the run that should have said so reports completion and exits clean. That is the state #7 set out to eliminate, reached by a route #7 did not close.

Both halves were reproduced by execution during #7's final review (PROBE A and PROBE B), against both that branch and its merge base. **Pre-existing, and latent: the author's archive clone is currently clean and no refusal has ever fired on it.**

## Why it stayed invisible

Three tests assert the invariant and none exercises it:

- the Rule 1 refusal test — the fixture holds **one** body, so "not even the bodies that passed" has nothing to bite on
- the mixed skip+refusal test — its fixture is sort-ordered (`otherco` before `testco`) so neither body was ever a copy candidate ahead of the mismatch
- the append-only test — the same single-body shape

`localBodies()` sorts, so whether the leak fires depends entirely on filename order relative to the failing body. **Every fixture in this design must place a verifying body BEFORE a failing one.** A test that does not is indistinguishable from the ones that hid this for as long as the file has existed.

## The fix: two passes

**Pass 1 — decide. Writes nothing.**

Each body is classified into exactly one of four outcomes — `skipped`, `refused`, `unchanged`, or queued — by five conditions, since a refusal has two independent causes. No filesystem write occurs:

| Outcome | Condition |
|---|---|
| `skipped` | `publishedHash()` returns `null` (§#7 — a gap, not a finding) |
| `refused` | the body does not match its published hash (Rule 1) |
| `unchanged` | already in the destination, byte-identical |
| `refused` | already in the destination with **different** content (Rule 2) |
| queued to copy | none of the above |

**Rule 2 moves into pass 1 too, and that is not incidental.** It is a refusal, and today it fires mid-loop after earlier bodies may already have been copied — so it leaks exactly as Rule 1 does. A fix that moved only the hash check would leave half the defect in place.

Between the passes: if `refused` is non-empty, report and return. The destination has not been touched, so the message is true as written.

**Pass 2 — write. Decides nothing.**

For each queued body: create the directory, copy the body, copy its sidecar, record it in `added`.

## The cost this accepts, stated plainly

Today the destination is written from the exact buffer that was hashed. Splitting the passes means pass 2 re-reads the source, so **the bytes written are no longer provably the bytes verified** — a time-of-check/time-of-use window between the two passes.

This design accepts that window rather than engineering it away:

- The passes run back-to-back in one process, against a local directory the author is not editing concurrently. The only writer to `data/archives/` during a sync is the capture phase, which has already finished by the time `syncArchive()` runs — so the window is not "a process races us", it is "the author hand-edits the archive directory in the seconds between the two passes". The threat this project actually faces is a body that was already wrong before the run started, and pass 1 catches that.
- **And the residual is bounded, not silent.** If the source did change between the passes, the destination receives an unverified body — and the dirty-clone check below, landing in this same branch, makes the **next run refuse to proceed and name it**. The two changes reinforce each other.
- Holding the verified buffers instead would mean **386 MB across 466 bodies**, with a single body as large as 60 MB. That is worse.
- Re-verifying inside pass 2 would reintroduce a refusal *after* writes have begun — the exact shape being removed here.

`fs.copyFileSync` is used rather than `writeFileSync(dst, buf)`, so pass 2 never holds a body in memory at all.

## The dirty-clone route

The two-pass split stops this code from creating a leftover. It does not change the belief that made the leftover harmful: **`unchanged` is decided by presence in the destination working tree, not by whether anything was ever committed.** Any uncommitted body in that clone reads as "already archived".

After this fix that is the only remaining route to a false `up-to-date`, and it is reachable — a leftover written by the old code on another machine, an interrupted run, a hand-copied file. `ensureClone` runs `fetch`, `checkout` and `merge --ff-only`, none of which fail on a dirty working tree.

So: immediately after `ensureClone`, run `git status --porcelain` on the archive repo. If it is non-empty, stop — name the paths, explain, set a non-zero exit, return. A clean tree is the norm, because the sync commits everything it copies; a dirty one is a state nobody can account for, and syncing on top of it is how an unexplained file becomes permanent.

## One small extraction

Deriving the sidecar path from a body path would land in a **third** place in this file. Issue #12 already tracks that the sidecar parse exists in three copies across the repo; adding a fourth site while fixing an evidence bug is not defensible.

One local helper, used by both `publishedHash()` and pass 2. It does not close #12 and does not touch the other files #12 names.

## Tests — `src/lib/sync-archive.test.ts`

The fixtures are the deliverable here as much as the assertions.

| # | Test | Pins |
|---|---|---|
| 1 | Rule 1: a verifying body sorted **before** a mismatching one is **absent** from the destination | the defect. Fails against today's code |
| 2 | Rule 2: a verifying body sorted **before** an already-archived-different one is likewise absent | the half a hash-only fix would miss. Fails against today's code |
| 3 | #7's two `WHAT THIS DOES NOT PROVE` disclaimers retired, each message left accurate to its own fixture, each test pointing at the one that covers the rest | the claim becomes true of the *code* — but those two fixtures still hold no body that verifies ahead of the failure, so restoring the sweeping message there would be exactly as vacuous as before |
| 4 | a dirty archive clone: the run refuses, names the uncommitted paths, exits non-zero, copies nothing | the last route to a false `up-to-date` |
| 5 | a clean multi-body run still copies every body **and** every sidecar | the fix must not trade the bug for a worse one |
| 6 | the `unchanged` / `up-to-date` path is unaffected on a clean clone | the two-pass split does not disturb the no-op run |

Tests 1 and 2 must be confirmed red against the pre-fix code, not merely green after it.

## Non-goals

- **Deleting anything, ever.** Not leftovers, not on refusal, not on error. This script's defining rule is that it never removes from an evidence tree, and a fix that introduced deletion would be a worse defect than the one it closed.
- No change to Rule 1's or Rule 2's meaning, to the `skipped` disposition from #7, to `isBody`, or to what counts as a body.
- Not closing #12. One local helper, one file.
- Not the TOCTOU window above — accepted deliberately and documented, not left unnoticed.

## Risk

This is the backup mechanism, and the change moves the write step. The two failure modes are opposite: writing too little means evidence silently stops being backed up (the failure that once left 32 captures on one laptop); writing too eagerly is the bug being fixed.

Mitigations, in order:

1. Test 5 pins that a clean run still copies **every** body and **every** sidecar — the regression that would matter most.
2. Tests 1 and 2 are confirmed red before the fix, so they demonstrate rather than assert.
3. The corpus is unaffected either way: 465 bodies, 0 currently skipped, 0 refused, clone clean. Nothing about today's state changes.
4. No file under `data/` is moved, re-hashed, or re-captured. The sync stays append-only.
