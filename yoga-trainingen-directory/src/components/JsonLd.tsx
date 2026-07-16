/**
 * The repo's one JSON-LD primitive: a <script type="application/ld+json">. React
 * escapes text children, which would corrupt the JSON, so the payload goes in via
 * dangerouslySetInnerHTML — with "<" hardened to < so no string value can
 * close the <script> tag. First used by Notities (spec §8).
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
