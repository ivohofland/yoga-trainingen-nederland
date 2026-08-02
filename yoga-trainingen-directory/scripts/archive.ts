/**
 * Archiveer-automatisering: voor elke bron in de provider-records
 *   1. lokale kopie    — Playwright rendert de pagina (incl. JS) en bewaart
 *                        volledige-pagina-PDF + HTML + SHA-256-hash in
 *                        data/archives/<provider>/. Bronnen die zelf een
 *                        download zijn (PDF-brochure e.d.) worden rechtstreeks
 *                        via fetch opgehaald i.p.v. gerenderd.
 *   2. publiek archief — Wayback Save Page Now; snapshot-URL wordt
 *                        teruggeschreven in het record (comments blijven staan)
 *
 * Draait LOKAAL (niet in CI zonder netwerk). Vereist: npx playwright install chromium
 *
 * Gebruik:
 *   npm run archive -- <provider-id> [...meer ids]
 *   npm run archive -- _references        # de hele gedeelde referentiestore (spec §4.1b)
 *   npm run archive -- <referentie-id>    # één referentie
 *   npm run archive -- --all              # alle providers ÉN de referentiestore
 *   npm run archive -- --all --force      # ook bronnen die al een kopie hebben
 *   npm run archive -- --all --skip-wayback
 *   npm run archive -- --sync-only       # alleen de bodies naar de private archiefrepo
 *   npm run archive -- --all --no-sync    # archiveren zonder te pushen (zelden gewenst)
 *
 * Wayback met API-sleutels (sneller, betrouwbaarder; gratis account op archive.org):
 *   export WAYBACK_ACCESS_KEY=... WAYBACK_SECRET_KEY=...
 *
 * Let op: domeinen met Wayback-exclusie (zie source-notes) handmatig via
 * archive.today; dit script slaat ze over en meldt dat.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseDocument } from "yaml";
import { WAYBACK_POINTLESS as WAYBACK_POINTLESS_DOMAINS } from "../src/lib/wayback";
import { syncArchive } from "./sync-archive";

// Minimale .env-loader (geen dependency): KEY=VALUE per regel, # = commentaar.
// Runs at MODULE scope, unlike main() — the entrypoint guard below does not stop this.
// Merely importing this file mutates process.env when a .env is present. Harmless today
// (no test reads WAYBACK_ACCESS_KEY/WAYBACK_SECRET_KEY), but machine-dependent: a fresh
// clone has no .env, so a future test asserting on the keyed-vs-keyless Wayback route
// would be green locally and red in CI. Tests must not depend on these keys.
const envFile = path.join(process.cwd(), ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && m[2] && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const DATA_DIR = path.join(process.cwd(), "data", "providers");
/** The shared reference store + the archive subdir its bodies live in (spec §4.1b, v0.13).
 *  `_references` is deliberately not a valid provider slug, so it can never collide. */
const REFERENCE_DIR = path.join(process.cwd(), "data", "references");
const REFERENCE_DIR_NAME = "_references";
const ARCHIVE_DIR = path.join(process.cwd(), "data", "archives");
const args = process.argv.slice(2);
const ALL = args.includes("--all");
const FORCE = args.includes("--force");
const SKIP_WAYBACK = args.includes("--skip-wayback");
/** The bodies go to the private archive repo unless you say otherwise. It used to be a
 *  step you had to remember, and 32 captures never left one laptop while their hashes sat
 *  published — see scripts/sync-archive.ts. Remembering is not a mechanism. */
const NO_SYNC = args.includes("--no-sync");
/** Only push what is already captured — no browser, no network beyond git. */
const SYNC_ONLY = args.includes("--sync-only");
const ids = args.filter((a) => !a.startsWith("--"));

const today = new Date().toISOString().slice(0, 10);

/** Bronnen waar een Wayback-snapshot geen bewijswaarde heeft — de lijst staat in
 *  src/lib/wayback.ts, omdat `integrityErrors` de records aan DEZELFDE regel houdt.
 *  Toen hij alleen hier stond, sloeg dit script Wayback keurig over terwijl twaalf
 *  records de URL gewoon bleven dragen (één ervan 404'de al weken). Het script dat
 *  archiveert en de validator die publiceert lezen nu hetzelfde. */
const WAYBACK_POINTLESS = WAYBACK_POINTLESS_DOMAINS;

function sha256(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Bronnen die een direct te downloaden bestand zijn (PDF-brochure, e.d.)
 *  i.p.v. een te renderen HTML-pagina. Playwright's page.goto() gooit hierop
 *  "Download is starting", dus zulke URL's halen we rechtstreeks op. */
function isDirectFileUrl(url: string): boolean {
  try {
    return /\.(pdf|docx?|pptx?|xlsx?|zip)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Haalt een binair bestand (bijv. PDF-brochure) rechtstreeks op via fetch en
 *  bewaart het + SHA-256. Geen HTML-kopie: het bestand is zelf het bewijs.
 *  Retourneert het relatieve pad naar de bewaarde kopie. */
async function saveDirectFile(
  providerId: string,
  sourceId: string,
  url: string,
): Promise<string> {
  const dir = path.join(ARCHIVE_DIR, providerId);
  fs.mkdirSync(dir, { recursive: true });
  const ext = (path.extname(new URL(url).pathname) || ".pdf").toLowerCase();
  const base = path.join(dir, `${sourceId}-${today}`);

  // User-Agent meesturen: sommige servers weigeren de standaard-fetch-UA.
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (yoga-trainingen archiveerscript)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} bij ophalen van ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(`${base}${ext}`, buf);
  fs.writeFileSync(`${base}.sha256`, `${sha256(buf)}  ${path.basename(base)}${ext}\n`);

  return path.relative(process.cwd(), `${base}${ext}`).replaceAll("\\", "/");
}

/** Zoek-registers zonder permalink (CRKBO): typ de zoekterm in het Naam-filter
 *  en wacht op de DevExpress-callback, zodat de snapshot de GEFILTERDE rij toont
 *  i.p.v. pagina 1. Het Naam-filterveld is het eerste tekstinvoerveld met de
 *  CRKBO-thema-klasse — domein-generiek voor zowel Instellingen als Docenten. */
async function applyRegisterFilter(
  page: import("playwright").Page,
  query: string,
): Promise<boolean> {
  const naam = page.locator("input.dxeEditArea_Crkbo").first();
  if ((await naam.count()) === 0) return false;
  await naam.fill(query);
  await naam.press("Enter"); // triggert de server-side callback (contains-filter)
  // Wacht tot de callback de grid heeft herladen; netwerk gaat kort idle.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(3_000); // settle-tijd voor de DevExpress-callback
  return true;
}

/**
 * Hash whatever this capture actually produced, and return the artifact the record should
 * name. Split out of `saveLocalCopy` so it is testable without a browser — the same move
 * #10 made for `captureNode`: the decision comes out, the Playwright IO stays in the caller.
 *
 * IT RETURNS WHAT EXISTS, NOT WHAT WE HOPED FOR. `saveLocalCopy` used to return
 * `${base}.pdf` unconditionally, so when `page.pdf()` failed and the fallback wrote a
 * `.png`, `local_snapshot` named a file that had never been written — a pointer to nothing,
 * in a project whose entire basis is that cited evidence exists.
 */
export function finishCapture(base: string, html: string): string {
  const name = path.basename(base);
  const hashes = [
    `${sha256(html)}  ${name}.html`,
    fs.existsSync(`${base}.pdf`) ? `${sha256(fs.readFileSync(`${base}.pdf`))}  ${name}.pdf` : null,
    fs.existsSync(`${base}.png`) ? `${sha256(fs.readFileSync(`${base}.png`))}  ${name}.png` : null,
  ].filter(Boolean);
  fs.writeFileSync(`${base}.sha256`, hashes.join("\n") + "\n");

  const ext = fs.existsSync(`${base}.pdf`) ? ".pdf" : fs.existsSync(`${base}.png`) ? ".png" : ".html";
  return path.relative(process.cwd(), `${base}${ext}`).replaceAll("\\", "/");
}

async function saveLocalCopy(
  browser: import("playwright").Browser,
  providerId: string,
  sourceId: string,
  url: string,
  query?: string,
): Promise<string> {
  // Direct te downloaden bestand (PDF-brochure e.d.): rechtstreeks ophalen,
  // niet via de browser renderen (die zou crashen op "Download is starting").
  if (isDirectFileUrl(url)) return saveDirectFile(providerId, sourceId, url);

  const dir = path.join(ARCHIVE_DIR, providerId);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `${sourceId}-${today}`);

  const page = await browser.newPage();
  try {
    // domcontentloaded i.p.v. networkidle: Salesforce-achtige apps houden
    // permanent verbindingen open, waardoor networkidle nooit optreedt.
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    } catch (e) {
      // Onverwachte download (bijv. content-disposition: attachment zonder
      // bestandsextensie in de URL): val terug op rechtstreeks ophalen.
      if (/Download is starting/i.test((e as Error).message))
        return await saveDirectFile(providerId, sourceId, url);
      throw e;
    }
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(5_000); // settle-tijd voor traag renderende JS-apps

    // Zoek-register zonder permalink: filter op de zoekterm vóór de capture.
    if (query) {
      const ok = await applyRegisterFilter(page, query);
      if (!ok)
        console.warn(`\n    let op: geen filterveld gevonden voor query "${query}" — ongefilterde capture`);
    }

    const html = await page.content();
    fs.writeFileSync(`${base}.html`, html);
    // BOTH RENDERINGS MAY FAIL, AND THE .html IS STILL A REAL CAPTURE. page.content() is
    // what we actually fetched; the .pdf is a rendering of it, and 7 providers' prices
    // exist only in the HTML. So a failed rendering is a DEGRADED capture, never a reason
    // to discard the fetch — and never a reason to skip the hash: an unhashed body is
    // pushed unverified and then deadlocks the whole sync (issue #7).
    try {
      await page.pdf({ path: `${base}.pdf`, fullPage: true } as never).catch(async () => {
        // page.pdf werkt alleen headless-chromium; fallback: full-page screenshot
        await page.screenshot({ path: `${base}.png`, fullPage: true });
      });
    } catch (e) {
      // Elke faalroute eindigt HIER, vóór finishCapture. Een synchrone throw uit page.pdf of
      // page.screenshot gaat langs .catch heen, en `(e as Error).message` faalt zelf op een
      // niet-Error-rejectie: beide lieten het lichaam ongehasht achter (#7). String(e) niet.
      console.warn(`\n    let op: alleen HTML vastgelegd — pdf én png mislukt (${String(e)})`);
    }

    return finishCapture(base, html);
  } finally {
    await page.close();
  }
}

async function submitWayback(url: string): Promise<string | null> {
  const accessKey = process.env.WAYBACK_ACCESS_KEY;
  const secretKey = process.env.WAYBACK_SECRET_KEY;

  if (accessKey && secretKey) {
    // Officiële SPN2 API
    const res = await fetch("https://web.archive.org/save", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `LOW ${accessKey}:${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ url, capture_all: "1" }),
    });
    const body = (await res.json()) as { job_id?: string; message?: string };
    if (!body.job_id) {
      console.warn(`    wayback: ${body.message ?? "geen job_id"}`);
      return null;
    }
    // Poll tot de capture klaar is (max ~2 min)
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5_000));
      const status = (await (
        await fetch(`https://web.archive.org/save/status/${body.job_id}`, {
          headers: { Accept: "application/json", Authorization: `LOW ${accessKey}:${secretKey}` },
        })
      ).json()) as { status: string; timestamp?: string; original_url?: string; message?: string };
      if (status.status === "success" && status.timestamp)
        return `https://web.archive.org/web/${status.timestamp}/${status.original_url ?? url}`;
      if (status.status === "error") {
        console.warn(`    wayback: ${status.message ?? "capture mislukt"}`);
        return null;
      }
    }
    return null;
  }

  // Zonder sleutels: publieke save-URL (strakkere rate limits)
  const res = await fetch(`https://web.archive.org/save/${url}`, { redirect: "follow" });
  if (res.ok && res.url.includes("/web/")) return res.url;
  console.warn(`    wayback (zonder API-sleutels): HTTP ${res.status} — overweeg sleutels, zie scriptkop`);
  return null;
}

/** submitWayback met foutafvanging + één herkansing: een netwerkweigering
 *  (ECONNREFUSED = throttling) mag nooit de hele run laten crashen. */
async function trySubmitWayback(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await submitWayback(url);
    } catch (e) {
      const msg = (e as Error & { cause?: Error }).cause?.message ?? (e as Error).message;
      if (attempt === 1) {
        process.stdout.write(`verbinding geweigerd (${msg}), 30s wachten en opnieuw… `);
        await new Promise((r) => setTimeout(r, 30_000));
      } else {
        console.warn(`mislukt (${msg}) — sla over, draai later opnieuw zonder --force`);
      }
    }
  }
  return null;
}

/** What actually writes the local copy. Injected so a test can drive captureNode without
 *  a browser — and, in #6, make the capture fail on demand. `capture` is REQUIRED, not
 *  defaulted: Playwright stays inside main()'s closure over saveLocalCopy, its one
 *  production call site, so it is an implementation detail of one function rather than
 *  a parameter threaded through the module. */
export type Capture = (dir: string, sourceId: string, url: string, query?: string) => Promise<string>;

export interface CaptureDeps {
  capture: Capture;
  submitWayback: (url: string) => Promise<string | null>;
  force: boolean;
  skipWayback: boolean;
  /** Throttle pause in ms after a Wayback submission. Injected because archive.org
   *  throttles hard and the real value is 10-30s — a test must not sleep for it. */
  pauseMs: number;
}

export interface CaptureResult {
  /** The node was modified and its file needs writing. */
  changed: boolean;
  /** The source id whose LOCAL capture threw this run, or null. Returned rather than
   *  pushed into module state: a hidden global is neither assertable nor visible to a
   *  reader of this function's signature. */
  failedCapture: string | null;
}

/**
 * Capture ONE source-like node into `data/archives/<dir>/`: local copy + Wayback.
 *
 * Extracted so the shared reference store (spec §4.1b) goes through the EXACT same path
 * as a provider's `sources[]` entry — same naming, same .sha256 sidecar, same
 * Wayback-pointless rule. A second, parallel capture routine for references would drift,
 * and the thing it would drift on is the sidecar that the whole evidentiary chain rests on.
 * The shapes differ only in where the node sits: a provider's is an item in `sources[]`,
 * a reference's IS the document root.
 *
 * Returns a CaptureResult: `.changed` is true if the node was modified and its file
 * needs writing; `.failedCapture` is the source id if its local capture threw, else null.
 */
export async function captureNode(
  node: import("yaml").YAMLMap,
  dir: string,
  deps: CaptureDeps,
): Promise<CaptureResult> {
  const sourceId = node.get("id") as string;
  const url = node.get("url") as string | undefined;
  // SAY SO. A source with no url is one the archiver structurally cannot handle (a gated
  // brochure, a hand-placed body), and silence makes it indistinguishable from one that was
  // captured fine — every other source scrolls past with `ok`. The Wayback-exclusion and
  // Wayback-pointless branches already announce themselves; this one did not.
  if (!url) {
    console.log(`  ${sourceId}: overgeslagen (geen url — handmatig vastleggen en hashen)`);
    return { changed: false, failedCapture: null };
  }
  const note = (node.get("note") as string | undefined) ?? "";
  const query = node.get("query") as string | undefined;
  const excluded = /wayback-exclusie/i.test(note);
  let changed = false;
  let failedCapture: string | null = null;

  // 1. lokale kopie. "Al gearchiveerd" = het local_snapshot-pad is niet
  //    alleen gedeclareerd in de YAML, maar het bestand bestaat ook echt.
  //    Zo vult een gewone run pre-ingevulde-maar-ontbrekende kopieën aan
  //    (zonder --force), terwijl bestaande snapshots overgeslagen blijven.
  //    Dat verschil is de reden voor de bestandstest; een test op alleen het
  //    gedeclareerde pad zou beide gevallen als "klaar" lezen.
  const declaredLocal = node.get("local_snapshot") as string | undefined;
  const hasLocal = !!declaredLocal && fs.existsSync(path.join(process.cwd(), declaredLocal));
  if (!hasLocal || deps.force) {
    process.stdout.write(`  ${sourceId}: lokale kopie${query ? ` (filter: "${query}")` : ""}… `);
    try {
      const rel = await deps.capture(dir, sourceId, url, query);
      node.set("local_snapshot", rel);
      changed = true;
      console.log("ok");
    } catch (e) {
      // LOG, CONTINUE — BUT REMEMBER. Continuing is right: one unreachable host must not
      // abandon the other 49 providers. Exiting 0 afterwards is not. A --all run prints
      // hundreds of lines with 10-30s Wayback pauses between them, so nobody is watching
      // when one scrolls past; the run then ends on "Klaar" and the researcher commits a
      // source that has no capture at all. stderr + a tally + a non-zero exit, so the
      // failure survives the scrollback.
      console.error(`MISLUKT (${(e as Error).message})`);
      failedCapture = sourceId;
    }
  }

  // NO HALF-RECORD. CLAUDE.md: "ALWAYS both" — a public archive AND a dated local copy.
  // Writing `archived_url` here, with the local capture just failed, produces a record
  // claiming a public archive it holds no local copy for: the exact inverse of what
  // methodologie.md publishes. Returning also skips a pointless submission and its 10-30s
  // throttle pause on a run that has already failed. The run still exits non-zero and
  // names this source; the next run retries both halves together.
  if (failedCapture) return { changed, failedCapture };

  // 2. publiek archief
  const archived = node.get("archived_url") as string | null | undefined;
  const needsWayback = archived == null || deps.force;
  if (excluded) {
    if (needsWayback) console.log(`  ${sourceId}: Wayback-exclusie — handmatig via archive.today`);
  } else if (WAYBACK_POINTLESS.some((re) => re.test(url))) {
    if (needsWayback)
      console.log(`  ${sourceId}: Wayback overgeslagen (JS-shell zonder bewijswaarde) — lokale kopie is het bewijs`);
  } else if (!deps.skipWayback && needsWayback) {
    process.stdout.write(`  ${sourceId}: wayback… `);
    const snapshot = await deps.submitWayback(url);
    if (snapshot) {
      node.set("archived_url", snapshot);
      changed = true;
      console.log("ok");
    } else console.log("geen snapshot");
    // Zonder API-sleutels throttlet archive.org agressief; ruim pauzeren.
    await new Promise((r) => setTimeout(r, deps.pauseMs));
  }

  return { changed, failedCapture };
}

/** Which reference files this run selects. ONE definition: the emptiness guard in main() and
 *  the capture loop must agree, or the run aborts on "nothing selected" while a reference was
 *  in fact selected — or worse, the reverse. It was written out twice, with `"_references"`
 *  spelled literally in one and via the constant in the other. */
function selectedReferenceFiles(): string[] {
  if (!fs.existsSync(REFERENCE_DIR)) return [];
  return fs
    .readdirSync(REFERENCE_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .filter(
      (f) => ALL || ids.includes(f.replace(/\.yaml$/, "")) || ids.includes(REFERENCE_DIR_NAME),
    );
}

/**
 * The shared reference store (spec §4.1b, v0.13). Each file is ONE document, so the root
 * node is the source. Bodies land in `data/archives/_references/`, never under a provider —
 * a normative document belongs to no school, and filing it under the one school that
 * prompted reading it is what this store exists to stop.
 */
async function archiveReferences(deps: CaptureDeps): Promise<string[]> {
  const failed: string[] = [];
  const files = selectedReferenceFiles();
  if (files.length === 0) return failed;

  console.log("\n_references");
  for (const file of files) {
    const filePath = path.join(REFERENCE_DIR, file);
    const doc = parseDocument(fs.readFileSync(filePath, "utf8"));
    const { changed, failedCapture } = await captureNode(
      doc.contents as import("yaml").YAMLMap, REFERENCE_DIR_NAME, deps,
    );
    if (failedCapture) failed.push(failedCapture);
    if (changed) {
      fs.writeFileSync(filePath, doc.toString());
      console.log(`  → references/${file} bijgewerkt`);
    }
  }
  return failed;
}

async function main() {
  /** Sources whose local capture threw this run. A run that ends green over one of these
   *  is a record shipping with no capture behind it. */
  const failedCaptures: string[] = [];

  console.log(
    process.env.WAYBACK_ACCESS_KEY
      ? "Wayback: API-sleutels geladen (SPN2-route)"
      : "Wayback: geen API-sleutels — publieke save-route met ruime pauzes",
  );
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();

  // Playwright is closed over here and nowhere else.
  const deps: CaptureDeps = {
    capture: (dir, sourceId, url, query) => saveLocalCopy(browser, dir, sourceId, url, query),
    submitWayback: trySubmitWayback,
    force: FORCE,
    skipWayback: SKIP_WAYBACK,
    pauseMs: process.env.WAYBACK_ACCESS_KEY ? 10_000 : 30_000,
  };

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .filter((f) => ALL || ids.includes(f.replace(/\.yaml$/, "")));
  // A references-only run (`npm run archive -- _references`) selects zero PROVIDERS and is
  // perfectly valid, so "nothing selected" can only be judged after the reference store has
  // had its say — otherwise the store is unreachable except via --all.
  const referenceFiles = selectedReferenceFiles();
  if (files.length === 0 && referenceFiles.length === 0) {
    console.error(
      "Niets geselecteerd. Gebruik: npm run archive -- <provider-id> | _references | <referentie-id> | --all",
    );
    process.exit(1);
  }

  // EVERY ID MUST MATCH SOMETHING. Widening the guard to "nothing at all matched" opened a
  // hole it did not have before: `npm run archive -- ya-standards-2026-07 tribes-acadmy`
  // (typo) matches the reference, so the guard stays quiet, the typo is never mentioned, and
  // the run exits 0 while the author believes a provider was re-archived.
  if (!ALL) {
    const matched = new Set([
      ...files.map((f) => f.replace(/\.yaml$/, "")),
      ...referenceFiles.map((f) => f.replace(/\.yaml$/, "")),
      ...(referenceFiles.length ? [REFERENCE_DIR_NAME] : []),
    ]);
    const unknown = ids.filter((id) => !matched.has(id));
    if (unknown.length) {
      console.error(`Onbekende id('s): ${unknown.join(", ")} — geen provider en geen referentie.`);
      process.exit(1);
    }
  }

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const doc = parseDocument(fs.readFileSync(filePath, "utf8"));
    const providerId = doc.get("id") as string;
    const sources = doc.get("sources") as import("yaml").YAMLSeq | undefined;
    if (!sources) continue;
    console.log(`\n${providerId}`);
    let changed = false;

    for (const item of sources.items as import("yaml").YAMLMap[]) {
      const { changed: nodeChanged, failedCapture } = await captureNode(item, providerId, deps);
      if (nodeChanged) changed = true;
      if (failedCapture) failedCaptures.push(failedCapture);
      // Direct opslaan na elke bron: een crash verderop gooit zo nooit
      // reeds behaald resultaat weg.
      if (changed) fs.writeFileSync(filePath, doc.toString());
    }

    if (changed) console.log(`  → ${file} bijgewerkt`);
  }

  failedCaptures.push(...(await archiveReferences(deps)));

  await browser.close();

  // DE BODIES NAAR DE PRIVATE ARCHIEFREPO. Standaard, niet op verzoek: de hash die we
  // publiceren is pas iets waard zolang de body ergens bestaat, en "ergens" was tot nu
  // toe één laptop. Zie scripts/sync-archive.ts.
  if (!NO_SYNC) syncArchive();

  if (failedCaptures.length) {
    console.error(
      `\n✗ ${failedCaptures.length} lokale capture(s) MISLUKT: ${failedCaptures.join(", ")}`,
    );
    console.error("  Die bronnen hebben GEEN kopie. Draai ze opnieuw voordat je commit.");
    process.exitCode = 1;
    return;
  }

  console.log("\nKlaar. Draai `npm run validate` en commit data/ in git (dateert de hashes).");
}

// Importing this module must not archive anything. `main()` at module scope means any
// test that imports captureNode launches Chromium and starts hitting the network —
// which is why this file had no tests. Same guard sync-archive.ts already uses.
// path.sep + "archive.ts", not just "archive.ts": the bare suffix also matches
// sync-archive.ts (and any my-archive.ts) — latent there, but this module is now
// importable, so the collision is reachable here.
if (process.argv[1] && path.resolve(process.argv[1]).endsWith(path.sep + "archive.ts")) {
  if (SYNC_ONLY) {
    syncArchive();
  } else {
    main().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  }
}
