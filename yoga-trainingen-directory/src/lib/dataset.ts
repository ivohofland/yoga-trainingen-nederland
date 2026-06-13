/**
 * Dataset loader: reads /data/providers/*.yaml, validates against the Zod
 * schema, runs referential-integrity checks, and exposes derived values.
 * Derived values are computed here and NEVER stored (spec §6).
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { Provider, type Program } from "../schema";

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

/* ---------- derived values (computed, never stored — spec §6) ---------- */

export interface PricePerContactHour {
  value: number | null;
  /** Why no value, or why comparison needs a flag. */
  caveat?: string;
}

export function pricePerContactHour(program: Program): PricePerContactHour {
  const amount = program.price.amount_eur;
  const contact = program.hours_claimed.contact;
  if (amount == null) return { value: null, caveat: "prijs niet gepubliceerd" };
  if (contact == null) return { value: null, caveat: "contacturen niet gepubliceerd" };
  // Comparability guard: includes/excludes change what the price buys.
  const caveats: string[] = [];
  if (program.price.includes) caveats.push(`prijs inclusief: ${program.price.includes}`);
  if (program.price.excludes) caveats.push(`prijs exclusief: ${program.price.excludes}`);
  return {
    value: Math.round((amount / contact) * 100) / 100,
    caveat: caveats.length ? caveats.join("; ") : undefined,
  };
}

export function contactRatio(program: Program): number | null {
  const { total, contact } = program.hours_claimed;
  if (total == null || contact == null) return null;
  return Math.round((contact / total) * 100) / 100;
}

export function bundleDelta(provider: Provider, program: Program): number | null {
  const moduleIds = program.composition?.modules;
  if (!moduleIds?.length || program.price.amount_eur == null) return null;
  let sum = 0;
  for (const id of moduleIds) {
    const mod = provider.modules.find((m) => m.id === id);
    if (mod?.price?.amount_eur == null) return null; // incomplete → no derivation
    sum += mod.price.amount_eur;
  }
  return Math.round((program.price.amount_eur - sum) * 100) / 100;
}

/** % of layer-1 fields filled → powers the depth badge honestly. */
export function completeness(p: Provider): number {
  let filled = 0;
  let total = 0;
  const count = (cond: boolean) => {
    total += 1;
    if (cond) filled += 1;
  };
  count(p.locations.some((l) => l.city != null));
  count(p.crkbo.registered !== "unknown");
  for (const program of p.programs) {
    count(program.price.amount_eur != null || program.price.published !== "unknown");
    count(program.hours_claimed.breakdown_published !== "unknown");
    count(program.accreditation.length > 0 || program.format_label === "none");
    count(!!program.delivery.language);
  }
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

/* ---------- QA / review report (read-only authoring aid) ---------- */

export interface ProviderQa {
  completeness: number;
  /** Sources still missing a public archive — below the publication bar. */
  unarchivedSources: number;
  totalSources: number;
  /** Months since last_verified, for a staleness flag (null if unparseable). */
  ageMonths: number | null;
  /** Open work: only `unknown` quad-states (genuine gaps), never `not_published`
   *  (which is a finding, not a gap — see spec §2). */
  gaps: string[];
}

/** Surfaces what a record still needs. Pure read — never mutates the dataset. */
export function providerQa(p: Provider, now = new Date()): ProviderQa {
  const gaps: string[] = [];
  if (p.crkbo.registered === "unknown") gaps.push("CRKBO: nog niet onderzocht");

  for (const program of p.programs) {
    const tag = program.id;
    if (program.price.amount_eur == null && program.price.published === "unknown")
      gaps.push(`${tag}: prijs nog niet onderzocht`);
    if (program.hours_claimed.breakdown_published === "unknown")
      gaps.push(`${tag}: urenuitsplitsing nog niet onderzocht`);
    if (program.hours_claimed.supervised_teaching_practice == null)
      gaps.push(`${tag}: begeleide lespraktijk niet vermeld`);
    if (!program.delivery.language) gaps.push(`${tag}: voertaal ontbreekt`);
  }

  const unarchivedSources = p.sources.filter((s) => s.archived_url == null).length;

  const m = /^(\d{4})-(\d{2})/.exec(p.last_verified);
  const ageMonths = m
    ? (now.getFullYear() - Number(m[1])) * 12 + (now.getMonth() + 1 - Number(m[2]))
    : null;

  return {
    completeness: completeness(p),
    unarchivedSources,
    totalSources: p.sources.length,
    ageMonths,
    gaps,
  };
}
