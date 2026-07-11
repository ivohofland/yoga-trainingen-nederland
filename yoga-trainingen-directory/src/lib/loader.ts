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
import { Provider } from "../schema";

const DATA_DIR = path.join(process.cwd(), "data", "providers");

export interface LoadResult {
  providers: Provider[];
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

function integrityErrors(p: Provider, file: string): string[] {
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

  // 4. claim scopes must resolve
  for (const claim of p.claims) {
    const [kind, id] = claim.scope.split(":");
    if (kind === "program" && id && !programIds.has(id))
      errors.push(`${file}: claim '${claim.id}' scoped to unknown program '${id}'`);
    if (kind === "module" && id && !moduleIds.has(id))
      errors.push(`${file}: claim '${claim.id}' scoped to unknown module '${id}'`);
  }

  return errors;
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
