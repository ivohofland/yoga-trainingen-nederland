/**
 * Generates a JSON Schema from the Provider Zod schema and writes it to
 * data/provider.schema.json. Each data/providers/*.yaml points at it with a
 *   # yaml-language-server: $schema=../provider.schema.json
 * header, so any editor with a YAML language server gives autocomplete, enum
 * hints (the quad-states), and inline validation while editing — the "nice
 * editing" experience without an edit UI.
 *
 * The Zod schema (mirroring the spec) stays the single source of truth; this
 * file is derived and regenerated on build, so it can't drift. Output is a pure
 * function of the schema (no timestamps), so unchanged schemas rewrite
 * byte-identically.
 */
import fs from "node:fs";
import path from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Provider, Reference } from "../src/schema";

/** Every data file that names a $schema must have one generated for it. The reference store
 *  shipped with `# yaml-language-server: $schema=../reference.schema.json` on all five records
 *  and nothing emitting that file — a header promising editor validation that silently did
 *  nothing, which is worse than no header at all. */
for (const [name, zod, file] of [
  ["Provider", Provider, "provider.schema.json"],
  ["Reference", Reference, "reference.schema.json"],
] as const) {
  const schema = zodToJsonSchema(zod, { name, target: "jsonSchema7" });
  const out = path.join(process.cwd(), "data", file);
  fs.writeFileSync(out, JSON.stringify(schema, null, 2) + "\n");
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}
