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
import { Provider } from "../src/schema";

const schema = zodToJsonSchema(Provider, { name: "Provider", target: "jsonSchema7" });
const out = path.join(process.cwd(), "data", "provider.schema.json");
fs.writeFileSync(out, JSON.stringify(schema, null, 2) + "\n");
console.log(`wrote ${path.relative(process.cwd(), out)}`);
