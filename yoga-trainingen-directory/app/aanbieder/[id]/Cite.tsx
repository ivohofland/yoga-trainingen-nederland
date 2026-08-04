/**
 * Renders one note, turning `[[ref:<id>]]` into a link to the document it cites.
 *
 * Every note on this page goes through here. A note interpolated directly shows a
 * reader literal `[[ref:ya-standards-2026-07]]` — visible and embarrassing — and a
 * note stripped of its markers is worse: the sentence still reads as sourced while
 * the citation is gone.
 *
 * NOT `SourceCite` (page.tsx): that one links a fact to this provider's OWN
 * `sources[]` entry below on the same page. This one links a note's prose to the
 * shared, cross-provider reference store at /referenties.
 */
import Link from "next/link";
import { parseCitations } from "@/lib/citations";

export function Cite({ text }: { text: string }) {
  return (
    <>
      {parseCitations(text).map((seg, i) =>
        seg.kind === "text" ? (
          seg.text
        ) : (
          <Link key={i} href={`/referenties#${seg.id}`}>
            {seg.id}
          </Link>
        ),
      )}
    </>
  );
}
