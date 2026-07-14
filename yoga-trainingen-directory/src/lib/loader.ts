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

/** The checks Zod cannot express. Exported so the tests can put a record THROUGH
 *  them — a check that only ever runs over data that already passes it is a check
 *  whose failure branch nothing has proven. */
export function integrityErrors(p: Provider, file: string): string[] {
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

  // 4. prerequisite.program must resolve, and the chain must not CYCLE (spec v0.9).
  //
  //    A cycle is a VALIDATION ERROR, never a silent stop in the arithmetic. Two
  //    programmes that each gate the other describe no path a student can walk, and
  //    `totalPathCost` returning *some* number for it would publish a total for a route
  //    that does not exist — about a named business, in a price band, in a sort order,
  //    indistinguishable from a real one. The derivation guards itself against infinite
  //    recursion (see purchasableGates), but the guard is for termination; the record must
  //    not load at all.
  for (const program of p.programs) {
    for (const pre of program.prerequisite ?? []) {
      if (pre.program == null) continue;
      if (pre.kind !== "program")
        errors.push(
          `${file}: program '${program.id}' prerequisite '${pre.label}' points at program '${pre.program}' but has kind '${pre.kind}' — only kind 'program' is a training you must buy`,
        );
      if (!programIds.has(pre.program))
        errors.push(
          `${file}: program '${program.id}' has a prerequisite on unknown program '${pre.program}'`,
        );
    }
  }
  for (const program of p.programs) {
    const cycle = prerequisiteCycle(p, program.id, []);
    if (cycle)
      errors.push(
        `${file}: prerequisite cycle ${cycle.join(" → ")} — a programme cannot be its own gate, and a path cost over a cycle is a total for a route no student can walk`,
      );
  }

  // 5. claim scopes must resolve
  for (const claim of p.claims) {
    const [kind, id] = claim.scope.split(":");
    if (kind === "program" && id && !programIds.has(id))
      errors.push(`${file}: claim '${claim.id}' scoped to unknown program '${id}'`);
    if (kind === "module" && id && !moduleIds.has(id))
      errors.push(`${file}: claim '${claim.id}' scoped to unknown module '${id}'`);

    // 6. A claim's quote is the provider's WORDS. The delimiters are the
    //    RENDERER's: the record page wraps every quote in curly quotes, so a value
    //    stored with its own outer quote marks renders as “"Het eerste jaar…"” —
    //    doubled. One of 34 claims was stored that way (de-yogaschool-enschede,
    //    meester-lineage), and the researcher's typing habit is the obvious way for
    //    the next one to arrive: a composed quotation, pasted with the quote marks
    //    that framed it while it was being assembled.
    //
    //    Stripping them at render time would be worse than this check: a renderer
    //    that edits a verbatim quote is a renderer that can edit a verbatim quote,
    //    and §3 says nothing may. So the DATA must be clean, and the load must
    //    refuse data that is not. Quotes INSIDE the text are untouched — only a
    //    value that both opens and closes with one is delimited rather than quoting.
    if (isDelimited(claim.quote))
      errors.push(
        `${file}: claim '${claim.id}' has a quote wrapped in quote marks (${claim.quote.slice(0, 1)}…${claim.quote.slice(-1)}). ` +
        `Store the provider's words only — the renderer supplies the quotation marks, so stored ones render doubled.`,
      );
  }

  return errors;
}

/**
 * The prerequisite chain from `programId`, or the cycle it runs into.
 *
 * Depth-first over `prerequisite[].program` — the only link that can cycle, because it is
 * the only one that points BACK INTO this record. Returns the offending path
 * (`a → b → a`) so the error names the route, not merely the record.
 */
function prerequisiteCycle(p: Provider, programId: string, path: string[]): string[] | null {
  if (path.includes(programId)) return [...path, programId];
  const program = p.programs.find((pr) => pr.id === programId);
  if (!program) return null; // unresolvable ref — reported by its own check above
  for (const pre of program.prerequisite ?? []) {
    if (pre.program == null) continue;
    const cycle = prerequisiteCycle(p, pre.program, [...path, programId]);
    if (cycle) return cycle;
  }
  return null;
}

/** Straight and curly, opening and closing, single and double: every mark a
 *  researcher's keyboard or a website's stylesheet can produce. */
const QUOTE_MARKS = ['"', "“", "”", "'", "‘", "’"];

function isDelimited(quote: string): boolean {
  const text = quote.trim();
  // A one-character value cannot be both delimiters; requiring 2 also stops a bare
  // `"` from reporting itself as its own opening and closing mark.
  if (text.length < 2) return false;
  return QUOTE_MARKS.includes(text[0]) && QUOTE_MARKS.includes(text[text.length - 1]);
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
