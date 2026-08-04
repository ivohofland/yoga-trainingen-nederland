# A missing public archive is either a finding or a gap, and the record must say which

*Design for issue #8. The quad rule — `not_published` vs `unknown` — applied to the field the whole evidentiary posture rests on.*

## Goal

`archived_url: z.string().url().nullable().optional()` has **three** states for **two** meanings, and `null` carries two *opposite* editorial meanings:

- **A gap.** Spec §4.1 and CLAUDE.md: `archived_url: null` = "consciously not yet archived … such records do not meet the publication bar."
- **A finding.** `loader.ts` *instructs* the author to write `null` for Wayback-pointless sources, where the local capture is the evidence and the absence is publishable — a Salesforce-rendered register whose Wayback snapshot is 525,967 bytes of JavaScript containing 78 characters of visible text, none of it the article.

That is `not_published` collapsed into `unknown`, in the one field the archive discipline rests on, in a project whose central rule is that those two must never render identically. `.optional()` on top adds a third state the loader treats identically to `null`.

## Why this is not type hygiene

Measured over the current corpus (48 providers, 232 sources, 5 references):

| | now | after |
|---|---|---|
| providers showing a red ✗ on `/qa` | **46 of 48** | **10 of 48** |
| sources honestly accounted for on the record page | **111 of 232** | **220 of 232** |

`derive.ts`'s `unarchivedSources` counts every `archived_url == null`, including the 107 that can never be archived, and `/qa` paints a red ✗ for any provider with one. Nearly every provider carries a YA register or CRKBO register source, so nearly every provider is red — **for archives that cannot exist**. A signal that is red for 46 of 48 is not a signal.

The public record page understates the project's own rigour by roughly half for the same reason: a Salesforce shell Wayback genuinely cannot capture is counted identically to a page nobody got round to submitting.

## The shape

`archived_url` is replaced by `public_archive`, **required**, on both `Source` (§4.1) and `Reference` (§4.1b):

```ts
const PublicArchive = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("archived"),   url: z.string().url() }),
  // A FINDING: no public archive can evidence this page. `reason` is REQUIRED and exists
  // on no other variant, so "impossible with no reason" does not compile.
  z.object({ kind: z.literal("impossible"), reason: z.string().min(1) }),
  // A GAP: not yet attempted. No `url` key, no `reason` key — nothing to read by accident.
  z.object({ kind: z.literal("not_yet") }),
]);
```

Required rather than optional, so the three records that currently omit the key must declare which they are. The variants carry **different key sets** — the same discipline `derive.ts` already applies to `totalPrice`: a consumer that reads `url` when present is right by construction rather than by accident.

## The reason: stored, required, and cross-checked

For 107 of the 111 impossibles the reason is derivable from the URL by `waybackPointlessReason()`, and spec §6 says computed values are never stored. But it is not derivable for all of them — the Tribes gated brochure and three author-supplied images have no URL at all, and a future robots.txt block or paywall would be derivable from nothing.

So: **stored and required, and cross-checked where it can be.**

```
loader, per source:
  url is Wayback-pointless?  reason must equal waybackPointlessReason(url), else ERROR
  url absent?                any reason accepted — no public page exists to archive
  otherwise?                 any reason accepted — robots.txt, paywall, login wall
```

The 107 therefore cannot drift away from the function that generated them, "impossible with no reason" still does not compile, and the non-derivable cases stay expressible. This repo has had to correct drifted derived prose twice in recent work; the cross-check is what stops a third.

## Migration — every source in 53 files

The field is renamed, so **all 237 records change shape**, not only the 123 whose meaning was ambiguous. Classified mechanically from the current data:

| count | becomes | which |
|---|---|---|
| 114 | `archived` | `archived_url` already set — a mechanical rewrap, no judgement |
| 107 | `impossible` | URL matches `WAYBACK_POINTLESS` — YA register, CRKBO register, YA help centre. Reason from `waybackPointlessReason(url)` |
| 4 | `impossible` | no public URL at all: the Tribes gated brochure, and three author-supplied images (the 3 records that omit the key entirely) |
| 12 | `not_yet` | ordinary sites with a live URL, simply never submitted — 12 sources spread across **10** providers, which is why the `/qa` red count lands on 10 rather than 12 |

**The migration must preserve comments and formatting.** `scripts/archive.ts` already edits these files in place with `parseDocument` + `node.set`, which does; a naive `parse` → `stringify` would silently drop every comment in the corpus. The migration uses the same mechanism, and the verification is that `git diff` touches **only** `archived_url`/`public_archive` lines. Anything else in the diff means the rewriter ate something.

The 10 gaps stay gaps. Archiving them is real work and belongs to whoever does it; the red ✗ becomes a **work list of 10** instead of noise across 46.

## Spec before schema

CLAUDE.md is explicit that `data-model-spec.md` is the source of truth and changes first. It goes to **v0.14**: the §4.1 and §4.1b field tables, and the §4.1 sentence *"null = consciously not yet archived"* — the sentence that encoded the conflation and is what a reader consults to learn the rule.

## Consumers

Every one of these reads `kind`, never truthiness:

- **`derive.ts` `unarchivedSources`** — counts only `not_yet`. This is the 46 → 10 correction.
- **`presenters.ts`** — the per-source line already renders *"publiek n.v.t. (niet vast te leggen)"*, but by calling `waybackIsPointless(s.url)` itself. It reads the record's `kind` instead, so the rendering follows the record rather than re-deriving a judgement the record now carries. `sourcesArchivedPublic` stops counting an impossible archive as a shortfall.
- **`app/qa/page.dev.tsx`** — `s.archived_url ? …` is the lazy-truthiness path CLAUDE.md names as the wrong one. Reads `kind`.
- **`loader.ts`** — both existing cross-checks rewrite against `kind`, gaining the direction described above.
- **`scripts/archive.ts`** — currently decides whether to submit to Wayback by `archived == null`. It submits only for `not_yet`, and **must never overwrite an `impossible`**: the record's finding outranks the archiver's optimism, and a re-run must not silently convert a published finding into a Wayback URL that evidences nothing.

## Tests

| # | Test | Pins |
|---|---|---|
| 1 | `impossible` without `reason`, and `archived` without `url`, are rejected | the union's key sets are the guarantee |
| 2 | a stored reason that differs from `waybackPointlessReason(url)` is a loader error | the 107 cannot drift from the function |
| 3 | an `impossible` with **no** URL accepts any reason | the gated brochure and the author images stay expressible |
| 4 | `unarchivedSources` counts `not_yet` only, not `impossible` | the `/qa` correction, and the reason this matters |
| 5 | `not_yet` and `impossible` do not render identically | the quad rule itself, in this field |
| 6 | the archiver submits for `not_yet` and leaves an `impossible` untouched | a finding is not overwritten by a re-run |
| 7 | every record in the corpus parses, and the counts match the migration table | the migration did what it claimed |

## Non-goals

- **Archiving the 10 gaps.** Separate work, and it needs the network.
- **Changing `WAYBACK_POINTLESS` membership.** Its entries were each measured; this design consumes it, it does not revise it.
- No change to `local_snapshot`, to the archive discipline itself, or to what `depth` means.
- Not a general "evidence state" refactor. One field, two meanings, separated.

## Risk

237 data records and one required schema field, touching the loader, the archiver, both rendering surfaces and the QA page. The failure modes are asymmetric: a migration that mislabels a **gap as a finding** publishes "no public archive is possible" about a page that simply was not submitted — a false statement about our own diligence, and exactly the kind this project exists not to make. The reverse is merely noisy.

Mitigations, in order:

1. The 107 are classified by the same predicate the loader then cross-checks, so a mislabel there fails the build rather than shipping.
2. The 16 non-mechanical records — 4 `impossible`, 12 `not_yet` — are enumerated in the plan by file and id, and each is decided explicitly rather than by rule.
3. `git diff` after the migration must touch only the field's own lines.
4. `npm run validate`, `npm run provenance` (✓ 165/165), `npm test`, `npm run test:ci` and `npm run build` all green — and `/qa`'s red count must land on exactly 10, which is the assertion that the fix did what the measurement predicted.
5. No file under `data/archives/` is touched at all. This is a change to records, never to evidence.
