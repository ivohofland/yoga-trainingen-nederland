/**
 * THE PROVENANCE CHECK: does the page we CITE for a price actually SHOW one?
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
 *     and lazy sections drop them out of the PDF render.
 *
 * Search only the HTML and 3 truthful records are called liars; only the PDF and 7
 * are. Search BOTH and pass if EITHER evidences a price: zero false positives over
 * the whole corpus, and the four real ones still flagged.
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
 * (and in the private archive repo), which is exactly where prices get extracted.
 *
 * THE LIMIT, stated honestly because the check cannot state it itself: this is
 * PAGE-LEVEL, not FACT-LEVEL. It proves the cited page mentions *a* price. It does
 * not prove the page mentions *this* price, nor that `amount_eur` is the number
 * printed on it. sanayou/200-online passes on an overview page that prices the
 * other two routes but not that one. It is a floor under the citation, not a
 * ceiling over it — it can only ever catch a record citing a page with no money on
 * it anywhere, which is exactly the class of bug it was built for.
 *
 * NOT A BUILD GATE — YET. It reports as a warning in `npm run validate` and counts
 * on `/qa`. As of the commit that added it the count is 0, and `provenance.test.ts`
 * pins it there. Once it has stayed at 0 for a while, promote it: make
 * `scripts/validate.ts` exit non-zero on a finding, exactly like an integrity
 * error. The reason to wait is that a false positive here would be an accusation
 * against our own sourced research, and the regex has only seen one corpus.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { Provider, Source } from "../schema";

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

/** Does this artifact's text show a money amount anywhere? (Pure — the unit under test.) */
export function evidencesPrice(text: string): boolean {
  return MONEY_RE.test(text);
}

/** Why a cited price source carries no evidence. Each is a different failure, and
 *  the message must say which: "never captured" is a hole in the archive, "captured
 *  and shows no price" is a hole in the citation. */
export type ProvenanceReason = "no_source" | "no_snapshot" | "no_artifact" | "no_money";

export interface PriceProvenanceFinding {
  providerId: string;
  programId: string;
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
      "pdftotext (poppler) niet gevonden — de prijs-provenance-check kan PDF-artefacten niet lezen. " +
        "Installeer: `brew install poppler` (macOS) of `apt-get install -y poppler-utils` (Debian/Ubuntu).",
    );
    this.name = "PdftotextMissing";
  }
}

function artifactText(file: string): string {
  if (file.toLowerCase().endsWith(".pdf")) {
    if (!pdftotextAvailable()) throw new PdftotextMissing();
    // `-` = write to stdout. 64MB ceiling: a full-page capture of a long page can
    // run to a few hundred KB of text; the default 1MB would truncate silently.
    return execFileSync("pdftotext", ["-q", file, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  }
  return fs.readFileSync(file, "utf8");
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
  findings: PriceProvenanceFinding[];
  /** Cited price sources whose artifacts we could open and search. */
  examined: number;
  /** Cited price sources whose bodies are not in this checkout (gitignored). Not a
   *  finding — an honest limit of where the check is running. */
  skipped: number;
}

/**
 * Every programme whose record claims a published price, held against the artifacts
 * of the page it cites for it.
 *
 * Runs over `published: "yes"` regardless of whether we hold an `amount_eur`: a
 * record WITH an amount whose cited page shows no money is the same bug wearing a
 * number — the amount would then have come from somewhere we cannot show a reader.
 */
export function priceProvenance(p: Provider, cwd = process.cwd()): ProvenanceReport {
  const findings: PriceProvenanceFinding[] = [];
  let examined = 0;
  let skipped = 0;

  for (const program of p.programs) {
    if (program.price.published !== "yes") continue;

    const sourceId = program.price.source ?? null;
    const source = sourceId ? p.sources.find((s) => s.id === sourceId) : undefined;
    const at = `${p.id}/${program.id}`;

    if (!source) {
      findings.push({
        providerId: p.id, programId: program.id, sourceId, reason: "no_source",
        message: `${at}: prijs gepubliceerd volgens het record, maar er is geen bron opgegeven die dat draagt`,
      });
      continue;
    }
    if (!source.local_snapshot) {
      findings.push({
        providerId: p.id, programId: program.id, sourceId: source.id, reason: "no_snapshot",
        message: `${at}: bron '${source.id}' heeft geen lokale kopie — de prijsclaim staat op geen enkel bewaard bewijsstuk`,
      });
      continue;
    }

    const { readable, bodyWithheld, nothingCaptured } = artifactsFor(source, cwd);

    if (nothingCaptured) {
      findings.push({
        providerId: p.id, programId: program.id, sourceId: source.id, reason: "no_artifact",
        message: `${at}: bron '${source.id}' verwijst naar '${source.local_snapshot}', maar er is geen kopie én geen hash — nooit vastgelegd`,
      });
      continue;
    }

    if (readable.some((f) => evidencesPrice(artifactText(f)))) {
      examined++;
      continue;
    }

    // Nothing we could open shows a price — but if a captured body is missing from
    // this checkout, the price may well be in it (that is the normal state in CI).
    // Silence is not evidence of absence when the evidence is elsewhere by design.
    if (bodyWithheld) {
      skipped++;
      continue;
    }

    examined++;
    findings.push({
      providerId: p.id, programId: program.id, sourceId: source.id, reason: "no_money",
      message:
        `${at}: prijs gepubliceerd volgens het record, maar het gearchiveerde artefact van bron '${source.id}' ` +
        `bevat nergens een bedrag (${readable.length} artefact(en) doorzocht). ` +
        `Citeer de pagina die de prijs STÉLT, niet de pagina die ernaar linkt — en archiveer die eerst.`,
    });
  }

  return { findings, examined, skipped };
}

/** The whole corpus. Findings sorted by record, so the warning reads like a work list. */
export function allPriceProvenance(providers: Provider[], cwd = process.cwd()): ProvenanceReport {
  const reports = providers.map((p) => priceProvenance(p, cwd));
  return {
    findings: reports
      .flatMap((r) => r.findings)
      .sort((a, b) => `${a.providerId}/${a.programId}`.localeCompare(`${b.providerId}/${b.programId}`)),
    examined: reports.reduce((n, r) => n + r.examined, 0),
    skipped: reports.reduce((n, r) => n + r.skipped, 0),
  };
}
