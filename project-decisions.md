# Project Decisions & Known Gaps

*Decision log following the helicopter review (2026-06-12). Companion to `data-model-spec.md` and `yoga-opleidingen-directory-overwegingen.md`.*

| # | Topic | Decision | Status |
|---|---|---|---|
| 1 | Reader / distribution strategy | Real gap, consciously deferred. No distribution plan yet; revisit before or around first publication. Candidate wedge: explainer content ("wat betekent 200 uur?", "is CRKBO een keurmerk?") that funnels into the directory. | **Known gap — parked** |
| 2 | Scope / inclusion criteria | Start with official 200/300/500-hour teacher trainings (the YA format categories). Smaller formats (50/85/100hr specializations as standalone offerings) added later; YACEP claim verification later. Enumeration of the provider universe (YA directory, VYN list, CRKBO register, Maps) is an open task. | **Decided — phased** |
| 3 | Legal operations & AVG | Operate like a publication from day one: published complaints/correction procedure, defined right-of-reply window, AVG awareness for the Person entity (journalistic exemption requires actually behaving journalistically), local PDF snapshots alongside Wayback, consider media liability insurance before layer 3 goes live. | **Decided — adopt** |
| 4 | Sustainability / maintenance | Hobby project; no year-2 commitment can be made now. Accepted risk. Mitigation available if needed later: archive entries that can no longer be verified rather than letting `last_verified` decay silently. | **Accepted risk** |
| 5 | Methodology page | Founding deliverable. Must exist publicly before the first critical/assessed content is published. Versioned (`methodology_version` in the schema points at it). | **Decided — sequenced before publication** |
| 6 | Goodhart / metric gaming | Anticipated from the start: once metrics matter, schools will market them and claims will inflate. Defense is structural: verbatim quotes + mandatory sources, claims never stored as fact, and the transparency meta-axis (hardest to game). Schema already encodes this; treat rising verification pressure as a success signal. | **Decided — designed in** |
| 7 | Reader corrections + public change history | In from the beginning. Lightweight "meld een fout" route; validated reader reports enter the dataset as a source (`reader_report` source type). Per-record change history derived from git and shown publicly as a trust feature. | **Decided — adopt** |
| 8 | Web-presence bias | Acknowledged in the methodology, with the counterpoint: publishing a curriculum requires no web design budget — a plain PDF suffices. Transparency is a legitimate demand on the school, not a website-quality contest; `not_published` therefore remains a fair finding. The inquiry workflow is the correction channel for schools that publish little but respond honestly. | **Decided — position taken** |

## Open tasks emerging from this review

1. ~~Write inclusion criteria into the spec~~ — done (spec §0).
2. ~~Pilot with real providers~~ — done 2026-06-12 (`pilot/`); spec revised to v0.2 with seven schema changes.
3. ~~Build the provider-universe enumeration list~~ — first pass done 2026-06-12 (`enumeration/`): 93 candidates from YA (56), VYN (11), CRKBO (40) + listicles/pilot. Open: remaining listicles, Maps sweep, per-provider CRKBO/KvK verification, YA-negatives (Yogapoint, Delight) resolven.
4. ~~Write the Zod schemas~~ — done 2026-06-12 (`yoga-trainingen-directory/`): Next.js scaffold, Zod schemas, integrity checks, 5 pilot records migrated en gevalideerd, JSON-export als statische API.
5. Retro-archive pilot sources (Wayback + local PDF), then archive-at-capture as routine.
6. ~~Draft the public methodology page (v0.1)~~ — concept staat in `yoga-trainingen-directory/content/methodologie.md` (2026-06-12). Open daarin: definitieve wederhoor-termijn (concept: 4 weken).
7. Draft the complaints/correction procedure page — precedes publication.
8. Define the right-of-reply window convention (concept: 4 weken) — precedes first inquiry batch. **Besloten (2026-06):** voorafgaand wederhoor alleen bij *beoordelingen* (laag 3); basisvermeldingen verschijnen zonder voorafgaand wederhoor met open correctiekanaal — anders is breadth-first onwerkbaar en het betreft enkel hun eigen gepubliceerde gegevens.
