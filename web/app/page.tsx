import type { Metadata } from "next";
import Link from "next/link";
import { ExpertPresence } from "@/components/mandate/expert-presence";
import { benchEnabled } from "@/lib/bench/events";

// The Mandate home: the bench, and the two agents a founder can work with
// today. Deliberately minimal (the shell, not the product); each agent's own
// landing page carries its case, so the previews here are small: a figure,
// a name and one line. No figures on this page: what each agent covers is
// stated on that agent's pages, where it is read from its corpus.

export const metadata: Metadata = {
  title: "Mandate",
  description:
    "Mandate is a bench of domain experts that watch the public sphere for European startups. Wincent covers public capital; Regina covers EU rules.",
};

type AgentCard = {
  name: "Wincent" | "Regina";
  brain: string;
  line: string;
  about: { href: string; label: string };
};

const AGENTS: AgentCard[] = [
  {
    name: "Wincent",
    brain: "Public capital",
    line: "What the state can put into your company: grants, loans and public equity, on what terms and by when.",
    about: { href: "/wincent", label: "Meet Wincent" },
  },
  {
    name: "Regina",
    brain: "EU rules",
    line: "What rules land on your company, when they bite and what has to change, cited to the official record.",
    about: { href: "/regina", label: "Meet Regina" },
  },
];

export default function MandateHome() {
  // The training ground (/bench) exists only on a local dev server with the
  // bench switched on; on the live site this is false and nothing renders.
  const bench = benchEnabled(process.env);
  return (
    <div className="wrap py-12 sm:py-16 lg:py-20">
      <section className="max-w-3xl">
        <p className="eyebrow text-[11px]">Mandate</p>
        <h1 className="mt-4 font-serif text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl">
          Public affairs for European startups, from a bench of experts
        </h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-[var(--foreground-soft)]">
          Public affairs is an investment almost no startup has the capacity to make. Mandate is a
          bench of domain experts. Each one watches part of the public sphere on your behalf and
          tells you what moved, and why it matters to your company specifically.
        </p>
      </section>

      {bench && (
        <section className="mt-10 max-w-3xl">
          <Link
            href="/bench"
            className="group flex items-center justify-between gap-4 border border-[var(--primary)] bg-[var(--paper)] px-5 py-4 transition-colors hover:bg-[var(--primary)]"
          >
            <span className="min-w-0">
              <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)] group-hover:text-[#e4bd69]">
                Local only
              </span>
              <span className="mt-1 block font-serif text-xl font-semibold text-[var(--primary)] group-hover:text-[var(--paper)]">
                Training ground
              </span>
              <span className="mt-0.5 block text-[14px] text-[var(--foreground-soft)] group-hover:text-[var(--paper)]/80">
                Talk to Wincent or Regina on your own plan, and train them.
              </span>
            </span>
            <span aria-hidden className="text-2xl text-[var(--primary)] group-hover:text-[var(--paper)]">
              &rarr;
            </span>
          </Link>
        </section>
      )}

      <section aria-labelledby="bench" className="mt-12 sm:mt-14">
        <p id="bench" className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          On the bench today
        </p>
        <div className="mt-4 grid max-w-4xl gap-4 md:grid-cols-2">
          {AGENTS.map((a) => (
            <Link
              key={a.name}
              href={a.about.href}
              aria-label={a.about.label}
              className="group grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-4 border-t-2 border-[var(--primary)] bg-[var(--paper)] pr-5"
            >
              <ExpertPresence
                name={a.name === "Regina" ? "regina" : "wincent"}
                className="expert-presence--thumb"
              />
              <span className="min-w-0 py-4">
                <span className="flex items-baseline gap-3">
                  <span className="font-serif text-2xl font-semibold text-[var(--primary)] group-hover:underline group-hover:underline-offset-4">
                    {a.name}
                  </span>
                  <span className="eyebrow text-[10px]">{a.brain}</span>
                </span>
                <span className="mt-1.5 block text-[14px] leading-snug text-[var(--foreground-soft)]">{a.line}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-12 max-w-2xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
        <p>
          They watch and tell: they notice and explain, and they do not draft or file. Nothing they
          say ships without a source and a date. More experts will join the bench.
        </p>
      </section>
    </div>
  );
}
