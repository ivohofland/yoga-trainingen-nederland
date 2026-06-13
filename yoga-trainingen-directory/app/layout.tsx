import type { ReactNode } from "react";

export const metadata = {
  title: "Yoga Trainingen — onderzoek",
  description: "Onafhankelijk, feitelijk overzicht van yoga-docentenopleidingen in Nederland",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
        {children}
      </body>
    </html>
  );
}
