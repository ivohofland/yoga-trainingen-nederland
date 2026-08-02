# A body the sync cannot verify is never pushed, and never attested to

*Design for issue #7 (the consumer half). The producer half — the archiver orphaning a body on process death — is filed separately.*

## Goal

`scripts/sync-archive.ts` pushes every body it cannot verify, and then commits a message asserting it verified them all.

```ts
const want = publishedHash(o.archiveDir, rel);
if (want && sha256(buf) !== want) { refused.push(…); continue; }
```

`publishedHash()` returns `null` when there is no published hash. **No hash ⇒ the guard is skipped ⇒ the body is pushed.** Every push then commits:

> elke body is geverifieerd tegen de .sha256 die publiek gepubliceerd is.

False for exactly those files — and a body nobody hashed is the one case the attestation must not cover.

It is worse than a false sentence. At `sync-archive.ts:174` the receipt is copied only `if (fs.existsSync(sidecarSrc))`, so an unhashed body does not merely arrive unverified: it arrives in the private archive **with no receipt at all**, under a commit message stating it has one.

## Why this matters here

The bodies are gitignored; the `.sha256` is the only part that ships publicly. The whole evidentiary claim is *a published hash is worth exactly as much as the surviving body, and this body matches the hash we published*. A push that quietly includes bodies outside that claim makes the one artefact this project offers as proof unreliable in a way no reader can detect.

## The condition: no published hash, not no sidecar

`publishedHash()` returns `null` down **two** paths, and only one is "there is no sidecar":

- `sync-archive.ts:101` — the sidecar file does not exist
- `sync-archive.ts:106` — the sidecar exists but lists no line for *this* filename

The second is reachable today: a hand-placed `.png` beside a sidecar listing only the `.html`, or any artifact whose capture wrote the sidecar before that file existed. A fix written as `!fs.existsSync(sidecar)` sails straight past it.

**The condition is `publishedHash(...) === null`.** One call, both routes, and it is the same function the verification already trusts — so the check and the guard can never disagree about what "published" means.

## The disposition: a third outcome, not a second kind of refusal

`SyncResult` gains `skipped: string[]`. It must not be folded into `refused`, because they are different claims:

- **`refused`** — the body **contradicts** its receipt (or contradicts dated evidence already archived). Something changed that must not have. **Nothing is pushed, for anyone**, and a human looks.
- **`skipped`** — the body **has** no receipt. Nothing contradicts; nothing is proven either. **That body alone** is left behind; every verified body still goes.

This is the project's own `not_published` vs `unknown` distinction — a finding versus a gap — applied to the code that guards the evidence rather than to the data. `src/lib/quad.test.ts` exists because those two must never render identically; the same reasoning binds here. Collapsing them would mean either one forgotten sidecar blocks every provider's backup, or a genuine mismatch stops being an emergency.

**Why skip rather than refuse everything** (decided 2026-08-02): a mismatch means evidence changed and everything must stop. A missing receipt usually means a step was forgotten, and the body is probably fine — blocking eleven verified bodies belonging to other providers punishes the wrong thing. The skipped body stays on one machine until it is hashed, which is the risk the sync exists to remove, so the report and the exit code have to make that impossible to miss.

## The commit message earns its sentence

The attestation is not deleted. Once unverifiable bodies are skipped, **every body in the commit really is verified**, so the existing sentence becomes true as written.

But the archive repo's history must not read as a complete backup when it was not. A run that skipped anything adds one line stating how many bodies were left behind and why. The private repo's own log then shows that this run was partial, without naming files it does not contain.

## What the fix makes provable

`sync-archive.ts:174` copies the receipt only `if (fs.existsSync(sidecarSrc))`. Once a body is pushed only when `publishedHash()` is non-null, the sidecar necessarily exists — the hash was just read from it. The conditional becomes unconditional.

Leaving the `if` would leave a live branch reading "sometimes a pushed body has no receipt", which is the state this design removes. A dead branch that describes an impossible state is how the next reader learns the wrong invariant.

## Reporting and exit code

Every skip is named, with what to do about it:

```
✗ archief: 1 body zonder gepubliceerde hash — NIET meegestuurd:
    tribes-academy/brochure-2026-08-02.pdf
  Een body zonder .sha256 kan niet geverifieerd worden.
  Draai `npm run archive` opnieuw, of hash hem, en push daarna.
```

`process.exitCode = 1`, as for `refused` — but **after** the push, not instead of it. That is the one structural difference between the two dispositions, and the place an implementation is most likely to get it wrong by copying the `refused` block.

**The "nothing to do" path is a second place this can go wrong.** When every new body was skipped, `added` is empty, and `sync-archive.ts:189` returns early with:

```
archief: up-to-date (N bodies al vastgelegd).
```

That sentence is false in exactly the way this design exists to stop: the run left work behind and reported completion. A run that skipped anything must never print it — the skip report and the non-zero exit apply on this path too, and "up-to-date" is reserved for a run with nothing skipped.

## Non-goals

- **Generating the missing sidecar.** A hash computed at push time attests to nothing: it hashes whatever is on disk now, which is the move CLAUDE.md forbids in as many words for mismatches. A receipt means something only once the **public** repo commits it, and the sync cannot do that.
- **The producer-side orphan.** `scripts/archive.ts` has no signal handlers, so a Ctrl-C or a kill between the `.html` write and `finishCapture` still leaves an orphan body. #6 closed the *exception* route only. Separate issue; this design makes such an orphan harmless at the push boundary rather than preventing it.
- **Where the digest is read from** — that is the open question in the `.html`-hashed-from-memory issue, and it is orthogonal: this design changes what happens when there is no hash, not how a hash is computed.
- No change to `refused` semantics, to Rule 2, or to `isBody`.

## Tests — `src/lib/sync-archive.test.ts`

The file already builds temp-dir fixtures with a real git repo in five tests, so every case is testable without touching the corpus.

| # | Test | Pins |
|---|---|---|
| 1 | a body with **no sidecar** is skipped, not pushed; a verified body in the same run still is | the headline behaviour, and that a skip is not a refusal |
| 2 | a body whose sidecar **exists but does not list it** is skipped too | the second `publishedHash` null route — the one a `existsSync` fix misses |
| 3 | a skipped body's bytes are **absent** from the destination repo | "not pushed" means not copied, not merely uncounted |
| 4 | a run with a skip sets a **non-zero exit code** and still pushes the verified bodies | the structural difference from `refused` |
| 5 | a run with a **mismatch** still pushes nothing, with a skip also present | the two dispositions do not contaminate each other |
| 6 | a partial run's **commit message** names the skip count; a clean run's does not | the archive's own history cannot read as complete when it was not |
| 7 | a run where **every** new body is skipped does not print "up-to-date" and still exits non-zero | the early-return path cannot report completion for a run that left work behind |
| 8 | a fully-hashed corpus skips **nothing** | the guard does not silently stop backing things up |

## Risk

This is the backup mechanism. Its two failure modes are opposite: too permissive and unverifiable bodies ship under a true-sounding attestation (today's bug); too strict and evidence silently stops being backed up — the failure that once left 32 captures, including the two the published Yoga Den price finding rests on, on a single laptop.

Mitigations, in order:

1. Test 7 pins that a fully-hashed corpus skips nothing.
2. Every skip is **named** and sets a non-zero exit code. A silent skip is the failure mode; there is no code path where one happens.
3. `refused` semantics are untouched, and test 5 pins that a skip cannot downgrade a refusal.
4. No file under `data/` is moved, re-hashed, or re-captured by this work. The sync is append-only and stays that way.
