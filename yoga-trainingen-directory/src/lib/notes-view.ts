/**
 * Node-free view helpers for the Notities listing. Kept out of notes.ts because
 * that module imports node:fs, and the category filter is a CLIENT island —
 * importing a value from an fs-touching module would pull node:fs into the
 * browser bundle. Mirrors the derive/rules/quad/presenters node-free rule in
 * CLAUDE.md. The NoteMeta re-export is type-only (erased at compile).
 */
import type { NoteMeta } from "./notes";
export type { NoteMeta };

/**
 * The distinct categories, first-seen order. "Alle" is NOT included — the
 * component prepends nl.notes.allCategories, so that label lives only in strings.
 */
export function categories(posts: NoteMeta[]): string[] {
  return Array.from(new Set(posts.map((p) => p.cat)));
}
