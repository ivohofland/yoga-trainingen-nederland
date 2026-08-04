/**
 * Renders one note, turning `[[ref:<id>]]` into a link to the document it cites.
 *
 * Every note that carries dataset prose goes through here — the record page
 * (`app/aanbieder/[id]/page.tsx`) AND `/referenties` itself (a reference's own
 * `note` cross-references other references, e.g. "zie ya-electives-2026-07").
 * A note interpolated directly shows a reader literal
 * `[[ref:ya-standards-2026-07]]` — visible and embarrassing — and a note
 * stripped of its markers is worse: the sentence still reads as sourced while
 * the citation is gone. Shared here, next to `Quad`, rather than under one
 * page's route folder, because it is now consumed by two.
 *
 * NOT `SourceCite` (`app/aanbieder/[id]/page.tsx`): that one links a fact to a
 * provider's OWN `sources[]` entry on the same page. This one links a note's
 * prose to the shared, cross-provider reference store at /referenties.
 */
import Link from "next/link";
import { parseCitations, refHref } from "@/lib/citations";

export function Cite({ text }: { text: string }) {
  return (
    <>
      {parseCitations(text).map((seg, i) =>
        seg.kind === "text" ? (
          seg.text
        ) : (
          <Link key={i} href={refHref(seg.id)}>
            {seg.id}
          </Link>
        ),
      )}
    </>
  );
}
