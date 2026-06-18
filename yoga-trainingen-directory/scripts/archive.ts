/**
 * Archiveer-automatisering: voor elke bron in de provider-records
 *   1. lokale kopie    — Playwright rendert de pagina (incl. JS) en bewaart
 *                        volledige-pagina-PDF + HTML + SHA-256-hash in
 *                        data/archives/<provider>/
 *   2. publiek archief — Wayback Save Page Now; snapshot-URL wordt
 *                        teruggeschreven in het record (comments blijven staan)
 *
 * Draait LOKAAL (niet in CI zonder netwerk). Vereist: npx playwright install chromium
 *
 * Gebruik:
 *   npm run archive -- <provider-id> [...meer ids]
 *   npm run archive -- --all              # alle providers
 *   npm run archive -- --all --force      # ook bronnen die al een kopie hebben
 *   npm run archive -- --all --skip-wayback
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

// Minimale .env-loader (geen dependency): KEY=VALUE per regel, # = commentaar.
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
const ARCHIVE_DIR = path.join(process.cwd(), "data", "archives");
const args = process.argv.slice(2);
const ALL = args.includes("--all");
const FORCE = args.includes("--force");
const SKIP_WAYBACK = args.includes("--skip-wayback");
const ids = args.filter((a) => !a.startsWith("--"));

const today = new Date().toISOString().slice(0, 10);

/** Bronnen waar een Wayback-snapshot geen bewijswaarde heeft. Twee gevallen:
 *  - JS-shell (Salesforce YA-register): Wayback slaat header/footer op zonder data.
 *  - Zoek-register zonder permalink (CRKBO): Wayback legt alleen pagina 1 vast,
 *    nooit de gezochte rij.
 *  In beide gevallen is de lokale (eventueel gefilterde) Playwright-kopie het
 *  bewijs; Wayback wordt overgeslagen. */
const WAYBACK_POINTLESS = [/app\.yogaalliance\.org/, /crkbo\.nl\/Register\//i];

function sha256(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
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

async function saveLocalCopy(
  browser: import("playwright").Browser,
  providerId: string,
  sourceId: string,
  url: string,
  query?: string,
): Promise<string> {
  const dir = path.join(ARCHIVE_DIR, providerId);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `${sourceId}-${today}`);

  const page = await browser.newPage();
  try {
    // domcontentloaded i.p.v. networkidle: Salesforce-achtige apps houden
    // permanent verbindingen open, waardoor networkidle nooit optreedt.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
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
    await page.pdf({ path: `${base}.pdf`, fullPage: true } as never).catch(async () => {
      // page.pdf werkt alleen headless-chromium; fallback: full-page screenshot
      await page.screenshot({ path: `${base}.png`, fullPage: true });
    });

    const hashes = [
      `${sha256(html)}  ${path.basename(base)}.html`,
      fs.existsSync(`${base}.pdf`) ? `${sha256(fs.readFileSync(`${base}.pdf`))}  ${path.basename(base)}.pdf` : null,
      fs.existsSync(`${base}.png`) ? `${sha256(fs.readFileSync(`${base}.png`))}  ${path.basename(base)}.png` : null,
    ].filter(Boolean);
    fs.writeFileSync(`${base}.sha256`, hashes.join("\n") + "\n");

    return path.relative(process.cwd(), `${base}.pdf`).replaceAll("\\", "/");
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

async function main() {
  console.log(
    process.env.WAYBACK_ACCESS_KEY
      ? "Wayback: API-sleutels geladen (SPN2-route)"
      : "Wayback: geen API-sleutels — publieke save-route met ruime pauzes",
  );
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .filter((f) => ALL || ids.includes(f.replace(/\.yaml$/, "")));
  if (files.length === 0) {
    console.error("Geen providers geselecteerd. Gebruik: npm run archive -- <id> | --all");
    process.exit(1);
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
      const sourceId = item.get("id") as string;
      const url = item.get("url") as string | undefined;
      if (!url) continue;
      const note = (item.get("note") as string | undefined) ?? "";
      const query = item.get("query") as string | undefined;
      const excluded = /wayback-exclusie/i.test(note);

      // 1. lokale kopie
      const hasLocal = !!item.get("local_snapshot");
      if (!hasLocal || FORCE) {
        process.stdout.write(`  ${sourceId}: lokale kopie${query ? ` (filter: "${query}")` : ""}… `);
        try {
          const rel = await saveLocalCopy(browser, providerId, sourceId, url, query);
          item.set("local_snapshot", rel);
          changed = true;
          console.log("ok");
        } catch (e) {
          console.log(`MISLUKT (${(e as Error).message})`);
        }
      }

      // 2. publiek archief
      const archived = item.get("archived_url") as string | null | undefined;
      const needsWayback = archived == null || FORCE;
      if (excluded) {
        if (needsWayback) console.log(`  ${sourceId}: Wayback-exclusie — handmatig via archive.today`);
      } else if (WAYBACK_POINTLESS.some((re) => re.test(url))) {
        if (needsWayback)
          console.log(`  ${sourceId}: Wayback overgeslagen (JS-shell zonder bewijswaarde) — lokale kopie is het bewijs`);
      } else if (!SKIP_WAYBACK && needsWayback) {
        process.stdout.write(`  ${sourceId}: wayback… `);
        const snapshot = await trySubmitWayback(url);
        if (snapshot) {
          item.set("archived_url", snapshot);
          changed = true;
          console.log("ok");
        } else console.log("geen snapshot");
        // Zonder API-sleutels throttlet archive.org agressief; ruim pauzeren.
        const pause = process.env.WAYBACK_ACCESS_KEY ? 10_000 : 30_000;
        await new Promise((r) => setTimeout(r, pause));
      }

      // Direct opslaan na elke bron: een crash verderop gooit zo nooit
      // reeds behaald resultaat weg.
      if (changed) fs.writeFileSync(filePath, doc.toString());
    }

    if (changed) console.log(`  → ${file} bijgewerkt`);
  }

  await browser.close();
  console.log("\nKlaar. Draai `npm run validate` en commit data/ in git (dateert de kopieën).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
