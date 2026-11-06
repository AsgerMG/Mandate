import "./regina.css";
import type { Metadata } from "next";
import { getStats } from "@/lib/regina/api";

// Regina, the policy brain, inside the one Mandate site. Ported from
// policy/website (regina-ai.eu) on 2026-11-06. The masthead and footer are the
// shared ones (components/nav-bar.tsx, app/layout.tsx); this layout adds only
// what is Regina's: the scope class her stylesheet hangs off, her edition line,
// and her coverage note, whose count is read from the policy API and never
// written down (see policy/website/CLAUDE.md, rule 1).

export const metadata: Metadata = {
  title: { default: "Regina", template: "%s · Regina | Mandate" },
  description:
    "Regina turns the official EU, French and German regulatory record into realistic, citation-backed briefings for your company.",
};

export default async function ReginaLayout({ children }: { children: React.ReactNode }) {
  // A missing count is said as no count, not as a guess at one.
  const sourceCount = await getStats()
    .then((s) => s.sources)
    .catch(() => null);
  return (
    <div className="regina">
      <div className="wrap">
        <div className="masthead-dateline">
          <span>Regina · EU, France and Germany</span>
          <span>Automated regulatory intelligence</span>
        </div>
      </div>
      <div className="wrap regina-main">{children}</div>
      <div className="wrap">
        <p className="regina-coverage">
          Tech-policy corpus, automatically collected and citation-grounded. Coverage: EU, France
          and Germany,{" "}
          {sourceCount === null ? "" : `${sourceCount} `}verified channels across law, pipelines,
          regulators and press.
        </p>
      </div>
    </div>
  );
}
