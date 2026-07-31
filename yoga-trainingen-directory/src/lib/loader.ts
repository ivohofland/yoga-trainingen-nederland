/**
 * Dataset loader: reads /data/providers/*.yaml, validates against the Zod schema,
 * and runs the referential-integrity checks Zod cannot express.
 *
 * THE IMPURE HALF, and the only one. `node:fs` lives here and nowhere else, so
 * that the derived values (`derive.ts`) and the finding-vs-gap rule (`rules.ts`)
 * stay importable by the client filter island and by `scripts/export-json.ts` —
 * see the header of derive.ts for why that matters more than it looks.
 *
 * Nothing is derived here. Derived values are computed in derive.ts and NEVER
 * stored (spec §6).
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { Provider, Reference } from "../schema";
import { waybackIsPointless, waybackPointlessReason } from "./wayback";

const DATA_DIR = path.join(process.cwd(), "data", "providers");
const REFERENCE_DIR = path.join(process.cwd(), "data", "references");

export interface LoadResult {
  providers: Provider[];
  errors: string[];
}

export interface ReferenceLoadResult {
  references: Reference[];
  errors: string[];
}

/** Recursively collect values of `source` keys (string refs to sources[]). */
function collectSourceRefs(node: unknown, refs: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectSourceRefs(item, refs);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "source" && typeof value === "string") refs.add(value);
      else if (key !== "sources") collectSourceRefs(value, refs);
    }
  }
}

/** The checks Zod cannot express. Exported so the tests can put a record THROUGH
 *  them — a check that only ever runs over data that already passes it is a check
 *  whose failure branch nothing has proven. */
/**
 * `today` is a PARAMETER, not a call to the clock, and the one rule that needs it says why:
 * "you may not publish a silence you have not yet waited out" (1e) is inherently a question
 * about now. Reading the clock in here would make validation non-deterministic and the rule
 * untestable — the two things a build gate must never be. The caller supplies the date; the
 * tests supply a fixed one.
 */
export function integrityErrors(
  p: Provider,
  file: string,
  today: string = new Date().toISOString().slice(0, 10),
): string[] {
  const errors: string[] = [];
  const sourceIds = new Set(p.sources.map((s) => s.id));
  const moduleIds = new Set(p.modules.map((m) => m.id));
  const programIds = new Set(p.programs.map((pr) => pr.id));

  // 1. Every `source:` ref must exist in sources[]
  const refs = new Set<string>();
  collectSourceRefs(p, refs);
  for (const ref of refs) {
    if (!sourceIds.has(ref)) errors.push(`${file}: source ref '${ref}' not found in sources[]`);
  }

  // 1b. A SNAPSHOT IS A CAPTURE OF THEIR PAGE — NEVER A FILE WE WROTE.
  //
  // Five sources once pointed `local_snapshot` at a hand-made `.md` "Evidence snapshot —
  // tekstextractie": our own web-fetch notes, holding the quotes we had selected. The
  // provenance check duly opened them, found the figures we had put there, and certified
  // seven claims against our own summary. A note cannot evidence the claim it was written
  // from — that is circular, and it is the one thing this project says in every README.
  //
  // The rule is structural, not a convention, because the convention held for a month and
  // then didn't: a snapshot is a capture (`.pdf`/`.html` from the archiver, or a directly
  // downloaded artefact) and text we authored is a note. Notes belong in `note:`.
  for (const s of p.sources) {
    if (s.local_snapshot && /\.(md|txt)$/i.test(s.local_snapshot)) {
      errors.push(
        `${file}: source '${s.id}' cites '${s.local_snapshot}' as its snapshot — that is text WE wrote, ` +
          `not a capture of their page, and it cannot evidence a claim extracted from it. Archive the page ` +
          `(npm run archive -- ${p.id}) and cite the capture; put our reading of it in note:.`,
      );
    }

    // (see 1d below for the CRKBO rule — it is about the provider, not this source)

    // 1c. A PUBLIC ARCHIVE THAT PROVES NOTHING MUST NOT BE CLAIMED AS ONE.
    //
    // The archiver skips Wayback for the YA registers (a Salesforce JS shell — Wayback
    // stores header and footer, no register data) and for the CRKBO register (a search
    // interface with no per-row permalink — Wayback captures page 1, never the searched
    // row, and the finding is usually a NEGATIVE that page 1 cannot evidence either way).
    //
    // But that rule lived only in the SCRIPT. Twelve records, captured before it existed,
    // carried the Wayback URL anyway — and the site rendered "publiek ✓" over an archive
    // that shows none of what we cite. One of them (namaste-studios' YA profile) had been
    // returning 404 for weeks: a public archive that did not exist at all. The local,
    // browser-rendered (and where needed, filtered) copy IS the evidence for these; the
    // public half is honestly absent, and the record must say so with `archived_url: null`.
    if (s.url && s.archived_url && waybackIsPointless(s.url) && /web\.archive\.org/i.test(s.archived_url)) {
      errors.push(
        `${file}: source '${s.id}' claims a Wayback archive of ${s.url} — but Wayback cannot evidence it ` +
          `(${waybackPointlessReason(s.url)}). The local capture is the evidence; set archived_url: null so ` +
          `the record says "publiek n.v.t. (niet vast te leggen)", which is true, instead of "publiek ✓", which is not.`,
      );
    }
  }

  // 1d. A REGISTER MISS IS NOT A REGISTER FINDING (spec §4.11, v0.10).
  //
  // THE REGISTER IS COMPLETE. OUR SEARCH OF IT IS NOT. A CRKBO registration is routinely
  // held by a BV, a holding, or the founder personally in the Docenten register — so a
  // miss on the BRAND or the WEBSITE proves only that the brand is not listed under that
  // name. It says nothing about the provider, and rendering it as `no` states, on a page
  // about a real business, a fact we have not established.
  //
  // The rule was written in the spec (§4.11), and again in the schema comment, and
  // de-yogaschool-enschede published `registered: no` anyway — on the evidence "naam
  // 'Yogaschool' en website 'yogaschool' → geen treffer", while its own legal_name was
  // "onbekend". A rule stated three times in prose and enforced nowhere is not a rule.
  //
  // So: `no` requires that the search covered the identifier the registration would be
  // HELD under. If you do not know that name, you cannot search it — and then you cannot
  // conclude `no`. The impossibility falls out of the data, which is where it belongs.
  if (p.crkbo.registered === "no") {
    const searched = p.crkbo.searched ?? [];
    const searchedLegalIdentifier = searched.includes("legal_name") || searched.includes("kvk");
    if (!searchedLegalIdentifier) {
      errors.push(
        `${file}: crkbo.registered is 'no', but crkbo.searched is [${searched.join(", ") || "empty"}] — ` +
          `a brand/website miss is NOT a finding of non-registration (§4.11). A CRKBO registration is ` +
          `routinely held by a BV, a holding, or a teacher personally. Search the legal name / KvK and ` +
          `record it in crkbo.searched, or set registered: unknown — which is what a failed lookup means.`,
      );
    }
    if (searched.includes("legal_name") && !p.legal?.legal_name) {
      errors.push(
        `${file}: crkbo.searched claims a 'legal_name' search, but the record holds no legal.legal_name — ` +
          `you cannot have searched a name you do not have.`,
      );
    }
    if (searched.includes("kvk") && !p.legal?.kvk) {
      errors.push(
        `${file}: crkbo.searched claims a 'kvk' search, but the record holds no legal.kvk.`,
      );
    }
  }

  // 1e. YOU MAY NOT PUBLISH A SILENCE YOU HAVE NOT WAITED OUT (spec §4.9/§12, v0.11).
  //
  // `response: "none"` prints "uitgenodigd te corrigeren, geen reactie" about a named
  // business. It is defensible only after the window WE stated has actually elapsed.
  // Recording it on the day the request goes out — which the old model forced, because
  // `response` was required and `awaiting` did not exist — publishes a school's silence
  // before they have had a single day to break it.
  //
  // `awaiting` is the honest state while the window is open: a fact about our process,
  // never about them.
  for (const [i, q] of (p.inquiries ?? []).entries()) {
    if (q.respond_by <= q.sent) {
      errors.push(
        `${file}: inquiries[${i}] closes its window (${q.respond_by}) on or before it was sent (${q.sent}) — ` +
          `a response window that has already expired is not a window.`,
      );
    }
    if (q.response === "none" && q.respond_by > today) {
      errors.push(
        `${file}: inquiries[${i}] records 'geen reactie' while the window we gave them is still open ` +
          `(respond_by ${q.respond_by}, today ${today}). That publishes a silence they have not yet had the ` +
          `chance to break. Use response: awaiting until ${q.respond_by} has passed.`,
      );
    }
  }

  // 2. composition.modules must reference existing modules
  for (const program of p.programs) {
    for (const m of program.composition?.modules ?? []) {
      if (!moduleIds.has(m))
        errors.push(`${file}: program '${program.id}' references unknown module '${m}'`);
    }
    // 3. nested cohorts: program field, if present, must match parent
    for (const c of program.cohorts ?? []) {
      if (c.program && c.program !== program.id)
        errors.push(`${file}: cohort '${c.id}' says program '${c.program}' but is nested under '${program.id}'`);
    }
  }

  // 4. prerequisite.program must resolve, and the chain must not CYCLE (spec v0.9).
  //
  //    A cycle is a VALIDATION ERROR, never a silent stop in the arithmetic. Two
  //    programmes that each gate the other describe no path a student can walk, and
  //    `totalPathCost` returning *some* number for it would publish a total for a route
  //    that does not exist — about a named business, in a price band, in a sort order,
  //    indistinguishable from a real one. The derivation guards itself against infinite
  //    recursion (see purchasableGates), but the guard is for termination; the record must
  //    not load at all.
  for (const program of p.programs) {
    for (const pre of program.prerequisite ?? []) {
      if (pre.program == null) continue;
      if (pre.kind !== "program")
        errors.push(
          `${file}: program '${program.id}' prerequisite '${pre.label}' points at program '${pre.program}' but has kind '${pre.kind}' — only kind 'program' is a training you must buy`,
        );
      if (!programIds.has(pre.program))
        errors.push(
          `${file}: program '${program.id}' has a prerequisite on unknown program '${pre.program}'`,
        );
    }
  }
  for (const program of p.programs) {
    const cycle = prerequisiteCycle(p, program.id, []);
    if (cycle)
      errors.push(
        `${file}: prerequisite cycle ${cycle.join(" → ")} — a programme cannot be its own gate, and a path cost over a cycle is a total for a route no student can walk`,
      );
  }

  // 5. claim scopes must resolve
  for (const claim of p.claims) {
    const [kind, id] = claim.scope.split(":");
    if (kind === "program" && id && !programIds.has(id))
      errors.push(`${file}: claim '${claim.id}' scoped to unknown program '${id}'`);
    if (kind === "module" && id && !moduleIds.has(id))
      errors.push(`${file}: claim '${claim.id}' scoped to unknown module '${id}'`);

    // 6. A claim's quote is the provider's WORDS. The delimiters are the
    //    RENDERER's: the record page wraps every quote in curly quotes, so a value
    //    stored with its own outer quote marks renders as “"Het eerste jaar…"” —
    //    doubled. One of 34 claims was stored that way (de-yogaschool-enschede,
    //    meester-lineage), and the researcher's typing habit is the obvious way for
    //    the next one to arrive: a composed quotation, pasted with the quote marks
    //    that framed it while it was being assembled.
    //
    //    Stripping them at render time would be worse than this check: a renderer
    //    that edits a verbatim quote is a renderer that can edit a verbatim quote,
    //    and §3 says nothing may. So the DATA must be clean, and the load must
    //    refuse data that is not. Quotes INSIDE the text are untouched — only a
    //    value that both opens and closes with one is delimited rather than quoting.
    if (isDelimited(claim.quote))
      errors.push(
        `${file}: claim '${claim.id}' has a quote wrapped in quote marks (${claim.quote.slice(0, 1)}…${claim.quote.slice(-1)}). ` +
        `Store the provider's words only — the renderer supplies the quotation marks, so stored ones render doubled.`,
      );
  }

  return errors;
}

/**
 * The prerequisite chain from `programId`, or the cycle it runs into.
 *
 * Depth-first over `prerequisite[].program` — the only link that can cycle, because it is
 * the only one that points BACK INTO this record. Returns the offending path
 * (`a → b → a`) so the error names the route, not merely the record.
 */
function prerequisiteCycle(p: Provider, programId: string, path: string[]): string[] | null {
  if (path.includes(programId)) return [...path, programId];
  const program = p.programs.find((pr) => pr.id === programId);
  if (!program) return null; // unresolvable ref — reported by its own check above
  for (const pre of program.prerequisite ?? []) {
    if (pre.program == null) continue;
    const cycle = prerequisiteCycle(p, pre.program, [...path, programId]);
    if (cycle) return cycle;
  }
  return null;
}

/** Straight and curly, opening and closing, single and double: every mark a
 *  researcher's keyboard or a website's stylesheet can produce. */
const QUOTE_MARKS = ['"', "“", "”", "'", "‘", "’"];

function isDelimited(quote: string): boolean {
  const text = quote.trim();
  // A one-character value cannot be both delimiters; requiring 2 also stops a bare
  // `"` from reporting itself as its own opening and closing mark.
  if (text.length < 2) return false;
  return QUOTE_MARKS.includes(text[0]) && QUOTE_MARKS.includes(text[text.length - 1]);
}

/**
 * The SHARED REFERENCE STORE (spec §4.1b, v0.13) — normative documents belonging to no
 * single provider. Loaded separately from the corpus and never merged into it: a
 * reference is evidence about a RULE, and `integrityErrors` / the provenance gate both
 * key on "the page that states THIS provider's fact". Keeping the two apart is what stops
 * a rulebook being cited as a school's price page.
 *
 * A missing directory is not an error — the store is optional, unlike data/providers/.
 */
export function loadReferences(cwd: string = process.cwd()): ReferenceLoadResult {
  const references: Reference[] = [];
  const errors: string[] = [];
  const dir = path.join(cwd, "data", "references");
  if (!fs.existsSync(dir)) return { references, errors };

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
    const raw = parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const result = Reference.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`references/${file}: ${issue.path.join(".")} — ${issue.message}`);
      }
      continue;
    }
    const ref = result.data;
    const before = errors.length;
    if (ref.id !== file.replace(/\.yaml$/, ""))
      errors.push(`references/${file}: reference id '${ref.id}' does not match filename`);

    // A DECLARED SNAPSHOT THAT IS NOT THERE IS THE ONE FAILURE THAT LOOKS LIKE SUCCESS:
    // the body is gitignored, so a path typo reads as "archived" in the YAML forever while
    // the archive holds nothing.
    //
    // CHECK THE COMMITTED .sha256, NOT THE BODY. The first version of this asserted the
    // BODY existed, which is green on the machine that captured it and red in every fresh
    // clone — CI failed on all five records for exactly that reason. It is the disease
    // documented in CLAUDE.md and split into tiers in provenance.ts: what is provable from
    // the record plus the committed sidecars binds EVERYWHERE; what needs the body can only
    // be checked where the body is. The sidecar is the better check anyway. It is committed,
    // so it binds in CI, and it catches the typo case strictly harder: a mistyped path has no
    // sidecar that LISTS it, and it additionally proves the capture was really hashed rather
    // than merely named. ("No sidecar" would be false — see the extension case below.)
    if (ref.local_snapshot) {
      if (!ref.local_snapshot.startsWith("data/archives/_references/"))
        errors.push(
          `references/${file}: local_snapshot must live under data/archives/_references/ (§4.1b)`,
        );
      // A SNAPSHOT IS A CAPTURE OF THEIR DOCUMENT, NEVER TEXT WE WROTE. The provider records
      // carry this rule because five of them once pointed `local_snapshot` at our own `.md`
      // reading notes, and the provenance gate duly certified seven claims about four named
      // businesses against our own homework. References carry the longest hand-written notes
      // in the corpus, so the temptation here is strictly higher, not lower.
      else if (/\.(md|txt)$/i.test(ref.local_snapshot))
        errors.push(
          `references/${file}: local_snapshot is een ${path.extname(ref.local_snapshot)}-bestand — ` +
            `een snapshot is een capture van HUN document, nooit tekst die wij schreven`,
        );
      else {
        // THE SIDECAR MUST LIST THIS EXACT FILENAME, not merely exist. Asserting only that
        // the file is there passes on an extension typo, because one sidecar covers every
        // artifact of a capture: `<id>-<date>.sha256` is the receipt for BOTH `<id>-<date>.pdf`
        // and `<id>-<date>.html`, so a `local_snapshot` naming the `.html` of a capture that
        // only ever produced a `.pdf` resolves to a sidecar that exists and never mentions it.
        // That is exactly the pair this project keeps two of on purpose (the JS-rendered-price
        // trap), so it is the typo most likely to be made and the one least likely to be seen.
        const sidecar = ref.local_snapshot.replace(/\.[a-z0-9]+$/i, ".sha256");
        const sidecarPath = path.join(cwd, sidecar);
        if (!fs.existsSync(sidecarPath))
          errors.push(
            `references/${file}: geen vastgelegde hash voor local_snapshot — ${sidecar} ontbreekt ` +
              `(de body is gitignored; de .sha256 is het gepubliceerde bewijs dat de capture bestaat)`,
          );
        else {
          const listed = fs
            .readFileSync(sidecarPath, "utf8")
            .split("\n")
            .map((l) => l.trim().split(/\s+/)[1])
            .filter((name): name is string => !!name);
          if (!listed.includes(path.basename(ref.local_snapshot)))
            errors.push(
              `references/${file}: ${sidecar} noemt ${path.basename(ref.local_snapshot)} niet ` +
                `(wel: ${listed.join(", ") || "niets"}) — de hash dekt dit bestand dus niet`,
            );
        }
      }
    }

    // THE SAME RULE THE PROVIDER RECORDS ARE HELD TO (wayback.ts). It lived in the archive
    // SCRIPT once and twelve provider records kept a Wayback URL the script would never
    // have written — one of them 404ing for weeks. A reference store that skipped the check
    // would reintroduce exactly that gap, on documents the whole corpus cites.
    //
    // The `web.archive.org` half is not decoration and this check shipped without it: these
    // domains are WAYBACK-pointless, not archive-pointless. archive.today renders the page
    // before storing it, so it captures what Wayback cannot — it is the documented fallback
    // and a provider record already relies on it. Without this clause the rule rejects the
    // one public archive that would actually work, while claiming to be the provider rule.
    if (
      ref.url &&
      ref.archived_url &&
      waybackIsPointless(ref.url) &&
      /web\.archive\.org/i.test(ref.archived_url)
    )
      errors.push(
        `references/${file}: archived_url op een Wayback-zinloze bron — ` +
          `${waybackPointlessReason(ref.url)}; gebruik archived_url: null + de lokale kopie`,
      );

    // A RECORD THAT FAILED ITS OWN CHECKS IS NOT A LOADED RECORD. Returning it alongside the
    // errors invites a consumer that reads `references` and ignores `errors` — the lazy path
    // being the wrong one, which is the shape this project designs against everywhere else.
    if (errors.length === before) references.push(ref);
  }

  // LINEAGE MUST RESOLVE. `supersedes`/`superseded_by` exist because publishers reissue
  // without version numbers, so the chain is pinned by hand — and a hand-typed slug with
  // nothing checking it silently breaks the only lineage record there is. Same class as the
  // `source:` refs `integrityErrors` resolves; cheapest to add now, while no record uses it.
  // A second pass, because the target may be loaded after the record naming it.
  const ids = new Set(references.map((r) => r.id));
  for (const r of references)
    for (const key of ["supersedes", "superseded_by"] as const) {
      const target = r[key];
      if (target && !ids.has(target))
        errors.push(`references/${r.id}.yaml: ${key} '${target}' verwijst naar geen bestaande referentie`);
    }

  return { references, errors };
}

export function loadDataset(): LoadResult {
  const providers: Provider[] = [];
  const errors: string[] = [];
  if (!fs.existsSync(DATA_DIR)) return { providers, errors: [`data dir not found: ${DATA_DIR}`] };

  for (const file of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".yaml"))) {
    const raw = parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
    const result = Provider.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${file}: ${issue.path.join(".")} — ${issue.message}`);
      }
      continue;
    }
    if (result.data.id !== file.replace(/\.yaml$/, ""))
      errors.push(`${file}: provider id '${result.data.id}' does not match filename`);
    errors.push(...integrityErrors(result.data, file));
    providers.push(result.data);
  }
  return { providers, errors };
}
