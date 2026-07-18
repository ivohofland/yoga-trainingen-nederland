/**
 * Every user-facing string, in one place. NL-only for now: all record notes in
 * the dataset are Dutch, so the site is Dutch. Adding EN later means adding a
 * second keyed object here — not a refactor.
 *
 * No user-facing string may be inlined in a component.
 */
export const nl = {
  overline: "Onafhankelijk onderzoek · Nederland",
  title: "Yoga-docentenopleidingen",
  navDirectory: "Overzicht",
  navMethod: "Methode",

  statProviders: "aanbieders",
  statPrograms: "opleidingen",
  statRegisters: "getoetst aan openbare registers (CRKBO, Yoga Alliance, VYN)",
  // The verification WINDOW, both ends — never the newest alone. "records
  // geverifieerd jul 2026" was the max over 48 records of which 46 were jun 2026:
  // a claim about the corpus carried by two records, and one re-verification next
  // year would have re-dated all 48. A range cannot overstate: the oldest end is
  // the floor every record clears.
  statVerified: (oldest: string, newest: string) =>
    oldest === newest
      ? `records geverifieerd ${oldest}`
      : `records geverifieerd ${oldest}–${newest}`,

  intro:
    "Een feitelijk overzicht van yoga-docentenopleidingen, samengesteld uit " +
    "websites van aanbieders en openbare registers. Beweringen staan er letterlijk, " +
    "nooit gekarakteriseerd. Er wordt hier niets gerangschikt, gescoord of gesponsord.",
  legend:
    "“niet gepubliceerd” = wij keken; de aanbieder vermeldt het niet — een bevinding. · " +
    "“nog niet onderzocht” = een gat in ons onderzoek, nooit getoond als bevinding.",

  sortLabel: "Sorteer",
  sortUpcoming: "eerstvolgende start",
  sortAlphabetical: "A–Z",
  sortPph: "€ / contactuur",
  sortVerified: "laatst geverifieerd",

  filterFormat: "Uren-format",
  filterLanguage: "Voertaal",
  filterMode: "Uitvoering",
  filterRegister: "Registerstatus",
  filterPrice: "Prijs (gepubliceerd)",
  // `other` — the programme uses an hour format outside 200/300/500. That is what
  // the record says, so this is what the page says.
  formatOther: "eigen vorm",
  // `none` — the programme carries NO hour-format label. It used to render "eigen
  // vorm" too, which invents a claim the record does not make (they are not said
  // to have a form of their own), and made two chips over disjoint sets look
  // identical. See formatDisplay() in presenters.ts.
  formatNone: "geen uren-label",
  hourSuffix: "u",
  monthsSuffix: "mnd",

  // Location + radius. Replaces the design's four-city chip list — see
  // docs/superpowers/plans/2026-07-11-public-listing.md.
  filterLocation: "Afstand",
  postcodePlaceholder: "postcode, bijv. 3512",
  postcodeInvalid: "Geen geldige Nederlandse postcode.",
  postcodeUnknown: "Deze postcode kennen we niet.",
  // The PC4 table is lazy-loaded; that import can fail (offline, cache miss,
  // a stale chunk after a deploy). It must SAY so — a filter that silently
  // does nothing is worse than one that admits it broke.
  postcodeLookupFailed: "De postcodetabel kon niet worden geladen. Probeer het opnieuw.",
  postcodeNote:
    "De postcode blijft in uw browser — er wordt niets verstuurd. " +
    "Coördinaten uit open data van CBS/PDOK.",
  radius25: "25 km",
  radius50: "50 km",
  radius100: "100 km",
  radiusAll: "heel NL",
  sortDistance: "afstand",
  distanceAway: (km: number) => `${km.toLocaleString("nl-NL", { maximumFractionDigits: 0 })} km`,

  // Headings for what distance cannot describe. Nothing is hidden — see
  // docs/superpowers/plans/2026-07-11-public-listing.md.
  groupOnline: "Online — afstand niet van toepassing",
  // ONE heading used to cover both reasons a row has no distance:
  // "Locatie niet vermeld — wij kunnen deze niet plaatsen". Over a provider who
  // DID state a city that our tables cannot geocode, that is a false statement
  // about a named business — printed directly above a row whose own city cell
  // shows the location the heading says was never given. The two reasons are now
  // two groups, and the second one owns the miss as ours. See Placement in geo.ts.
  groupNoCity: "Locatie niet vermeld — het record noemt geen plaats",
  groupNoCentroid: "Plaats wél vermeld, maar niet in onze locatiedata — een gat in ons onderzoek",
  // Short inline label for a provider's city cell — distinct from
  // groupNoCity above, which is a section heading with longer wording.
  cityNotListed: "locatie niet vermeld",
  farExcluded: (n: number) =>
    `${n} ${n === 1 ? "opleiding valt" : "opleidingen vallen"} buiten deze straal.`,
  filterYaVerified: "YA register-geverifieerd",
  filterCrkbo: "CRKBO-geregistreerd",
  filterUnder3000: "onder €3.000",
  filterFrom3000: "€3.000 en hoger",
  filterPriceNotPublished: "niet gepubliceerd",

  // €/contactuur, when there is no computable value. The first two are FINDINGS
  // about the provider — used when the record's blocking *published* field says
  // `not_published` OR `no`, which on such a field mean the same thing: wij
  // keken, zij publiceren het niet. The last two are GAPS in ons onderzoek and
  // say so in as many words. Never swap them — see pphQuad() in presenters.ts.
  //
  // These are display copy, deliberately fuller than the terse diagnostic
  // dataset.ts returns alongside a null value: that one is worded identically
  // for a finding and for a gap, so it can never be shown to a reader as-is.
  pphPriceNotPublished: "Niet te berekenen: wij keken — de aanbieder publiceert geen prijs.",
  // "geen CONTACTUREN", not "geen urenuitsplitsing" (spec v0.4). The blocking field
  // is `hours_claimed.contact_published`, and three aanbieders publish a rich
  // urenuitsplitsing — per onderdeel, per werkvorm, in bandbreedtes — waar geen
  // contactuur-getal in staat. Zeggen dat zij "geen urenuitsplitsing publiceren" is
  // een onware bewering over een met naam genoemd bedrijf; de zin moet het veld
  // noemen dat de berekening werkelijk blokkeert.
  pphHoursNotPublished: "Niet te berekenen: wij keken — de aanbieder publiceert geen contacturen.",
  pphPriceNotInRecord:
    "Niet te berekenen: de prijs ontbreekt in ons record — een gat in ons onderzoek, geen bevinding over de aanbieder.",
  pphHoursNotInRecord:
    "Niet te berekenen: de contacturen ontbreken in ons record — een gat in ons onderzoek, geen bevinding over de aanbieder.",
  // De derde blokkade (spec v0.5): wél een bedrag, maar per periode — en geen
  // gepubliceerd aantal perioden. Dan is er geen totaalprijs om door de contacturen
  // te delen, en er een verzinnen is precies wat v0.5 verbiedt. Dit is een BEVINDING
  // over de aanbieder (zij publiceren het aantal niet), en de zin moet het veld
  // noemen dat werkelijk blokkeert: niet de prijs — die publiceren zij wél.
  pphNoTotalPrice: (period: string) =>
    `Niet te berekenen: de aanbieder publiceert een prijs per ${period} en niet uit hoeveel ` +
    `perioden de opleiding bestaat — er is geen vergelijkbare totaalprijs.`,

  /* ---------- Prijs per periode en de afgeleide totaalprijs (spec v0.5) ---------- */

  /** De eenheid die het bedrag koopt. `total` krijgt geen achtervoegsel: dát bedrag
   *  IS de prijs, en "€ 2.450 / totaal" is ruis. */
  pricePeriod: {
    total: "totaal",
    per_year: "studiejaar",
    per_module: "module",
    per_day: "dag",
  } as const,
  /** Het bedrag dat de aanbieder ZELF noemt, met de eenheid die zij eraan hangen. */
  pricePerPeriod: (amount: string, period: string) => `${amount} / ${period}`,
  /**
   * ONZE REKENSOM, en de zin zegt dat zelf. Een lezer mag dit getal nooit aanzien
   * voor een bedrag dat de aanbieder publiceert — zij publiceren geen totaalprijs.
   * Het "±" en de uitgeschreven vermenigvuldiging staan er om die reden in, en de
   * pagina zet het bovendien in een eigen, zichtbaar niet-feitelijke stijl.
   */
  priceDerivedTotal: (total: string, working: string) => `± ${total} totaal — ${working}`,
  /** De uitgeschreven som, zodat de lezer haar kan narekenen. */
  totalPriceWorking: (periods: number, amount: string) => `onze berekening: ${periods} × ${amount}`,
  /** Geen aantal perioden gepubliceerd → geen totaal. Een bevinding over hen, geen
   *  gat bij ons: `periods: null` betekent "wij keken; zij noemen het niet". */
  totalPriceNoPeriodCount: (period: string) =>
    `Geen vergelijkbare totaalprijs: de aanbieder publiceert een prijs per ${period} en niet ` +
    `uit hoeveel perioden de opleiding bestaat.`,

  /* ---------- De DERDE afleiding: de som van ONGELIJKE delen (spec v0.8, §6) ---------- */

  /**
   * DE PRIJZEN DIE ZIJ WEL NOEMEN, zoals zij ze noemen: per deel. Adhouna's Yin XL kost
   * "€ 1.420,00 incl. BTW" (Deel I) + "€ 1.305,00 incl. BTW" (Deel II) en géén totaal —
   * dus toont de rij Prijs precies die twee bedragen, in hún inkt, met hún bron. Het
   * totaal staat een rij lager, in de onze.
   */
  pricePerModuleParts: (parts: string[]) => parts.join(" + "),
  /**
   * De uitgeschreven OPTELLING, zodat de lezer haar kan narekenen — en zodat niemand
   * € 2.725 kan aanzien voor een bedrag dat op de pagina staat. Het staat er niet: de
   * pagina drukt alleen de delen af. Vermenigvuldigen kan dit niet uitdrukken (2 × 1.420
   * is geen 2.725), en precies daarom stond de som eerst in `amount_eur` — in de inkt van
   * de school, geciteerd aan een pagina die haar nooit noemt.
   */
  totalPriceSum: (parts: string[]) =>
    `onze optelling: ${parts.join(" + ")}. De aanbieder publiceert de delen apart en ` +
    `noemt hun som niet.`,
  /** Een deel zonder gepubliceerde prijs → geen som. Een onvolledige optelling is een
   *  gok, en een gegokt totaal is een gepubliceerde vergelijking met een gat erin
   *  (dezelfde regel die `bundleDelta` al hanteert). */
  totalPriceIncompleteSum:
    "Geen vergelijkbare totaalprijs: de aanbieder prijst per module en niet elke module " +
    "heeft een gepubliceerde prijs — een onvolledige optelling zou een gok zijn.",

  /* ---------- Wat het kost om HIER te kwalificeren (spec v0.9, §6) ---------- */

  /**
   * HET GETAL WAAR DE LEZER VOOR KWAM. `total_price` beantwoordt "wat kost deze
   * opleiding"; een opleiding waaraan je niet mag beginnen zonder eerst een ándere
   * opleiding te kopen, beantwoordt die vraag niet. de Yogaschool: € 4.590 voor de
   * Docentenopleiding, en je mag pas beginnen "na het volbrengen van de Basisopleiding"
   * (€ 1.590 per lesjaar). Docent worden kost daar € 6.180.
   *
   * ALTIJD ONZE OPTELLING — ook waar de opleiding zélf een gepubliceerde totaalprijs
   * heeft: het PAD is nooit hun getal. € 6.180 staat op geen enkele pagina van deze
   * school. Het label, de "±" en de uitgeschreven optelling zeggen dat, en de pagina zet
   * het bovendien in de eigen, zichtbaar niet-feitelijke inkt.
   */
  rowTotalPathCost: "Totaal om te kwalificeren (onze optelling)",
  /** De rij op de lijst, in één regel: "± € 6.180 om te kwalificeren — incl. verplichte …". */
  priceDerivedPathCost: (total: string, working: string) => `± ${total} om te kwalificeren — ${working}`,
  /** Het afgeleide pad-totaal op de recordpagina. */
  pathCostDerivedTotal: (total: string) => `± ${total} om te kwalificeren`,
  /** De uitgeschreven optelling: welke verplichte opleiding(en) erbij zitten, en voor
   *  hoeveel — zodat de lezer haar kan narekenen en niemand € 6.180 kan aanzien voor een
   *  bedrag dat de school publiceert. */
  totalPathCostWorking: (gates: string[]) =>
    `incl. verplichte ${gates.join(" + ")}. Onze optelling — de aanbieder publiceert dit ` +
    `totaal niet.`,
  /** Eén schakel zonder gepubliceerde prijs → geen pad-totaal. Een onvolledig pad-totaal
   *  is een gok, en een gegokte vergelijking is erger dan geen (dezelfde regel als
   *  `bundleDelta` en de optelling van ongelijke delen). */
  totalPathCostIncomplete:
    "Geen vergelijkbaar totaal om te kwalificeren: van ten minste één verplichte " +
    "voorafgaande opleiding is de prijs niet vastgelegd — een onvolledige optelling zou " +
    "een gok zijn.",

  /* ---------- De afgeleide totaaluren (spec v0.6, §6) ---------- */

  /**
   * DEZELFDE REGEL, ANDERE EENHEID. De school publiceert contacturen en zelfstudie-uren
   * apart en noemt hun som nergens; wij tellen op, en het label zegt dat hardop. Waar de
   * school het totaal WÉL publiceert (Wahé: 500) staat dat gewoon in de rij
   * "Urenuitsplitsing" hierboven, als hún claim — deze rij verschijnt dan niet.
   */
  rowTotalHours: "Totaaluren (onze optelling)",
  rowScheduleCeiling: "Ingeroosterde uren (onze telling)",
  rowHoursDisconnect: "Verschil met geclaimde uren",
  /** De uitgeschreven som, zodat de lezer haar kan narekenen. */
  totalHoursWorking: (contact: number, selfStudy: number) =>
    `onze optelling: ${contact} contacturen + ${selfStudy} zelfstudie-uren. De aanbieder ` +
    `publiceert deze twee getallen apart en noemt hun som niet.`,
  /** Het afgeleide totaal zelf. Het "±" en het label zeggen samen wiens getal dit is. */
  hoursDerivedTotal: (hours: number) => `± ${hours} uur`,

  /* ---------- Rooster: het plafond op contacturen en het verschil (spec §6, v0.12) ---------- */

  /** De uitgeschreven telling per blok, zodat de lezer haar kan narekenen. "Ten hoogste":
   *  contacturen zijn nooit méér dan de tijd in de zaal, en alleen opgegeven pauzes zijn eraf. */
  scheduleCeilingWorking: (parts: string[]) =>
    `onze telling: ${parts.join(" + ")}. Ten hoogste — contacturen zijn nooit meer dan de ` +
    `ingeroosterde tijd, en alleen de opgegeven pauzes zijn afgetrokken.`,
  /** Het plafond zelf. "Ten hoogste" en het label zeggen samen dat dit ONS getal is, en een bovengrens. */
  scheduleCeilingValue: (hours: number) => `ten hoogste ${hours} uur`,
  /** Het verschil: geclaimd totaal minus het plafond. Een ONDERgrens (het plafond is een bovengrens). */
  hoursDisconnectValue: (hours: number) => `minstens ${hours} uur niet ingeroosterd`,
  hoursDisconnectWorking: (total: number, ceiling: number) =>
    `de school claimt ${total} uur; het gepubliceerde rooster beslaat ten hoogste ${ceiling} uur, ` +
    `dus ten minste ${Math.round((total - ceiling) * 100) / 100} uur valt buiten het rooster ` +
    `(zelfstudie, en wat verder niet is ingeroosterd).`,

  /* ---------- €/contactuur en de contactratio: ALTIJD van ons (spec §6) ---------- */

  /**
   * GEEN ENKELE SCHOOL PUBLICEERT DIT GETAL. €/contactuur is de prijs gedeeld door de
   * contacturen — een deling die wij uitvoeren, over twee getallen die zíj publiceren.
   * Toch stond het jarenlang op ~40 recordpagina's in dezelfde inkt als hun eigen claims,
   * één rij onder hun echte prijs. Bij een prijs per studiejaar is het bovendien onze
   * rekensom óver onze rekensom: (3 × € 1.530) ÷ 360.
   *
   * De uitgeschreven deling zegt dat hardop, en de pagina zet het getal in de eigen,
   * zichtbaar niet-feitelijke inkt.
   */
  pphWorking: (total: string, contact: number) =>
    `onze berekening: ${total} ÷ ${contact} contacturen. Dit getal publiceert de aanbieder ` +
    `niet; wij delen hun prijs door hun contacturen.`,
  /** Contacturen ÷ totaaluren. Ook van ons — en waar het totaal zélf onze optelling is
   *  (de Yogaschool: 360 + 240), is dit onze rekensom over onze rekensom. */
  contactRatioWorking: (contact: number, total: number) =>
    `onze berekening: ${contact} contacturen ÷ ${total} uur totaal.`,

  // Same rule, applied to the price itself: the record says de aanbieder
  // publiceert een prijs, maar het bedrag staat niet in ons record. Dat gat is
  // van ons, en de regel zegt dat — in plaats van een kale “ja” die een bedrag
  // belooft dat er niet is.
  priceAmountNotInRecord:
    "De aanbieder publiceert een prijs; het bedrag ontbreekt in ons record — een gat in ons onderzoek, geen bevinding over de aanbieder.",

  colProgramme: "Opleiding",
  colFormat: "Format",
  colDelivery: "Uitvoering",
  colPrice: "Prijs",
  colPph: "€ / contactuur",
  colRegister: "Registerstatus",

  noResults: "Geen opleidingen voldoen aan de huidige filters.",
  clearFilters: "Filters wissen",
  resultLine: (progShown: number, progTotal: number, provShown: number, provTotal: number) =>
    `${progShown} van ${progTotal} opleidingen · ${provShown} van ${provTotal} aanbieders`,
  priceFootnote: (computable: number, total: number) =>
    `Prijzen zijn niet direct vergelijkbaar: de btw-behandeling en wat de prijs omvat ` +
    `verschillen per aanbieder. Prijs per contactuur is berekenbaar voor ${computable} van ` +
    `${total} opleidingen — de meeste aanbieders publiceren geen urenuitsplitsing. ` +
    `Die afwezigheid is zelf een bevinding.`,

  backAll: "← Alle opleidingen",
  depthLabel: "onderzoeksdiepte",
  lastVerifiedLabel: "laatst geverifieerd",
  disclosureLabel: "Belangenverstrengeling",

  secRegisters: "Registers & verificatie",
  secProgrammes: "Opleidingen",
  secCoherence: "Samenhang — zes controleerbare signalen",
  secCoherenceNote:
    "Geen oordeel “samenhang: hoog/laag”. De signalen staan er; u weegt zelf.",
  secTransparency: "Wat de aanbieder publiceert",
  secContract: "Voorwaarden",
  // Beweringen staan bij het ding waarover ze gaan. Een bewering met scope
  // `program:300-advance` onder de 200u-opleiding lezen is misattributie — het
  // record verankert de scope, dus de pagina doet dat ook (zie claimsByScope).
  secClaims: "Beweringen over de aanbieder",
  secClaimsProgramme: "Beweringen over deze opleiding",
  claimsNote:
    "Letterlijk geciteerd in de brontaal. Beweringen zijn genoteerd als bewering — nooit als feit.",
  claimScopeProvider: "over de aanbieder",
  claimScopeModule: (id: string) => `over module ${id}`,
  // No `secSources: "Bronnen"` here: the sources section is headed by
  // sourcesHeading(), which carries the two archive counts. A bare "Bronnen"
  // constant beside it is a second heading nothing renders — and an invitation
  // to render the one that omits the counts.
  pubBar:
    "Publicatielat: elke kritisch geciteerde bron heeft zowel een publiek archief als een " +
    "gedateerde lokale kopie. Records die de lat niet halen worden gemarkeerd, niet verborgen.",
  // Both halves of the bar are printed for every source, so a half that is
  // missing is visible instead of quietly reading as satisfied. Some registers
  // (Yoga Alliance, CRKBO) are JS-gerenderd of uitgesloten van Wayback — daar is
  // de lokale kopie het enige bewijs dat mogelijk is. Dit is verslag van ons
  // eigen dossier, geen verwijt aan de aanbieder.
  pubBarSlots:
    "Per bron staan beide helften vermeld: “publiek” is het openbare archief, “lokaal” de " +
    "gedateerde kopie in ons eigen dossier. Een “—” betekent dat die helft er niet is. " +
    "Sommige registers zijn JS-gerenderd of uitgesloten van Wayback; daar is de lokale " +
    "kopie de enige mogelijke vastlegging.",
  // The citation beside a fact. The methodology promises "Bij elk gegeven staat
  // een bron en een datum" and "je kunt elke bron zelf naslaan" — so every
  // sourced field carries a link to the source entry at the bottom of the page,
  // by the source's own id. Deliberately quiet, and deliberately NOT a quad
  // colour: provenance is not an accusation. It is mono/muted, like a footnote
  // marker, because that is what it is.
  sourceCite: (id: string) => `bron: ${id}`,
  sourceCiteTitle: (id: string) => `Bron ${id} — spring naar de bronnenlijst onderaan deze pagina`,

  notArchived: "nog niet gearchiveerd",
  archivePublic: "publiek",
  archiveLocal: "lokaal",
  archivePresent: "✓",
  /** WE HAVE NOT DONE IT — a gap in our work, and it must not be spelled like the next one. */
  archiveAbsent: "—",
  /** IT CANNOT BE DONE — Wayback cannot capture a Salesforce register or a search page with
   *  no per-row permalink, so the local capture is the only evidence that can exist. Printing
   *  this as "—" reported a correct decision of ours as a hole in our research, on twelve
   *  sources. Same rule as the quad: a finding is not a gap. See archiveSlots(). */
  archiveNotApplicable: "n.v.t. (niet vast te leggen)",

  /* ---------- right of reply (§4.9/§12, v0.11) ----------
   * Three states, three sentences, and they must never collapse into each other. "Wij
   * wachten nog" is a fact about US. "Geen reactie" is a finding about THEM — and it is
   * published with both dates, because a silence you cannot check is not evidence, it is
   * an insinuation. */
  inquiriesHeading: "Wederhoor",
  inquiriesIntro:
    "Bevindingen over een school leggen we vóór publicatie aan die school voor. Vraag, " +
    "termijn en antwoord staan hieronder — ook als er geen antwoord kwam.",
  inquiryType: {
    correction_request: "correctieverzoek",
    question: "vraag",
    right_of_reply: "wederhoor",
  } as const,
  /** OURS: the window is open. Says nothing whatsoever about the provider. */
  inquiryAwaiting: (respondBy: string) => `in afwachting van reactie (termijn tot ${respondBy})`,
  /** THEIRS, and a finding: asked on X, given until Y, silent. Both dates, always. */
  inquiryNoResponse: (sent: string, respondBy: string) =>
    `voorgelegd op ${sent}, geen reactie binnen de gestelde termijn (tot ${respondBy})`,
  inquiryAnswered: "beantwoord door de school",
  inquiryReplyHeading: "Reactie van de school",

  /* ---------- the correction route (methodology "Wederhoor en correcties") ----------
   *
   * The copy is the imported design's, and it is good — the in-scope/out-of-scope line
   * especially: a correction channel that will entertain "please remove that verbatim
   * quote" is not a correction channel, it is a takedown queue.
   *
   * TWO OF THE DESIGN'S STRINGS ARE NOT SHIPPED, because they describe a machine we do not
   * have. Its confirmation screen said "Het verzoek is gelogd bij dit record … U hoort
   * terug op het opgegeven adres." Nothing here logs anything automatically and nothing
   * dispatches a reply: this is a static export, and the honest sentence is that a person
   * reads it. A button that promises what it cannot do is the same false statement this
   * project hunts everywhere else — pointed, for once, at the reader. */
  corr: {
    navLabel: "Correcties",
    heading: "Correctie aanvragen",
    intro:
      "Staat er in een record iets dat feitelijk onjuist is, vertel dan wat — en wijs op " +
      "iets dat te verifiëren is. Correcties worden beoordeeld aan de hand van bronnen, " +
      "niet van voorkeur.",
    /** The line that makes this a correction channel rather than a takedown queue. */
    scope:
      "Binnen scope: feitelijke fouten (prijzen, btw, uren, registerstatussen, cohortdata, " +
      "citaten). Buiten scope: toon, de volledigheid van positieve informatie, en verzoeken " +
      "om letterlijke citaten te verwijderen — een citaat met bron is geen fout.",
    publicHeading: "Openbaar melden",
    publicBody:
      "Een formulier op GitHub. Verzenden maakt een openbaar, gedateerd correctieverzoek aan " +
      "en ik krijg er bericht van. Het blijft staan — ook als ik het afwijs. Dat is het punt: " +
      "stilzwijgende correcties bestaan hier niet. (U heeft er wel een GitHub-account voor nodig.)",
    publicCta: "Formulier openen",
    privateHeading: "Vertrouwelijk melden",
    privateBody:
      "Geen GitHub-account, of geen zin om een bevinding in het openbaar aan te vechten? Een " +
      "school hoort daar niet toe gedwongen te worden — haar zwijgen zou dan gaan lijken op " +
      "instemming. Mailen kan dus ook, met dezelfde velden. Het verzoek zelf blijft privé; de " +
      "correctie die eruit volgt niet.",
    privateCta: "Stuur een e-mail",
    /** What actually happens. No auto-logging, no automatic reply — say so. */
    processHeading: "Wat er daarna gebeurt",
    recordLink: "Correctie van dit record aanvragen",

    issueTitle: (name: string) => `Correctieverzoek: ${name}`,
    tplRecord: "Record",
    tplUrl: "Brongegevens (YAML)",
    tplField: "Betreffend veld",
    tplWrong: "Wat is onjuist",
    tplRight: "Voorgestelde correctie",
    tplEvidence: "Bewijs-URL",
    tplEvidenceHint:
      "een pagina, registervermelding of document dat wij kunnen controleren — " +
      "een melding zonder verifieerbaar bewijs kan een record niet wijzigen",
    tplRole: "Uw relatie tot deze opleiding",
    fieldOptions: [
      "prijs/btw",
      "uren/uitsplitsing",
      "accreditatie/registers",
      "cohortdata",
      "een geciteerde claim",
      "anders",
    ],
    roleOptions: ["vertegenwoordiger aanbieder", "(oud-)student", "particulier", "anders"],
  },

  /* ---------- Notities (veldnotities) — spec 2026-07-16 ----------
   * A writing section: research dispatches + sector explainers. NL-only, in the
   * project's voice. The author NAME is AUTHOR_NAME in src/lib/site.ts (shared
   * with the JSON-LD); byPrefix here is just the word "door". */
  notes: {
    navLabel: "Notities",
    eyebrow: "Veldnotities",
    title: "Notities",
    lead:
      "Bevindingen uit het onderzoek en achtergrond bij de sector — bijvoorbeeld hoe je " +
      "een registervermelding leest. Elk stuk noemt zijn bron.",
    empty:
      "Nog geen notities. Ze verschijnen hier zodra er iets te melden valt — met bron, " +
      "zoals de rest van deze site.",
    filterLabel: "Filter op categorie",
    allCategories: "Alle",
    rssLabel: "RSS",
    backLink: "← Alle notities",
    byPrefix: "door",
    readTimeSuffix: "leestijd",
  },
  // Never one number: a count of public archives alone reads as archive coverage,
  // and the bar is BOTH halves. Both counts, side by side, over the total.
  sourcesHeading: (total: number, publicArchived: number, localCopies: number) =>
    `Bronnen (${total} · ${publicArchived} met publiek archief · ${localCopies} met lokale kopie)`,

  // Record row labels. Reuses colFormat / colDelivery / colPrice / colPph where
  // the listing already names the same field — one field, one word.
  rowStyle: "Stijl (geclaimd)",
  /** Het label zegt wiens getal het is. De aanbieder publiceert geen totaalprijs —
   *  wij vermenigvuldigen, en de rij draagt daarom géén bron (spec §6). */
  rowTotalPrice: "Totaalprijs (onze berekening)",
  rowHours: "Urenuitsplitsing",
  rowSupervised: "Begeleide lespraktijk",
  rowAssessment: "Toetsing",
  rowGroupSize: "Groepsgrootte",
  rowPrerequisites: "Vooropleiding",
  /** De gestructureerde toegangseis (spec v0.9) — één rij per eis, mét bron. De rij
   *  hierboven is hún proza en draagt geen bron; deze eis is een OPTELPOST in een prijs
   *  die wij publiceren, en dan is de pagina die haar stelt niet optioneel. */
  rowPrerequisiteGate: "Toegangseis",
  /**
   * Wat voor soort hindernis dit is — en het verschil is geld.
   *
   * `program` = een opleiding die je eerst moet KOPEN (de Yogaschool: de Basisopleiding,
   * € 1.590). Die telt mee in "Totaal om te kwalificeren". `experience` = een echte
   * hindernis zonder prijskaartje ("min. 2 jaar praktijk"). `other` = een kwalificatie die
   * de markt verkoopt maar DEZE aanbieder niet ("afgeronde RYT200") — een gate die geld
   * kost, alleen niet aan hen: haar prijzen met hún eigen 200u-opleiding zou een route
   * beweren die zij nergens eisen.
   */
  prerequisiteKind: {
    program: "verplichte voorafgaande opleiding — telt mee in het totaal",
    experience: "ervaringseis (geen aankoop)",
    other: "kwalificatie die deze aanbieder zelf niet verkoopt — geen bedrag opgeteld",
  } as const,
  rowComposition: "Samenstelling",
  rowTrackRecord: "Track record",
  rowAccreditation: "Accreditatie (geclaimd)",
  rowCohorts: "Cohorten",

  priceIncludes: "inclusief",
  priceExcludes: "exclusief",
  /** A base price plus N variants — the count includes the base itself. */
  priceVariants: (n: number) => `${n} varianten`,
  groupSizeMin: (n: number) => `min ${n}`,
  groupSizeMax: (n: number) => `max ${n}`,
  /**
   * The cohort line. Both surfaces build it HERE — the listing's next-cohort cell
   * and the record page's Cohorten row — and both must name the status: an
   * announced cohort is not a cohort that ran (§8), and a bare date reads as one
   * that does.
   */
  cohortLabel: (month: string, status: string) => `${month} — ${status}`,
  /** The same line on the listing, where it is the NEXT start rather than a log entry. */
  nextCohortLabel: (month: string, status: string) => `start ${month} — ${status}`,
  /**
   * DE PRIJS ZOALS DIE TOEN GOLD (spec v0.7, §4.5 `price_at_time`).
   *
   * Een prijs die tussen twee cohorten veranderde is een BEVINDING over de school, geen
   * correctie om weg te werken. Bluebirds' cohort van 2025 werd verkocht voor "€3150,-
   * Excl BTW" op de eigen site van de docent; het cohort van 2026 voor "0% VAT as we are
   * CRKBO registered" onder Bluebirds BV. Twee runs, twee btw-behandelingen — en zonder
   * deze rij had die verandering nergens te wonen (het veld stond in 0 records en werd
   * nergens getoond). De rij draagt de bron van het cohort zelf: wat er stond, stond
   * daar toen.
   */
  cohortPriceAtTime: (amount: string, vat: string) => `prijs toen: ${amount} · ${vat}`,
  hoursTotal: "totaal",
  hoursContact: "contact",
  hoursSelfStudy: "zelfstudie",
  hoursSuffixLong: "uur",
  modulesSuffix: "modules",
  bundleDelta: (amount: string, below: boolean) =>
    `Pakketprijs ${amount} ${below ? "onder" : "boven"} de som van de losse modules.`,
  contractInvoices: "factureert",
  since: "sinds",
  lastConfirmed: "laatst bevestigd",
  holderLabel: "houder",
  registerLabel: "register",
  checkedLabel: "gecontroleerd",
  // The analysis stamp. It carries the date the analysis was MADE, not just the
  // methodology version: /methodologie promises the reader "een bron én een
  // datum", and an analysis is the one thing on the page that is ours rather than
  // the provider's — so when we formed it is exactly what a reader needs to weigh
  // it. `reviewed` was carried into the view and rendered nowhere.
  analysisLabel: (status: string, reviewed: string, version: string) =>
    `analyse · ${status} · beoordeeld ${reviewed} · methodologie ${version}`,

  crkboRegister: { instelling: "instelling", docent: "docent" } as const,

  composition: {
    single_program: "één samenhangende opleiding",
    fixed_modular: "vaste modules",
    free_assembly: "vrij samen te stellen",
  } as const,

  // Layer 3, methodology-versioned — never applied to a quote itself (spec §3).
  analysisStatus: {
    accurate: "juist",
    unsubstantiated: "niet onderbouwd",
    misleading: "misleidend",
    regulated_claim: "gereguleerde claim",
  } as const,

  sourceType: {
    website: "website",
    wayback: "wayback",
    brochure: "brochure",
    register: "register",
    inquiry_response: "antwoord op navraag",
    reader_report: "lezersmelding",
    email: "e-mail",
    other: "overig",
  } as const,

  depth: { listed: "basisvermelding", reviewed: "onderzocht", assessed: "beoordeeld" } as const,

  cohortStatus: {
    announced: "aangekondigd",
    confirmed_ran: "bevestigd gedraaid",
    cancelled: "geannuleerd",
    unknown: "status onbekend",
  } as const,

  vat: {
    incl: "incl. btw",
    exempt_crkbo: "btw-vrij (CRKBO)",
    excl: "excl. btw",
    unknown: "btw onbekend",
  } as const,

  mode: { in_person: "op locatie", online: "online", hybrid: "hybride" } as const,

  structure: {
    weekends: "weekenden",
    evenings: "avonden",
    intensive: "intensief",
    modular: "modulair",
    mixed: "gemengd",
  } as const,

  body: {
    yoga_alliance: "Yoga Alliance",
    vyn: "VYN",
    crkbo: "CRKBO",
    other: "overig",
  } as const,

  claimCategory: {
    scientific: "wetenschappelijk",
    health_outcome: "gezondheidsbelofte",
    income_outcome: "inkomensbelofte",
    accreditation: "accreditatie",
    lineage_authority: "lineage / autoriteit",
    scope_of_practice: "behandelpretentie",
    other: "overig",
  } as const,

  coherence: {
    required_sequence: "Verplichte volgorde",
    single_cohort_intake: "Eén vast startmoment per groep",
    integrative_assessment: "Toetsing die de onderdelen samenbrengt",
    continuous_lead_teacher: "Doorlopende hoofddocent",
    modules_sold_separately: "Modules ook los verkocht",
    bundle_price_below_sum: "Pakketprijs lager dan som van de modules",
  } as const,

  transparency: {
    syllabus_published: "Syllabus",
    hours_breakdown_published: "Urenuitsplitsing",
    assessment_criteria_published: "Toetscriteria",
    reading_list_published: "Leeslijst",
    teacher_bios_published: "Docentbio’s",
  } as const,

  // One quad, one row — never one sentence. Joining quad LABELS into a string and
  // handing it to the page as a single fact strips a finding of its colour and
  // would render a gap as a fact.
  //
  // The keys ARE the schema's, and presenters.ts type-checks that: CONTRACT_LABELS
  // is typed `Record<ContractQuadKey, string>` against the schema's own contract
  // shape, so a quad-bearing key in the schema with no label here is a COMPILE
  // ERROR. It was not, and `min_participants` — the clause under which a training
  // someone has paid for gets cancelled — was researched, sourced and rendered
  // nowhere for exactly that reason.
  contract: {
    cancellation_published: "Annuleringsvoorwaarden",
    refund_published: "Terugbetalingsregeling",
    min_participants: "Minimum aantal deelnemers",
    installments_published: "Betaling in termijnen",
  } as const,

  /** The `value` beside contract.min_participants.clause, when the record holds one. */
  minParticipants: (n: number) => `minimaal ${n} deelnemers`,

  footLeft: "Geen totaalscores. Geen ranglijsten. Geen affiliate-links. Geen betaalde plaatsing.",
  footRight: "Onderzoek door Ivo Hofland",
  footGithub: "data, schema & methode op GitHub ↗",
  githubUrl: "https://github.com/ivohofland/yoga-trainingen-nederland",
} as const;
