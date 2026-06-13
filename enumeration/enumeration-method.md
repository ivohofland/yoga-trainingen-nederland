# Provider Enumeration — Method & Coverage (2026-06-12)

**Result: 93 candidate providers** in `providers-enumeration.csv`, deduplicated across four source types plus the pilot.

## Sources harvested

| Source | Captured | Yield | Coverage status |
|---|---|---|---|
| **Yoga Alliance directory** (app.yogaalliance.org, country = Netherlands) | all 6 pages, full text | 56 RYS schools, with designations + first-registered dates | Complete for "Netherlands" search. **Caveat:** the URL carries `searchRadius=50` — possibly a radius from a country centroid rather than a true country filter. Known YA-claiming schools missing from the list (Yogapoint, Delight) need individual lookup before concluding anything. |
| **VYN erkende yogaopleidingen** (yoganederland.nl) | full grid, browser | 11 schools | Complete as of capture. |
| **CRKBO register instellingen** (crkbo.nl), name search "yoga" | all 4 pages | 40 institutions | **Structurally incomplete by design** — only finds entities with "yoga" in the registered name. Exempt providers registered under a BV/holding/person name (e.g. The Centre of Body & Mind, prijst excl. btw) are invisible to this search. CRKBO status must therefore be verified per provider via their legal name (KvK); this column is a seed, not a verdict. |
| **Yogakrant listicle** (partner content) | 1 page | ~10 names, 4 new | Names only — their judgments are marketing (the site sells partnerships, visible in its own nav). More listicles (Happy with Yoga, Flowin'Motion, Sport&People) not yet harvested. |
| **Pilot + manual candidates** | — | 5 + 2 | Saswitha and Delight added as known names needing verification. |

## Key findings from the merge

1. **The registration-holder mismatch is systemic, not incidental.** Specimens found in one afternoon: DNYS → RYS held by "Johan Noorloos Teachertraining", CRKBO held by "De Nieuwe Yogaschool Online B.V."; Namasté → RYS held by "Maayke Vidts - Yoga"; CRKBO entries with t.h.o.d.n./h.o.d.n. constructions (Yoga Maarssen, Raja Yoga opleiding, Yogacollege Tilburg). Several recent RYS registrations are simply personal names (Evalien Slinkert, Olav Aarts, Beatrice Savaris & Moena De Jong). The `holder` field is doing real work.
2. **Two parallel accreditation universes.** Only 3 of 11 VYN schools also hold a YA registration (SanaYou, YAN, Spark of Light, You are the Buddha — 4 actually). The VYN world (4-year, hatha-traditional) and the YA world (200hr-format) barely overlap — relevant for the directory's framing and for the format_label scope decision.
3. **Negative findings need verification before use.** Yogapoint claims "erkend door Yoga Alliance" but does not appear in the YA Netherlands list; Delight Yoga likewise absent. Possible explanations: registration under a different holder name, lapsed registration, or the radius caveat. Per the quad-state discipline: these are `unknown`, not `no`.
4. **Scale of the universe: ~90–120 providers** once remaining listicles, Maps, and online-only providers are added. At 20–30 min per layer-1 entry, full breadth ≈ 35–55 hours of entry work.

## Still to do

1. Harvest remaining listicles (Happy with Yoga, Flowin'Motion, Sport&People) for additional names.
2. Google Maps sweep per province for studios marketing "docentenopleiding" without any registration (the unregistered tail).
3. Per-provider CRKBO verification via legal names (KvK lookup where needed).
4. Resolve the YA negatives (Yogapoint, Delight) via direct directory name-search.
5. Fetchability column: currently only known for sites visited; fill during layer-1 entry.
