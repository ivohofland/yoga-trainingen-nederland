/**
 * Every user-facing string, in one place. NL-only for now (spec §3.2): all
 * record notes in the dataset are Dutch, so the site is Dutch. Adding EN later
 * means adding a second keyed object here — not a refactor.
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
  statVerified: (d: string) => `records geverifieerd ${d}`,

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
  filterOwnFormat: "eigen vorm",
  hourSuffix: "u",
  monthsSuffix: "mnd",

  // Location + radius (spec §6.3). Replaces the design's four-city chip list.
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

  // Headings for what distance cannot describe (spec §6.4). Nothing is hidden.
  groupOnline: "Online — afstand niet van toepassing",
  groupUnplaceable: "Locatie niet vermeld — wij kunnen deze niet plaatsen",
  // Short inline label for a provider's city cell — distinct from
  // groupUnplaceable above, which is a section heading with longer wording.
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
  pphHoursNotPublished: "Niet te berekenen: wij keken — de aanbieder publiceert geen urenuitsplitsing.",
  pphPriceNotInRecord:
    "Niet te berekenen: de prijs ontbreekt in ons record — een gat in ons onderzoek, geen bevinding over de aanbieder.",
  pphHoursNotInRecord:
    "Niet te berekenen: de contacturen ontbreken in ons record — een gat in ons onderzoek, geen bevinding over de aanbieder.",

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
  secClaims: "Beweringen in het record",
  claimsNote:
    "Letterlijk geciteerd in de brontaal. Beweringen zijn genoteerd als bewering — nooit als feit.",
  secSources: "Bronnen",
  pubBar:
    "Publicatielat: elke kritisch geciteerde bron heeft zowel een publiek archief als een " +
    "gedateerde lokale kopie. Records die de lat niet halen worden gemarkeerd, niet verborgen.",
  notArchived: "nog niet gearchiveerd",
  archivePublic: "publiek",
  archiveLocal: "lokaal",
  sourcesHeading: (total: number, archived: number) =>
    `Bronnen (${total} · ${archived} publiek gearchiveerd)`,

  // Record row labels. Reuses colFormat / colDelivery / colPrice / colPph where
  // the listing already names the same field — one field, one word.
  rowStyle: "Stijl (geclaimd)",
  rowHours: "Urenuitsplitsing",
  rowSupervised: "Begeleide lespraktijk",
  rowAssessment: "Toetsing",
  rowGroupSize: "Groepsgrootte",
  rowPrerequisites: "Vooropleiding",
  rowComposition: "Samenstelling",
  rowContract: "Voorwaarden",
  rowTrackRecord: "Track record",
  rowAccreditation: "Accreditatie (geclaimd)",
  rowCohorts: "Cohorten",

  priceIncludes: "inclusief",
  priceExcludes: "exclusief",
  hoursTotal: "totaal",
  hoursContact: "contact",
  hoursSelfStudy: "zelfstudie",
  hoursSuffixLong: "uur",
  modulesSuffix: "modules",
  bundleDelta: (amount: string, below: boolean) =>
    `Pakketprijs ${amount} ${below ? "onder" : "boven"} de som van de losse modules.`,
  contractCancellation: "annulering",
  contractRefund: "terugbetaling",
  contractInstallments: "termijnen",
  contractInvoices: "factureert",
  since: "sinds",
  lastConfirmed: "laatst bevestigd",
  holderLabel: "houder",
  registerLabel: "register",
  checkedLabel: "gecontroleerd",
  analysisLabel: (status: string, version: string) => `analyse · ${status} · methodologie ${version}`,

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

  footLeft: "Geen totaalscores. Geen ranglijsten. Geen affiliate-links. Geen betaalde plaatsing.",
  footRight: "Onderzoek door Ivo Hofland",
  footGithub: "data, schema & methode op GitHub ↗",
  githubUrl: "https://github.com/ivohofland/yoga-trainingen-nederland",
} as const;
