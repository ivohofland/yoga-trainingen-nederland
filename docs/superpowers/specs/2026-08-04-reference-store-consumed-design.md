# A citation that leads nowhere is not a citation

*Design for issue #9. The shared reference store (spec §4.1b, v0.13) is validated but consumed by nothing.*

## Goal

`loadReferences()` has exactly two callers: `scripts/validate.ts` and `loader.test.ts`. No route, no component, not `src/lib/api.ts`, not `export-json.ts`. There is no references page and the export ships no reference block.

Being prose-cited rather than `source:`-resolvable was deliberate — the provenance gate keys on *this provider's own cited page*, and a normative document is evidence about the **rule**, never about the school. That reasoning holds. Three consequences of it did not.

**1. Reader-facing citations lead nowhere.** `tribes-academy.yaml` carries **8 reference-id mentions across 3 field paths** — measured, not estimated:

| count | path |
|---|---|
| 2 | `registrations[0].note` |
| 3 | `programs[0].hours_claimed.note` |
| 3 | `programs[0].hours_claimed.schedule.note` |

All shipped verbatim in `public/data/v1/providers.json` and rendered on the record page. A reader meets an evidence pointer on the strongest sentences the site prints about a named business, and it resolves to nothing.

This is the `inquiries[]` failure the spec already records at v0.11: *"had existed since v0.1 and no surface had ever rendered one, which is the same as not having it."*

**2. Nothing checks a cited id exists.** Rename or delete a reference file and `validate` stays green while three notes cite a document the repo does not hold. `collectSourceRefs` does exactly this for `source:` refs; references have no counterpart.

**3. An evidence-free reference validates green.** No `local_snapshot` produces 0 errors and increments the count. There is no `depth` equivalent and no publication bar — so a normative document quoted at length in `note:`, and through it in the published methodology, could be entirely unevidenced. All five current records do hold evidence; the rule is absent, not violated.

**And the sharpest instance is the methodology itself.** `content/methodologie.md` asserts the Yoga Alliance rule in published prose — naming the help-desk article and the 300/500 standard — from documents this repo holds, and cites none of them.

## The citation form: `[[ref:<id>]]`

Marked, inline, wherever prose lives.

The alternative — pattern-matching bare ids against the known set — was rejected for one reason: **it cannot detect a break.** A renamed reference leaves the old id sitting in prose as plain text; it silently stops being a link, which is precisely the regression the check exists to catch. Intent has to be stated to be verifiable.

Hoisting the ids into a structured `references: [...]` field was rejected too: three of the 8 sit mid-sentence, attached to one specific claim inside a long note. A field loses which sentence each supports, which is the thing a reader most needs.

```yaml
note: >
  … als "classroom hours" moeten gelden ([[ref:ya-application-guide-2026-07]]).
  Daarbij sluit YA uitdrukkelijk uit: …
```

**The loader scans every string in a provider record**, not only `source.note`. A source-scoped scan misses all 8 real citations; so does a scan of top-level notes, because `programs[0].hours_claimed.schedule.note` sits four levels deep. Recursing the whole record is the only version of this check that binds on the data it exists for. Every `[[ref:X]]` must resolve to a loaded reference id, or `integrityErrors` reports it.

## Rendering, and the failure this introduces

One shared helper converts markers to links, used by **both** the record page and the methodology page.

This is new syntax in reader-facing prose, and it brings a failure mode that does not exist today: **a surface that renders prose without the helper shows a reader a literal `[[ref:ya-standards-2026-07]]`** — visibly worse than the current dead-but-innocuous id. A test therefore asserts that no rendered surface emits a raw marker, and that test is load-bearing, not hygiene.

Links resolve to `/referenties#<id>`.

## The export

`toApiPayload` gains a `references` block beside `providers`, and notes ship **with their markers intact**.

The combination is what makes the marker meaningful rather than mysterious markup: the payload carries its own referents, so a consumer can resolve every citation without this repo. Either half alone is worse than neither — stripping the markers loses the citation, and shipping them with no block leaves a consumer holding syntax it cannot resolve.

## `/referenties`

In the shape of `/notities`: each document with its `title`, `publisher`, `type`, `captured`, `url`, its archive state, `applies_to`, `supersedes`/`superseded_by`, and its `note`. Anchored by id so `#ya-standards-2026-07` resolves.

Archive state renders through the union #8 introduced, so a reference whose public archive is genuinely impossible says so with its reason, rather than reading as an ungathered gap — two of the five are exactly that case.

## The evidence bar

`local_snapshot` becomes **required** on `Reference` (`src/schema/index.ts:146`).

`public_archive` is already required since #8, and `impossible` is a legitimate public half — a JS-shell help-centre article cannot be publicly archived, and saying so is a finding. The **local** copy is the half that can never be honestly absent: it is what the whole evidentiary chain rests on, and a normative document quoted in published prose with no capture behind it is exactly what §3 forbids.

All five records already comply, so this pins a rule without moving data.

## `methodologie.md` gets its citations

The page states the YA classroom-hours rule and the observing/assisting reading as published fact. Both rest on documents in `data/references/`. It gains `[[ref:…]]` markers on those claims and a version bump, per its own convention.

## Tests

| # | Test | Pins |
|---|---|---|
| 1 | an unresolvable `[[ref:X]]` is an `integrityErrors` entry | the rename regression, which is the whole point of a marked form |
| 2 | a resolvable one produces no error | the check does not fire on correct data |
| 3 | the scan reaches a marker in `registrations[].note`, not only `source.note` | a source-scoped scan would have missed all 8 real citations |
| 4 | a `Reference` without `local_snapshot` fails the schema | the evidence bar, pinned while nothing violates it |
| 5 | **no rendered surface emits a raw `[[ref:` marker** | the failure this design introduces |
| 6 | the export carries a `references` block, and every id cited in any note appears in it | the payload can resolve its own citations |
| 7 | `/referenties` has an anchor for every loaded reference | the links land |

## Non-goals

- **Making references `source:`-resolvable.** Spec §4.1b decided this deliberately and the provenance gate depends on it: provider integrity keys on "this programme's own cited page", and a normative document is evidence about the rule, not about the school.
- No change to what any of the five documents say, nor to which documents exist.
- No `depth` field for references. The evidence bar is a floor, not a maturity ladder; §4.1b's records are either held or they are not.

## Risk

The reader-facing surface changes, and the new marker is the risk. Its two failure directions are asymmetric: a marker rendered raw is **visible** and embarrassing but harmless to the record's truth; a marker silently dropped removes a citation from a claim about a named business while the sentence still reads as sourced. Test 5 catches the first; the loader's resolution check plus test 6 catch the second.

Mitigations, in order:

1. Test 5 asserts no surface emits a raw marker — run against the real corpus, not a fixture, so a new note anywhere is covered.
2. Test 6 pins that every cited id reaches the export, so a consumer can always resolve what it is shown.
3. The 8 existing citations are rewritten in one file, and the loader's check fails the build if any is mistyped — so the migration cannot half-land.
4. No file under `data/archives/` is touched. This changes records, prose and surfaces, never evidence.
