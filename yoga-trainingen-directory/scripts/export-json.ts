/**
 * Exports the validated dataset as static JSON — this IS the API (spec §1):
 * versioned, cacheable, zero runtime. The future values-brand frontend can
 * consume the same export without touching this repo.
 */
import fs from "node:fs";
import path from "node:path";
import { loadDataset } from "../src/lib/dataset";

const { providers, errors } = loadDataset();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const outDir = path.join(process.cwd(), "public", "data", "v1");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "providers.json"),
  JSON.stringify({ generated: new Date().toISOString(), count: providers.length, providers }, null, 2),
);
console.log(`exported ${providers.length} providers → public/data/v1/providers.json`);
