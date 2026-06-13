/**
 * Listing view — one of multiple views over the same dataset (spec §1).
 * Deliberately renders the §5 decomposition: the hour label is descriptive,
 * supervised teaching practice gets its own column, and "niet gepubliceerd"
 * is displayed as a finding, not hidden as a gap.
 */
import { loadDataset, pricePerContactHour } from "@/lib/dataset";

const QUAD_LABEL: Record<string, string> = {
  yes: "ja",
  no: "nee",
  not_published: "niet gepubliceerd",
  unknown: "nog niet onderzocht",
};

export default function Home() {
  const { providers, errors } = loadDataset();
  if (errors.length > 0) throw new Error(`Dataset invalid:\n${errors.join("\n")}`);

  return (
    <main>
      <h1>Yoga-docentenopleidingen in Nederland</h1>
      <p style={{ color: "#555" }}>
        Feitelijk overzicht. Claims zijn als claim genoteerd; “niet gepubliceerd” betekent: wij
        keken, de opleider vermeldt het niet. Onderzoek door Ivo Hofland.
      </p>
      {providers.map((p) => (
        <section key={p.id} style={{ borderTop: "1px solid #ddd", padding: "1rem 0" }}>
          <h2 style={{ marginBottom: 0 }}>{p.name}</h2>
          <p style={{ margin: "0.2rem 0", color: "#555" }}>
            {p.locations.map((l) => l.city ?? "locatie onbekend").join(", ")} ·{" "}
            <a href={p.website}>{p.website.replace(/^https?:\/\/(www\.)?/, "")}</a> · diepte:{" "}
            {p.depth} · laatst geverifieerd: {p.last_verified}
          </p>
          {p.programs.map((program) => {
            const pph = pricePerContactHour(program);
            return (
              <table key={program.id} style={{ margin: "0.5rem 0", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ paddingRight: 12, color: "#777" }}>opleiding</td>
                    <td>
                      <strong>{program.name}</strong> ({program.format_label} uur-format)
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: 12, color: "#777" }}>prijs</td>
                    <td>
                      {program.price.amount_eur != null
                        ? `€${program.price.amount_eur} (${program.price.vat})`
                        : QUAD_LABEL[program.price.published]}
                      {program.price.excludes ? ` — exclusief: ${program.price.excludes}` : ""}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: 12, color: "#777" }}>prijs per contactuur</td>
                    <td>{pph.value != null ? `€${pph.value}` : pph.caveat}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: 12, color: "#777" }}>begeleide lespraktijk</td>
                    <td>
                      {program.hours_claimed.supervised_teaching_practice != null
                        ? `${program.hours_claimed.supervised_teaching_practice} uur`
                        : QUAD_LABEL[program.hours_claimed.breakdown_published]}
                    </td>
                  </tr>
                </tbody>
              </table>
            );
          })}
        </section>
      ))}
    </main>
  );
}
