/**
 * Exports the validated dataset as static JSON — this IS the API (spec §1):
 * versioned, cacheable, zero runtime. The future values-brand frontend can
 * consume the same export without touching this repo.
 *
 * A thin WRITER, and nothing more. The payload's shape and its derived values
 * live in src/lib/api.ts, which is pure — so the test suite can hold what this
 * script emits against what the two site surfaces render, and prove all three say
 * the same thing about every named business. Read the header of api.ts for why
 * shipping the raw records was not merely thin but dangerous.
 */
import fs from "node:fs";
import path from "node:path";
import { loadDataset } from "../src/lib/loader";
import { API_VERSION, toApiPayload } from "../src/lib/api";

const { providers, errors } = loadDataset();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const outDir = path.join(process.cwd(), "public", "data", API_VERSION);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "providers.json"),
  JSON.stringify(toApiPayload(providers), null, 2),
);
console.log(
  `exported ${providers.length} providers (+ derived) → public/data/${API_VERSION}/providers.json`,
);
