# Pilot Findings — 5 layer-1 records (2026-06-12)

Records: Arhanta Yoga, Yoga Academie Nederland, The Centre of Body & Mind, Yogapoint, Namasté Studio's (in `pilot/providers/`). Two intended providers were swapped out because their sites couldn't be fetched without a browser (De Nieuwe Yogaschool: timeout; Spark of Light: empty JS-rendered body).

## Schema changes the pilot demands

1. **Price needs variants, not one amount.** Hit immediately, twice: Arhanta has three accommodation tiers (€3.250/€3.650/€4.150), Namasté has member/non-member pricing (€2.800/€3.000). Proposal: `price.variants[] {label, amount_eur}` plus a designated `amount_eur` for the comparable base (cheapest generally-available, convention documented in methodology). Member pricing is itself an upsell-structure signal.
2. **`price.excludes` must be a first-class field.** Namasté excludes *mandatory* literature and studio lessons (while expecting attendance); Centre B&M excludes stiltedagen costs. Without `excludes`, `price_per_contact_hour` comparisons silently break. Arhanta conversely *includes* room and board — the includes/excludes pair is essential for comparability.
3. **`delivery.language` is missing.** Arhanta teaches in English, Namasté "Dutch or English depending on the group" — real consumer-relevant facts. Add `language: nl | en | mixed`.
4. **Program-level `prerequisites_claimed` is missing.** Centre B&M requires 2 years of practice; Yogapoint requires RYT-200 only for the full YA registration. Currently homeless in the schema.
5. **Coherence quad-states need an optional `note` per signal.** YAN's "ingangseisen per module verschillend" doesn't fit `required_sequence: yes/no` — the note carries the nuance without softening the quad-state.
6. **Modules sold by days, not hours.** YAN states only day counts (8 days, 5 days…). Add optional `days_claimed` to Module; hours stay null until published.
7. **Registrations need a `holder` field** *(added to spec)*. The YA register shows Namasté's RYS 200 is held by **"Maayke Vidts - Yoga"** (first registered Jan 2025) — the lead teacher personally, not the studio that markets the training. Who actually holds the registration is consumer-relevant (what happens to the program if the teacher leaves?) and only visible in the register, never in the marketing. Bonus from the same lookup: the YA school's 3 reviews are written by the same people as the testimonials on the studio's own site — a concrete illustration of why review scores reproduce marketing (§3). Register pages are JS-rendered (Salesforce) → registry verification needs browser tooling, and local PDF snapshots since Wayback may fail on them.

## What worked well (keep as is)

- **Quad-state earned its place in record one.** `supervised_teaching_practice: null + breakdown_published: not_published` across ALL five 200/300-hour programs — not one quantifies teaching practice. The doc's central thesis, confirmed empirically in an afternoon.
- **The claim-not-fact discipline caught real specimens:** Arhanta lists CRKBO in its *accreditation* list ("erkend door … CRKBO") — the §10 authority-laundering pattern, verbatim. Centre B&M's two payment routes imply different totals (€2.600 excl btw ≈ €3.146 incl vs. 10×€290 incl = €2.900) — recorded as quote, no accusation needed.
- **Coherence signals are cheap and discriminating.** Yogapoint filled all six from one page: free module order, staggered intakes, modules as bijscholing, bundle €3.993 < sum €4.356. YAN, also modular, profiles *differently* (capstone + scriptie + overkoepelend diploma) — the signals separate modular-coherent from modular-stacked, exactly as designed.
- **Cohort `status: announced` + source felt natural**, and full published date lists (Centre B&M, Namasté) make future `confirmed_ran` checks easy.

## Process findings

- **Time per entry: ~20–30 min**, slightly above the 15–20 estimate, mostly due to fetch retries. The extraction itself is fast.
- **Fetchability is a real constraint**: 2 of 7 sites needed a browser. The enumeration list should record fetchability; JS-heavy sites need browser tooling or Wayback fallback.
- **Provider city is often missing from the program page** (Arhanta, YAN) — layer 1 needs one extra fetch (contact page) per provider; or accept `city: null` at intake.
- **Archiving wasn't done in this pilot** (`archived_url: null` everywhere). Before anything is published, every cited URL must be archived — these records don't yet meet the publication bar.
- **Bonus finding for the dataset:** Arhanta's own page states ">21.000 afgestudeerden" and ">24.000" in different sections — same-page inconsistency, verbatim recordable.

## Recommended next step

Apply the six schema changes to `data-model-spec.md`, then write the Zod schemas — the pilot found the friction it was designed to find, and a second pilot round would likely hit diminishing returns.
