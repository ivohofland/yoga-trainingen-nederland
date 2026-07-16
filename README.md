# Yoga-docentenopleidingen — onafhankelijk onderzoek

Een onafhankelijk, feitelijk overzicht van yoga-docentenopleidingen in Nederland.

**Live: https://research.ivohofland.nl**

## Wat dit is

Een publicatie, geen database. Dit onderzoek legt vast wat aanbieders van
yoga-docentenopleidingen zélf publiceren — prijzen, uren, registerstatus,
toegangseisen — en houdt elke bewering aan één standaard: **letterlijk
geciteerd, met een gedateerde bron, en gearchiveerd als bewijs.** Er wordt hier
niets gerangschikt, gescoord of gesponsord.

Het doel is smal en eerlijk: het gat dichten tussen *wat een aanstaande student
ziet* (een logo, een prijs, een belofte) en *wat een aanstaande student kan
controleren*. Het overzicht laat zien wat verifieerbaar is, noemt bij elk
gegeven de bron, en legt in [de methodologie](https://research.ivohofland.nl/methodologie)
precies uit hoe er is gecontroleerd.

Dit onderzoek is zelf geen keurmerk. Geen kwaliteitsstempel, geen erkenning —
dat zou dezelfde denkfout zijn die het beschrijft: een signaal presenteren als
garantie. Wat het wél is: transparantie en overzicht.

## Uitgangspunten

Dit zijn geen stijlvoorkeuren. Ze zitten vast in het datamodel en de validatie,
en de build weigert data die ze schendt.

- **Beweringen staan er letterlijk, nooit gekarakteriseerd.** De woorden van een
  aanbieder worden opgeslagen als hún woorden, met een verplichte bron. Analyse
  van een bewering staat apart, onder een geversioneerde methodologie.
- **Een bevinding is geen gat.** "Wij keken; zij vermelden het niet" (een
  publiceerbare bevinding) en "nog niet onderzocht" (een gat in ons onderzoek)
  worden nooit hetzelfde getoond. Een negatieve bevinding blijft een gat tot ze
  is geverifieerd.
- **Bewijs wordt gearchiveerd vóórdat het wordt geciteerd** — altijd zowel
  publiek (Wayback / archive.today) als een lokale, door git gedateerde kopie.
  Een publiek archief kan door de site-eigenaar worden ingetrokken, en een hash
  bewijst dat een bestand ongewijzigd is maar kan het niet reproduceren.
- **Geen samengestelde scores. Nergens.** Er is bewust geen veld waar een totaal
  zou kunnen staan.
- **Een registratie is een gegeven over een merk, geen kwaliteitsgarantie.**
  Registervermeldingen (CRKBO, Yoga Alliance, de Nederlandse registers) worden
  als feit vastgelegd, en staan vaak op een andere juridische of persoonlijke
  naam dan de studio die je ziet — dus elke vermelding wordt in het register
  zelf opgezocht.

## Correcties

Staat er in een record iets dat feitelijk onjuist is, meld het dan — met iets
dat te verifiëren is. Correcties worden beoordeeld aan de hand van bronnen,
verwerkt in de openbare versiegeschiedenis, en nooit stilzwijgend doorgevoerd.
Het kanaal staat in de navigatie, niet verstopt in een voettekst:
**https://research.ivohofland.nl/correcties**.

## Notities

Langere stukken — bevindingen uit het onderzoek en achtergrond bij de sector,
zoals hoe je een Yoga Alliance-registratie leest — staan onder
**https://research.ivohofland.nl/notities** (met een RSS-feed op
`/notities/feed.xml`).

---

## Repository (for developers)

The repo is run as a **publication, not a database**: verbatim claims, mandatory
sources, archived evidence, and a published methodology are first-class
concerns, encoded directly in the data model.

**Layout**

- **Specs & research (root)** — `data-model-spec.md` (the source of truth for
  the model), `project-decisions.md` (decision log), `enumeration/` (the
  provider-universe candidate list), `pilot/` (original pilot records).
  `CLAUDE.md` documents the conventions for anyone — human or agent — working in
  the repo.
- **The application** — `yoga-trainingen-directory/`: a Next.js (App Router,
  static export) site plus the Zod schema, validation, archiving, and
  JSON-export tooling. See its own `README.md`.
- **Data** — one YAML file per provider under
  `yoga-trainingen-directory/data/providers/`; the brand name is the canonical
  identifier.
- **Archives** — snapshots under `data/archives/` are **not published**; the
  repo commits only their `.sha256` hashes (quoting verbatim is citaatrecht,
  Art. 15a Aw; mirroring a whole page is not). The bodies live in a separate,
  git-dated private archive.

**Public API** — the validated dataset ships as a static, versioned file at
`yoga-trainingen-directory/public/data/v1/providers.json` (served at
`/data/v1/providers.json`). Each programme carries a `derived` block computed by
the same rules the site renders from; read `derived.price_state` rather than the
raw published fields, so a `published: yes` with no captured amount is never
rendered as an established price.

**Running it** — all commands run from `yoga-trainingen-directory/`:

```bash
npm install
npm run validate   # parse + integrity-check every record
npm run dev        # local site on http://localhost:3000
npm run build      # gen-schema → validate → provenance → test → export → next build
```

See `yoga-trainingen-directory/README.md` and `CLAUDE.md` for the full workflow,
including the archiving pass.

**Use** — the data and code are public for transparency and scrutiny. Provider
claims are quoted under Dutch citation right; archived page bodies are not
redistributed. If you build on the data, preserve the finding-vs-gap distinction
— collapsing it is the one thing this project exists to prevent.
