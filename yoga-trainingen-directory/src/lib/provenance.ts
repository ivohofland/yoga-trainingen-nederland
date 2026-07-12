/**
 * THE PROVENANCE CHECK: does the page we CITE for a fact actually STATE it?
 *
 * `price.published: "yes"` is a statement about a NAMED BUSINESS — "we looked, and
 * they publish what this costs" — and `price.source` names the page we looked at.
 * Nothing in the schema, and nothing in `loader.ts`'s referential-integrity pass,
 * ever asked whether that page contains a price. It only asked whether the id
 * resolves. So four records cited a captured overview page that carries no € at
 * all, while the real price sat on a rates page / an inschrijfpagina / a linked
 * PDF that was never sourced and never archived (aalo ×2, de-blikopener,
 * yoga-academie-nederland). The citation pointed at the page that LINKS to the
 * fact, not the page that STATES it — and the archive, which is the whole
 * evidentiary basis of this project, therefore held no evidence for it.
 *
 * A human cannot catch that by reading YAML: the record looks perfect. Only the
 * ARTIFACT can answer it. So this check reads the artifacts.
 *
 * THREE CLAIMS, ONE MACHINERY (spec v0.5). The price was never the only field whose
 * citation could point at the wrong page — it was only the one we had caught:
 *
 *   - PRICE — `price.published: yes` → the cited artifact must show a money amount.
 *   - HOURS — `hours_claimed.total` set → the cited artifact must show that figure, or
 *     an hours-like number. de Blikopener's hours were cited to the HOMEPAGE, which
 *     states no hours anywhere; the 500 u / 372 u sentence lives on the opleidingspagina,
 *     which was not a source at all until v0.5.
 *   - VAT — `price.vat` of `incl`/`excl`/`exempt_crkbo` → the cited artifact must
 *     mention VAT. A VAT treatment is DIRECTLY OBSERVED (§10) or it is not known: two
 *     records carried `exempt_crkbo` INFERRED from the school's CRKBO registration,
 *     which §4.11 forbids in as many words, on pages that mention no BTW at all. The
 *     schema cannot see the difference between a fact read off a page and a fact
 *     deduced in a researcher's head. The artifact can.
 *
 * HOW IT READS THEM, and why both:
 *
 * `archive.ts` captures every source twice — `<id>-<date>.html` (the raw DOM) and
 * `<id>-<date>.pdf` (the browser-rendered page). NEITHER IS SUFFICIENT ALONE, and
 * the corpus proves it in both directions:
 *
 *   - 3 programmes' prices live ONLY in the PDF (balanzs, newnature ×2): the amount
 *     is injected by a JS add-to-cart widget after load, so the saved DOM string
 *     never contains it. This is the SAME trap already documented for the
 *     Salesforce-rendered Yoga Alliance registers (see WAYBACK_POINTLESS in
 *     archive.ts) — a stored page is not the page a reader saw.
 *   - 7 programmes' prices live ONLY in the HTML (arhanta, namaste-studios,
 *     pure-energy-yoga, thrive-yoga, tula, yogapoint, yogaschool-noord): print CSS
 *     and lazy sections drop them out of the PDF render. de Blikopener's own
 *     opleidingspagina is now the extreme case — its PDF renders as an empty shell,
 *     and every sentence on it survives only in the HTML.
 *
 * Search only the HTML and 3 truthful records are called liars; only the PDF and 7
 * are. Search BOTH and pass if EITHER evidences the fact: zero false positives over
 * the whole corpus, and the real ones still flagged.
 *
 * PDF text is extracted with `pdftotext` (poppler). NOT `strings`: a browser PDF
 * stores its text in Flate-compressed streams, so `strings` reads the compressed
 * bytes, matches the money regex against binary noise, and reported 55 of 47
 * records as fine — a check that passes everything is worse than no check.
 *
 * IT RUNS WHERE THE EVIDENCE IS, AND SAYS SO WHERE IT ISN'T. The snapshot BODIES are
 * gitignored — this repo publishes only the `.sha256` beside each one, because
 * mirroring a provider's whole page is redistribution, not citaatrecht (see
 * data/archives/README.md). So in CI, or in a fresh clone, the artifacts this check
 * reads are simply not there. That is NOT a finding: "we cannot open the evidence
 * here" and "the evidence shows no price" are different sentences, and printing the
 * second when the first is true would accuse ~40 named businesses on every CI run.
 * The `.sha256` sidecar — which IS committed, and which lists every file captured
 * for that source — is what tells the two apart: it names an artifact that exists
 * but is not in this checkout, so the source is SKIPPED, and the skip is counted and
 * reported. The check is therefore fully meaningful only on the researcher's machine
 * (and in the private archive repo), which is exactly where facts get extracted.
 *
 * THE LIMIT, stated honestly because the check cannot state it itself: this is
 * PAGE-LEVEL, not FACT-LEVEL. It proves the cited page mentions *a* price, *an* hours
 * figure, *the* subject of VAT. It does not prove the page mentions *this* price, nor
 * that `amount_eur` is the number printed on it. sanayou/200-online passes on an
 * overview page that prices the other two routes but not that one. It is a floor under
 * the citation, not a ceiling over it — it can only ever catch a record citing a page
 * that is silent on the whole subject, which is exactly the class of bug it was built
 * for, and exactly the class that produced every one of its findings so far.
 *
 * NOT A BUILD GATE. It reports as a warning in `npm run validate` and counts on
 * `/qa`; `npm run provenance` is the same check with a non-zero exit, for use after
 * touching a price, an hour count or a source. The reason to keep the build green is
 * that a false positive here is an accusation against our own sourced research, and
 * the hours and VAT regexes have seen exactly one corpus.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { Program, Provider, Source } from "../schema";

/**
 * A money amount, as an ARTIFACT prints it — not as a human writes it.
 *
 * The euro sign and its digits routinely land in SEPARATE TEXT RUNS: a
 * browser-rendered PDF puts the `€` in one span and `449,-` in the next, so
 * `pdftotext` emits them on two lines. `/€\s?\d/` misses that; `[\s\r\n]*` does not.
 *
 * Three shapes, because the corpus holds all three: `€ 2.450`, `2450 euro` / `2450
 * EUR`, and `EUR 2450`. The middle alternative demands at least three digits
 * (`\d[\d.,]{2,}`) so that an hour count next to the word "uur" cannot be read as a
 * price — a yoga school writes "200 uur", never "200 euro", about its hours.
 */
export const MONEY_RE = /€[\s\r\n]*\d|\d[\d.,]{2,}[\s\r\n]*(euro|EUR)\b|\bEUR[\s\r\n]*\d/i;

/**
 * THE HOURS FIGURE ITSELF — the number in the record, printed on the page.
 *
 * NOT "an hours-like number somewhere on the page", which was the first design and is
 * WORTHLESS: de Blikopener's homepage — the page whose miscitation motivated this whole
 * check — advertises its class times as "19 – 22 u", and `\d{2,4}\s*uur?` reads that as
 * an hours claim. The check would have green-lit the exact record it exists to catch.
 * A check that passes everything is worse than no check (see the `strings` disaster
 * above); "the page mentions hours" is not evidence for "this training is 500 hours".
 *
 * Digit boundaries, not `\b`: "500u" has NO word boundary between `0` and `u` (both are
 * word characters), so `\b500\b` fails on the most common way a Dutch yoga school writes
 * it. That regex flagged open-yoga and samsara — two records whose cited page prints the
 * figure in as many characters — as unsourced.
 *
 * What it therefore catches, and this is the useful class: a total that appears NOWHERE
 * on the cited page because WE SUMMED IT. wahe's 500 is "200 + 150 + 100 (+ ~50u)" —
 * our arithmetic, stored as their claim. That is spec §6 violated in the hours field,
 * and only the artifact could see it.
 */
export function hoursFigureRe(total: number): RegExp {
  return new RegExp(String.raw`(?<!\d)${total}(?!\d)`);
}

/**
 * VAT, as a page MENTIONS it — the subject, never the treatment.
 *
 * The check this serves is deliberately weak in one direction and strict in the other:
 * it cannot tell `incl` from `excl` from `exempt_crkbo` (only a reader can), but it
 * CAN tell that a page says nothing about VAT at all — and a page that says nothing
 * about VAT cannot be the source of a VAT treatment. That is the whole bug: `vat:
 * exempt_crkbo` deduced from a CRKBO registration and cited to a rates page that never
 * mentions BTW (spec §4.11 forbids exactly this inference). "CRKBO" is IN the pattern
 * on purpose — a page that says "CRKBO-geregistreerd, dus btw-vrij" IS stating a VAT
 * treatment, and the check has no business calling that unsourced.
 */
export const VAT_RE = /\bbtw\b|\bvat\b|vrijgesteld|vrijstelling|omzetbelasting|\bcrkbo\b/i;

/** Does this artifact's text show a money amount anywhere? (Pure — the unit under test.) */
export function evidencesPrice(text: string): boolean {
  return MONEY_RE.test(text);
}

/** Does this artifact's text print the hours figure the record claims? See hoursFigureRe. */
export function evidencesHours(text: string, total: number): boolean {
  return hoursFigureRe(total).test(text);
}

/** Does this artifact's text mention VAT at all? (It cannot say WHICH treatment — see VAT_RE.) */
export function evidencesVat(text: string): boolean {
  return VAT_RE.test(text);
}

/** Which claim a finding is about. The message names the field; this makes it filterable. */
export type ProvenanceCheck = "price" | "hours" | "vat";

/** Why a cited source carries no evidence. Each is a different failure, and the
 *  message must say which: "never captured" is a hole in the archive, "captured and
 *  shows nothing of the kind" is a hole in the citation. */
export type ProvenanceReason = "no_source" | "no_snapshot" | "no_artifact" | "no_evidence";

export interface ProvenanceFinding {
  providerId: string;
  programId: string;
  check: ProvenanceCheck;
  sourceId: string | null;
  reason: ProvenanceReason;
  /** Dutch, record-first — it is read in `npm run validate` output and on /qa. */
  message: string;
}

/** Artifact extensions we can read. `.md` is the hand-written text extraction some
 *  early records carry instead of a capture (yoga-academie-nederland); it is still
 *  the artifact that source was cited from, so it is still what we search. */
const READABLE = [".pdf", ".html", ".md", ".txt"] as const;

let pdftotextChecked = false;
let pdftotextPresent = false;

/** poppler's `pdftotext`, and no fallback. A missing extractor must be LOUD (see
 *  the `strings` disaster in the header): a check that quietly stops reading PDFs
 *  would pass every JS-rendered price page in the corpus. */
export function pdftotextAvailable(): boolean {
  if (!pdftotextChecked) {
    pdftotextChecked = true;
    try {
      execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
      pdftotextPresent = true;
    } catch {
      pdftotextPresent = false;
    }
  }
  return pdftotextPresent;
}

export class PdftotextMissing extends Error {
  constructor() {
    super(
      "pdftotext (poppler) niet gevonden — de provenance-check kan PDF-artefacten niet lezen. " +
        "Installeer: `brew install poppler` (macOS) of `apt-get install -y poppler-utils` (Debian/Ubuntu).",
    );
    this.name = "PdftotextMissing";
  }
}

/**
 * WHAT A READER SEES, not what the server sent. Scripts, styles, comments and tags out.
 *
 * The price check survived on the raw DOM string because `€` is vanishingly rare in
 * markup. Numbers are not: an HTML file is dense with them — `font-weight:500`,
 * `width:300px`, `logo-200x200.jpg`, tracking payloads — and de Blikopener's homepage
 * (which prints no hours at all) contains "500" several times over in exactly that way.
 * Matching an hours figure against the markup makes the check assert, of a named
 * business, that they publish an hour count, on the evidence of a stylesheet.
 *
 * A citation is a claim that a READER can go and see the fact on that page. So the text
 * we hold the claim against is the text a reader sees. (Prices survive the strip: the 7
 * HTML-only prices in the corpus are all in visible copy — verified over the whole
 * corpus, zero new price findings.)
 */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&euro;/gi, "€")
    .replace(/&amp;/gi, "&");
}

/** One extraction per FILE, not per check. Three checks now read the same artifacts, and
 *  `pdftotext` on a full-page capture is the expensive part of `npm run validate` —
 *  without this, adding hours and VAT tripled the cost of every build. */
const textCache = new Map<string, string>();

function artifactText(file: string): string {
  const hit = textCache.get(file);
  if (hit != null) return hit;
  const lower = file.toLowerCase();
  let text: string;
  if (lower.endsWith(".pdf")) {
    if (!pdftotextAvailable()) throw new PdftotextMissing();
    // `-` = write to stdout. 64MB ceiling: a full-page capture of a long page can
    // run to a few hundred KB of text; the default 1MB would truncate silently.
    text = execFileSync("pdftotext", ["-q", file, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } else if (lower.endsWith(".html")) {
    text = visibleText(fs.readFileSync(file, "utf8"));
  } else {
    text = fs.readFileSync(file, "utf8");
  }
  textCache.set(file, text);
  return text;
}

interface Artifacts {
  /** Artifact files we can actually open here. */
  readable: string[];
  /** True when the archiver captured a file for this source that is NOT in this
   *  checkout — i.e. a gitignored body. Its `.sha256` is the receipt. */
  bodyWithheld: boolean;
  /** True when nothing was ever captured: no body, no hash, no text extraction. */
  nothingCaptured: boolean;
}

/**
 * Every artifact captured for one source, and what we can read of it here.
 *
 * Keyed off the record's own `local_snapshot` (its base name, extension swapped),
 * NOT off a directory scan for files starting with the source id: source ids nest,
 * and a scan that picked up a SIBLING source's capture would let one page's price
 * vouch for another page's citation. The record says which file it stands on; we
 * read that file and the twin the archiver wrote beside it.
 *
 * The `.sha256` sidecar is the receipt for a body we may not hold: the archiver
 * writes one line per captured file, so its very existence proves a snapshot was
 * taken even when the body is gitignored out of this checkout.
 */
export function artifactsFor(source: Source, cwd = process.cwd()): Artifacts {
  if (!source.local_snapshot) return { readable: [], bodyWithheld: false, nothingCaptured: true };
  const base = source.local_snapshot.replace(/\.[a-z0-9]+$/i, "");
  const readable = READABLE.map((ext) => path.join(cwd, base + ext)).filter((f) => fs.existsSync(f));
  const hashFile = path.join(cwd, `${base}.sha256`);
  const hashed = fs.existsSync(hashFile)
    ? fs
        .readFileSync(hashFile, "utf8")
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[1])
        .filter((name): name is string => !!name)
    : [];
  const present = new Set(readable.map((f) => path.basename(f)));
  return {
    readable,
    bodyWithheld: hashed.some((name) => !present.has(name)),
    nothingCaptured: readable.length === 0 && hashed.length === 0,
  };
}

export interface ProvenanceReport {
  findings: ProvenanceFinding[];
  /** Cited sources whose artifacts we could open and search — counted per CLAIM, so a
   *  price and an hours figure citing one page count twice: two claims were checked. */
  examined: number;
  /** Claims whose cited source's body is not in this checkout (gitignored). Not a
   *  finding — an honest limit of where the check is running. */
  skipped: number;
}

/**
 * One claim, held against the page it is cited to. The three checks differ ONLY in
 * what they look for and what they say when they do not find it — everything else
 * (resolve the source, open the artifacts, honour a withheld body) is identical, and
 * writing it three times is how the three would drift apart.
 */
interface Claimed {
  check: ProvenanceCheck;
  programId: string;
  sourceId: string | null;
  /** The claim the record makes, in Dutch — used to open every message about it. */
  claim: string;
  evidences: (text: string) => boolean;
  /** What we searched for and did not find, in Dutch. Completes the `no_evidence` message. */
  missing: string;
}

/** Every claim in a programme that a cited artifact must be able to back. */
function claimsOf(program: Program): Claimed[] {
  const claims: Claimed[] = [];
  const price = program.price;

  // PRICE. Runs over `published: "yes"` regardless of whether we hold an `amount_eur`:
  // a record WITH an amount whose cited page shows no money is the same bug wearing a
  // number — the amount would then have come from somewhere we cannot show a reader.
  if (price.published === "yes") {
    claims.push({
      check: "price",
      programId: program.id,
      sourceId: price.source ?? null,
      claim: "prijs gepubliceerd volgens het record",
      evidences: evidencesPrice,
      missing: "bevat nergens een bedrag",
    });
  }

  // HOURS. The figure is a fact about a named business ("this training is 500 hours"),
  // and it must stand on the page that says so.
  const total = program.hours_claimed.total;
  if (total != null) {
    claims.push({
      check: "hours",
      programId: program.id,
      sourceId: program.hours_claimed.source ?? null,
      claim: `${total} uur volgens het record`,
      evidences: (text) => evidencesHours(text, total),
      missing: `noemt het getal ${total} nergens (staat het er als som van deelgetallen, dan is het totaal ONZE optelling — spec §6)`,
    });
  }

  // VAT. `unknown` is exempt from the check BY DESIGN — it is the honest value for a
  // page that says nothing, and demanding evidence for "wij weten het niet" would
  // invert the whole rule. The three others each assert a treatment, and a treatment is
  // observed or it is not known (§10, §4.11).
  if (price.vat === "incl" || price.vat === "excl" || price.vat === "exempt_crkbo") {
    claims.push({
      check: "vat",
      programId: program.id,
      sourceId: price.source ?? null,
      claim: `btw-behandeling '${price.vat}' volgens het record`,
      evidences: evidencesVat,
      missing: "rept met geen woord over btw (geen 'btw', 'vrijgesteld', 'vrijstelling', 'omzetbelasting', 'CRKBO')",
    });
  }

  return claims;
}

/**
 * Every claim in one provider's record, held against the artifacts of the page it
 * cites for it.
 */
export function providerProvenance(p: Provider, cwd = process.cwd()): ProvenanceReport {
  const findings: ProvenanceFinding[] = [];
  let examined = 0;
  let skipped = 0;

  for (const program of p.programs) {
    for (const c of claimsOf(program)) {
      const at = `${p.id}/${c.programId}`;
      const base = { providerId: p.id, programId: c.programId, check: c.check };
      const source = c.sourceId ? p.sources.find((s) => s.id === c.sourceId) : undefined;

      if (!source) {
        findings.push({
          ...base, sourceId: c.sourceId, reason: "no_source",
          message: `${at}: ${c.claim}, maar er is geen bron opgegeven die dat draagt`,
        });
        continue;
      }
      if (!source.local_snapshot) {
        findings.push({
          ...base, sourceId: source.id, reason: "no_snapshot",
          message: `${at}: bron '${source.id}' heeft geen lokale kopie — ${c.claim}, op geen enkel bewaard bewijsstuk`,
        });
        continue;
      }

      const { readable, bodyWithheld, nothingCaptured } = artifactsFor(source, cwd);

      if (nothingCaptured) {
        findings.push({
          ...base, sourceId: source.id, reason: "no_artifact",
          message: `${at}: bron '${source.id}' verwijst naar '${source.local_snapshot}', maar er is geen kopie én geen hash — nooit vastgelegd`,
        });
        continue;
      }

      if (readable.some((f) => c.evidences(artifactText(f)))) {
        examined++;
        continue;
      }

      // Nothing we could open shows it — but if a captured body is missing from this
      // checkout, the evidence may well be in it (that is the normal state in CI).
      // Silence is not evidence of absence when the evidence is elsewhere by design.
      if (bodyWithheld) {
        skipped++;
        continue;
      }

      examined++;
      findings.push({
        ...base, sourceId: source.id, reason: "no_evidence",
        message:
          `${at}: ${c.claim}, maar het gearchiveerde artefact van bron '${source.id}' ${c.missing} ` +
          `(${readable.length} artefact(en) doorzocht). ` +
          `Citeer de pagina die het STÉLT, niet de pagina die ernaar linkt — en archiveer die eerst.`,
      });
    }
  }

  return { findings, examined, skipped };
}

/** The whole corpus. Findings sorted by record, so the warning reads like a work list. */
export function allProvenance(providers: Provider[], cwd = process.cwd()): ProvenanceReport {
  const reports = providers.map((p) => providerProvenance(p, cwd));
  return {
    findings: reports
      .flatMap((r) => r.findings)
      .sort(
        (a, b) =>
          `${a.providerId}/${a.programId}`.localeCompare(`${b.providerId}/${b.programId}`) ||
          a.check.localeCompare(b.check),
      ),
    examined: reports.reduce((n, r) => n + r.examined, 0),
    skipped: reports.reduce((n, r) => n + r.skipped, 0),
  };
}
