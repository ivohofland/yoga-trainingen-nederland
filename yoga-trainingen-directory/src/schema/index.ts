/**
 * Zod schemas for the yoga teacher training directory.
 * Mirrors data-model-spec.md v0.2 — the spec is the source of truth;
 * change the spec first, then this file.
 *
 * Core principles encoded here (see spec §2):
 * - Quad-state for observable booleans: "we looked and they don't say"
 *   (not_published) is data; "we haven't looked" (unknown) is a gap.
 * - Claims vs facts: *_claimed fields and verbatim quotes; verified facts
 *   carry a source.
 * - No composite scores anywhere.
 * - Brand name is the canonical identifier; register entities are data
 *   about the brand (holder, invoicing_entity).
 */
import { z } from "zod";

/**
 * All object schemas are strict: an unknown key is a validation ERROR, not
 * silently dropped. Non-strict Zod would strip a misplaced or mistyped field
 * (e.g. a `note` under the wrong parent), so `npm run validate` passed while the
 * data was quietly lost on load/export. Strict makes validate (and CI) catch
 * that class of bug — matching the generated JSON Schema (additionalProperties:
 * false), so the editor and the build agree.
 */
const strictObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

/* ---------- primitives ---------- */

/** yes | no | not_published | unknown — see spec §2.2 */
export const Quad = z.enum(["yes", "no", "not_published", "unknown"]);
export type Quad = z.infer<typeof Quad>;

/** YYYY-MM or YYYY-MM-DD */
export const YearMonth = z
  .string()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/, "expected YYYY-MM or YYYY-MM-DD");

export const Year = z.number().int().min(1900).max(2100);

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "expected kebab-case slug");

/* ---------- Source (provenance anchor, spec §4.1) ---------- */

export const Source = strictObject({
  id: z.string(),
  type: z.enum([
    "website",
    "wayback",
    "brochure",
    "register",
    "inquiry_response",
    "reader_report",
    "email",
    "other",
  ]),
  url: z.string().url().optional(),
  /** Archive BEFORE citing critically. null = consciously not yet archived. */
  archived_url: z.string().url().nullable().optional(),
  /** Reproducible search term for a no-permalink register (CRKBO, the Salesforce
   *  YA grids — spec §4.1/§4.11). The archive script types it into the register's
   *  name filter and snapshots the FILTERED result; a bare fetch/Wayback of these
   *  registers only ever captures page 1, so the dated local snapshot is the proof. */
  query: z.string().optional(),
  /** Repo-relative path to a local evidence snapshot (text extraction, PDF, screenshot). */
  local_snapshot: z.string().optional(),
  captured: YearMonth,
  note: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

/* ---------- shared sub-objects ---------- */

export const Price = strictObject({
  /** Comparable base: cheapest generally-available variant (methodology convention). */
  amount_eur: z.number().positive().nullable().optional(),
  variants: z
    .array(strictObject({ label: z.string(), amount_eur: z.number().positive() }))
    .optional(),
  vat: z.enum(["incl", "exempt_crkbo", "excl", "unknown"]),
  published: Quad,
  includes: z.string().optional(),
  /** Mandatory-but-excluded costs break price comparisons — first-class field. */
  excludes: z.string().optional(),
  note: z.string().optional(),
  source: z.string().optional(),
});
export type Price = z.infer<typeof Price>;

export const Accreditation = strictObject({
  body: z.enum(["yoga_alliance", "vyn", "crkbo", "other"]),
  label_claimed: z.string(),
  verified: Quad,
  source: z.string().optional(),
  note: z.string().optional(),
});

export const Registration = strictObject({
  body: z.enum(["yoga_alliance", "vyn", "other"]),
  identifier: z.string().optional(),
  /** Name the registration is actually held under — often a person/BV, not the brand. */
  holder: z.string().optional(),
  first_registered: YearMonth.optional(),
  verified_in_register: Quad,
  source: z.string().optional(),
  note: z.string().optional(),
});

/* ---------- Module (spec §4.4) ---------- */

export const Module = strictObject({
  id: slug,
  name: z.string(),
  url: z.string().url().optional(),
  hours: z
    .object({
      total: z.number().positive().nullable().optional(),
      contact: z.number().positive().nullable().optional(),
    })
    .strict()
    .optional(),
  /** Some providers advertise modules in days only (pilot: YAN). */
  days_claimed: z.number().positive().optional(),
  type: z.enum(["core_pedagogy", "specialization", "other"]),
  sold_separately: Quad.optional(),
  listed_in_ce_catalog: Quad.optional(),
  price: Price.partial({ published: true }).optional(),
  note: z.string().optional(),
});
export type Module = z.infer<typeof Module>;

/* ---------- Cohort (type/instance split, spec §4.5) ---------- */

export const Cohort = strictObject({
  id: z.string(),
  program: slug.optional(), // redundant when nested, kept for cross-checking
  start: YearMonth,
  end: YearMonth.optional(),
  /** REQUIRED: an advertised cohort recorded as if it ran is the trap (§8). */
  status: z.enum(["announced", "confirmed_ran", "cancelled", "unknown"]),
  /** REQUIRED: the source makes the difference between claim and fact. */
  source: z.string(),
  price_at_time: z
    .object({ amount_eur: z.number().positive(), vat: Price.shape.vat })
    .strict()
    .optional(),
  lead_teachers: z.array(z.string()).optional(),
  /** Per-run override where program-level language is "mixed" ("depends on the group"). */
  language: z.enum(["nl", "en", "mixed"]).optional(),
  note: z.string().optional(),
});
export type Cohort = z.infer<typeof Cohort>;

/* ---------- Claim (verbatim quotes, spec §4.6) ---------- */

export const Claim = strictObject({
  id: z.string(),
  scope: z.string(), // "provider" | "program:<id>" | "module:<id>"
  /** VERBATIM — quote them, never characterize them (legal posture §3). */
  quote: z.string(),
  category: z.enum([
    "scientific",
    "health_outcome",
    "income_outcome",
    "accreditation",
    "lineage_authority",
    "scope_of_practice",
    "other",
  ]),
  source: z.string(),
  /** Layer 3 only; separate from the quote, methodology-versioned. */
  analysis: z
    .object({
      note: z.string(),
      status: z.enum(["accurate", "unsubstantiated", "misleading", "regulated_claim"]),
      reviewed: YearMonth,
      methodology_version: z.string(),
    })
    .strict()
    .optional(),
});
export type Claim = z.infer<typeof Claim>;

/* ---------- Person (spec §4.7, layer 3) ---------- */

export const Person = strictObject({
  id: slug,
  /** Publicly used name — often a yogic/spiritual (dharma) name (spec §4.7). */
  name: z.string(),
  /** Civil/registered name when it differs from `name` and is publicly
   *  self-disclosed or register-evidenced. The verification anchor: registers
   *  (YA/CRKBO/KvK/BIG) key on this, not the dharma name. Record only when the
   *  teacher made it public — never de-anonymize (AVG, §3/§4.7). */
  legal_name: z.string().optional(),
  trainings_claimed: z
    .array(
      strictObject({
        label: z.string(),
        school: z.string().optional(),
        year: Year.optional(),
        verified: Quad,
        source: z.string().optional(),
      }),
    )
    .optional(),
  /** Healthcare credentials are BIG-register-verifiable — the hard axis. */
  background: z
    .array(
      strictObject({
        field: z.string(),
        credential: z.string(),
        registry: z.enum(["big", "other", "none"]),
        verified: Quad,
        source: z.string().optional(),
      }),
    )
    .optional(),
  /** Lineage = claims, never a trust graph. References Claim ids. */
  lineage_claims: z.array(z.string()).optional(),
});
export type Person = z.infer<typeof Person>;

/* ---------- Assessment (layer 3, spec §4.8) ---------- */

const Axis = strictObject({
  score: z.number().int().min(1).max(5).nullable(),
  rationale: z.string(),
  evidence: z.array(z.string()),
});

export const Assessment = strictObject({
  methodology_version: z.string(),
  assessed: YearMonth,
  /** Sub-scores only. There is deliberately no field where a total could live. */
  axes: strictObject({
    pedagogy: Axis,
    evidence_base: Axis,
    transparency: Axis,
    commercial_fairness: Axis,
  }),
  right_of_reply: strictObject({
    sent: YearMonth,
    method: z.string(),
    response_received: YearMonth.nullable(),
    response_summary: z.string().nullable().optional(),
    changes_made: z.string().nullable().optional(),
  }),
});
export type Assessment = z.infer<typeof Assessment>;

/* ---------- Inquiry (correction workflow as data, spec §4.9) ---------- */

export const Inquiry = strictObject({
  sent: YearMonth,
  type: z.enum(["correction_request", "question", "right_of_reply"]),
  summary: z.string(),
  /** "none" after the stated window = displayable, defensible silence. */
  response: z.union([
    z.literal("none"),
    strictObject({ received: YearMonth, summary: z.string(), source: z.string().optional() }),
  ]),
});
export type Inquiry = z.infer<typeof Inquiry>;

/* ---------- Program (spec §4.3) ---------- */

export const CoherenceSignals = strictObject({
  required_sequence: Quad.optional(),
  required_sequence_note: z.string().optional(),
  single_cohort_intake: Quad.optional(),
  single_cohort_intake_note: z.string().optional(),
  /** Any assessment that spans the parts — continuous-and-cumulative or final.
   *  Measures INTEGRATION (someone judges the whole), not assessment quality;
   *  ten loose module quizzes don't satisfy it, an across-module portfolio does. */
  integrative_assessment: Quad.optional(),
  integrative_assessment_note: z.string().optional(),
  continuous_lead_teacher: Quad.optional(),
  continuous_lead_teacher_note: z.string().optional(),
  modules_sold_separately: Quad.optional(),
  modules_sold_separately_note: z.string().optional(),
  bundle_price_below_sum: Quad.optional(),
  bundle_price_below_sum_note: z.string().optional(),
  source: z.string().optional(),
});

export const Program = strictObject({
  id: slug,
  name: z.string(),
  url: z.string().url().optional(),
  /** Descriptive label for findability — NOT a quality signal (§5). */
  format_label: z.enum(["200", "300", "500", "other", "none"]),
  style_claimed: z.string().optional(),
  /** Normalized style tags (controlled vocab) for filtering — descriptive, NOT
   *  a quality signal. Tag `multistyle` ONLY when the school self-frames that way
   *  or lists >=2 co-equal styles; a program that simply states no style gets
   *  `styles: []` (unknown), never `multistyle` by default. "allround" is DERIVED
   *  (see isMultistyle in dataset.ts), never stored. */
  styles: z
    .array(
      z.enum([
        "vinyasa", "hatha", "ashtanga", "yin", "yang", "kundalini", "iyengar",
        "restorative", "raja", "jnana", "nidra", "multistyle", "own_method", "other",
      ]),
    )
    .optional(),
  accreditation: z.array(Accreditation).default([]),
  delivery: strictObject({
    mode: z.enum(["in_person", "online", "hybrid"]),
    structure: z.enum(["weekends", "evenings", "intensive", "modular", "mixed"]),
    duration_months_min: z.number().positive().optional(),
    duration_months_max: z.number().positive().optional(),
    language: z.enum(["nl", "en", "mixed"]).optional(),
  }),
  prerequisites_claimed: z.string().optional(),
  price: Price,
  /** The §5 decomposition. supervised_teaching_practice = the only number
   *  about teaching ability; its emptiness across the market is the finding. */
  hours_claimed: strictObject({
    total: z.number().positive().nullable().optional(),
    contact: z.number().positive().nullable().optional(),
    self_study: z.number().positive().nullable().optional(),
    supervised_teaching_practice: z.number().nonnegative().nullable().optional(),
    breakdown_published: Quad,
    source: z.string().optional(),
    /** What the provider says about practice/hours when not given as an isolated
     *  number — keeps the §5 nuance the bare numbers would otherwise drop. */
    note: z.string().optional(),
  }),
  group_size_claimed: z
    .object({
      min: z.number().positive().nullable().optional(),
      max: z.number().positive().nullable().optional(),
      source: z.string().optional(),
      note: z.string().optional(),
    })
    .strict()
    .optional(),
  composition: z
    .object({
      type: z.enum(["single_program", "fixed_modular", "free_assembly"]),
      modules: z.array(z.string()).optional(),
    })
    .strict()
    .optional(),
  /** Six checkable signals; coherence is the pattern, never a field (§7). */
  coherence_signals: CoherenceSignals.optional(),
  /** Assessment FORM, recorded for every program (not only modular ones):
   *  continuous/formative assessment demonstrably outperforms a single final
   *  exam — so the form is data. Quad semantics as everywhere: not_published
   *  = they describe no such assessment; unknown = not yet investigated. */
  assessment_described: z
    .object({
      exists: Quad,
      continuous: Quad.optional(),
      final: Quad.optional(),
      quote: z.string().optional(),
    })
    .strict()
    .optional(),
  contract: z
    .object({
      cancellation_published: Quad.optional(),
      refund_published: Quad.optional(),
      min_participants: z
        .object({ clause: Quad, value: z.number().positive().optional() })
        .strict()
        .optional(),
      installments_published: Quad.optional(),
      /** Legal entity that invoices the training — makes VAT structuring visible as fact. */
      invoicing_entity: z.string().optional(),
      source: z.string().optional(),
      note: z.string().optional(),
    })
    .strict()
    .optional(),
  transparency: z
    .object({
      syllabus_published: Quad.optional(),
      hours_breakdown_published: Quad.optional(),
      assessment_criteria_published: Quad.optional(),
      reading_list_published: Quad.optional(),
      teacher_bios_published: Quad.optional(),
      source: z.string().optional(),
    })
    .strict()
    .optional(),
  track_record: z
    .object({
      first_seen_year: Year.nullable().optional(),
      last_confirmed_cohort: YearMonth.optional(),
      cadence_note: z.string().optional(),
      source: z.string().optional(),
      note: z.string().optional(),
    })
    .strict()
    .optional(),
  cohorts: z.array(Cohort).optional(),
  teachers: z
    .array(
      strictObject({
        person_id: z.string(),
        role: z.string().optional(),
        teaches: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  assessment: Assessment.optional(),
  /** Explicit opinion — rendered visibly apart from facts. */
  editorial: z.string().optional(),
});
export type Program = z.infer<typeof Program>;

/* ---------- Provider (spec §4.2) ---------- */

export const Provider = strictObject({
  id: slug,
  /** Publicly known brand name — the canonical identifier throughout. */
  name: z.string(),
  aka: z.array(z.string()).optional(),
  website: z.string().url(),
  status: z.enum(["active", "inactive", "unknown"]),
  locations: z.array(
    strictObject({
      city: z.string().nullable(),
      address: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
  crkbo: strictObject({
    /** Quad. `no` ONLY after an adequate, documented register search (by legal
     *  name from KvK + relevant person names), never from a brand-name miss or a
     *  "charges BTW" inference. The register is complete, so non-membership is a
     *  real finding — but only when the right keys were searched (record them in note/source). */
    registered: Quad,
    /** instelling = the organisation is registered; docent = a named individual.
     *  Exemption riding on a registered docent is tied to that person (same
     *  fragility as a personally-held YA registration). */
    register: z.enum(["instelling", "docent"]).optional(),
    /** Registered entity's or person's name — often a BV/holding/person, not the brand. */
    holder: z.string().optional(),
    checked: YearMonth.nullable(),
    source: z.string().optional(),
    note: z.string().optional(),
  }),
  registrations: z.array(Registration).default([]),
  legal: z
    .object({ kvk: z.string().optional(), legal_name: z.string().optional(), note: z.string().optional() })
    .strict()
    .optional(),
  founded_year: z
    .object({ value: Year.nullable(), source: z.string().optional(), note: z.string().optional() })
    .strict()
    .optional(),
  programs: z.array(Program).default([]),
  modules: z.array(Module).default([]),
  claims: z.array(Claim).default([]),
  people: z.array(Person).default([]),
  inquiries: z.array(Inquiry).default([]),
  sources: z.array(Source).min(1, "every record needs at least one source"),
  /** Personal/business relationship between the author and this provider —
   *  rendered prominently on the listing (methodology: onafhankelijkheid). */
  disclosure: z.string().optional(),
  /** Honest about limits: how deep has this record been taken? */
  depth: z.enum(["listed", "reviewed", "assessed"]),
  last_verified: YearMonth,
});
export type Provider = z.infer<typeof Provider>;
