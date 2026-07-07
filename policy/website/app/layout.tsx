import "./globals.css";
import type { Metadata } from "next";
import { Newsreader, Poppins } from "next/font/google";
import Link from "next/link";
import { getStats } from "@/lib/api";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EuroPolTracker — EU tech-policy intelligence",
  description:
    "Track EU tech-policy documents and get a realistic, citation-backed briefing for your company.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sourceCount = await getStats()
    .then((s) => s.sources)
    .catch(() => null);
  return (
    <html lang="en" className={`${poppins.variable} ${newsreader.variable}`}>
      <body>
        <div className="masthead">
          <div className="container masthead-bar">
            <div className="masthead-brand">
              <Link href="/">EuroPolTracker</Link>
            </div>
            <nav className="masthead-nav">
              <Link href="/documents">Live register</Link>
              <Link href="/about">About</Link>
              <Link className="masthead-cta" href="/brief">
                Get a report →
              </Link>
            </nav>
          </div>
          <div className="container masthead-dateline">
            <span>EU · FR · DE Edition</span>
            <span>Automated regulatory intelligence</span>
          </div>
        </div>
        <main className="container">{children}</main>
        <footer>
          <div className="container footer-inner">
            <span className="footer-mark">EuroPolTracker</span>
            <span>
              Tech-policy corpus · automatically collected · citation-grounded. Coverage: EU,
              France &amp; Germany — {sourceCount ?? "dozens of"} verified channels across law,
              pipelines, regulators and press.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
