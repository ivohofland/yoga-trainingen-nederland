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

// Currency is a pure function of the data: the most recent last_verified across
// all records. Build time would change on every run (churning the committed
// file); this only changes when the data does, so unchanged data rebuilds
// byte-identically — and it answers the question a consumer actually has
// ("how fresh is this?") rather than "when was the build run?".
const dataCurrentAsOf = providers.map((p) => p.last_verified).sort().at(-1) ?? null;

const outDir = path.join(process.cwd(), "public", "data", "v1");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "providers.json"),
  JSON.stringify({ data_current_as_of: dataCurrentAsOf, count: providers.length, providers }, null, 2),
);
console.log(`exported ${providers.length} providers → public/data/v1/providers.json`);
