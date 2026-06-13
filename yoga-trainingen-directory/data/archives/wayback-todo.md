# Wayback-archivering — handmatige stap

Mijn fetch-toegang tot web.archive.org is geblokkeerd, dus deze submissions
moeten één keer met de hand. Elke link hieronder opent de Wayback "Save Page
Now" voor de betreffende bron — klikken, wachten op de snapshot, en de
resulterende `https://web.archive.org/web/<timestamp>/...`-URL in het
bijbehorende record bij `archived_url` zetten (bron-id staat erbij).

## Providerpagina's (5)

1. ~~arhanta-yoga / site-2026-06~~ — **GEBLOKKEERD: domein is uitgesloten van de
   Wayback Machine** (vastgesteld 2026-06-12; ook historische snapshots
   ontoegankelijk). Alternatief: [archive.today-submit](https://archive.ph/) →
   plak `https://www.arhantayoga.nl/yoga-opleiding-nederland/` + lokale PDF
   (Cmd+P) in `arhanta-yoga/`. Exclusie zelf is als feit genoteerd in het record.
2. [yoga-academie-nederland / site-2026-06](https://web.archive.org/save/https://yoga-academie.nl/Opleidingen/300-uur-Hatha-verdiepingsopleiding/)
3. [centre-body-mind / site-2026-06](https://web.archive.org/save/https://www.centrebodymind.nl/opleidingen/yoga-docentenopleiding)
4. [yogapoint / site-2026-06](https://web.archive.org/save/https://yogapoint.nl/yoga-docenten-opleiding/yoga-verdiepingsopleiding-300-uur/)
5. [namaste-studios / site-2026-06](https://web.archive.org/save/https://namastestudios.nl/yogadocentopleiding)

## Registers (3 — JS-gerenderd; Wayback-snapshot mogelijk incompleet, lokale evidence is leidend)

6. [namaste-studios / ya-school-profile-2026-06](https://web.archive.org/save/https://app.yogaalliance.org/schoolpublicprofile?id=001TR00000RyZ8DYAV&sid=001TR00000NnXqPYAV&name=Maayke-Vidts---Yoga)
7. [vyn erkende opleidingen](https://web.archive.org/save/https://www.yoganederland.nl/yogadocent-worden/erkende-yogaopleidingen/)
8. [crkbo register instellingen](https://web.archive.org/save/https://www.crkbo.nl/Register/Instellingen)

## Daarna routine

Bij elke nieuwe capture, ALTIJD beide: (1) publiek archiveren via
`https://web.archive.org/save/<url>` (of archive.today bij Wayback-exclusie),
én (2) een lokale kopie in `data/archives/<provider>/` — pas daarna het record
vullen. Publieke archieven zijn door de site-eigenaar met terugwerkende kracht
in te trekken (Arhanta bewees het); de lokale kopie niet, en git dateert haar.
Voor Salesforce/JS-pagina's is de lokale kopie (Cmd+P → PDF) zelfs het enige
echte bewijs: Wayback slaat daar een lege shell op.
