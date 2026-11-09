import type { Metadata } from "next";
import Link from "next/link";
import { ExpertPresence } from "@/components/mandate/expert-presence";

// The Mandate home: the bench, and the two agents a founder can work with
// today. Deliberately minimal (the shell, not the product); each agent's own
// landing page carries its case. No figures on this page: what each agent
// covers is stated on that agent's pages, where it is read from its corpus.

export const metadata: Metadata = {
  title: "Mandate",
  description:
    "Mandate is a bench of domain experts that watch the public sphere for European startups. Wincent covers public capital; Regina covers EU rules.",
};

type AgentCard = {
  name: "Wincent" | "Regina";
  brain: string;
  question: string;
  body: string;
  knows: string;
  engages: string;
  about: { href: string; label: string };
};

const AGENTS: AgentCard[] = [
  {
    name: "Wincent",
    brain: "Public capital",
    question:
      "What can the state put into this company, on what terms, through which instrument, by when, and who administers it?",
    body: "Wincent maps your company to comparable raises, screened institutions and the priorities shaping grants, loans and public equity.",
    knows: "Awards, instruments, administrators, public priorities and comparable raises.",
    engages: "Give Wincent the company and project. Wincent returns viable routes, evidence, conditions and timing.",
    about: { href: "/wincent", label: "Meet Wincent" },
  },
  {
    name: "Regina",
    brain: "EU rules",
    question: "What rules land on this company, when do they bite, and what has to change?",
    body: "Regina reads the official EU, French and German record and writes a source-cited report for your company.",
    knows: "Law, legislative pipelines, regulators, consultations and implementation timelines.",
    engages: "Give Regina the product and markets. Regina returns what moved, when it bites and why it matters.",
    about: { href: "/regina", label: "Meet Regina" },
  },
];

export default function MandateHome() {
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

      <section aria-labelledby="bench" className="mt-12 sm:mt-16">
        <p id="bench" className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          On the bench today
        </p>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {AGENTS.map((a) => (
            <article
              key={a.name}
              className="grid grid-cols-[minmax(0,1fr)_36%] overflow-hidden border-t-2 border-[var(--primary)] bg-[var(--paper)]"
            >
              <div className="flex flex-col p-6 sm:p-7">
                <p className="eyebrow text-[11px]">{a.brain}</p>
                <h3 className="mt-3 font-serif text-3xl font-semibold text-[var(--primary)]">{a.name}</h3>
                <p className="mt-4 font-serif text-lg italic leading-snug text-[var(--foreground)]">
                  {a.question}
                </p>
                <p className="mt-4 text-[15px] leading-relaxed text-[var(--foreground-soft)]">{a.body}</p>
                <dl className="mt-6 border-t border-[var(--border)] text-[13px] leading-relaxed">
                  <div className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-[var(--line)] py-3">
                    <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Knows</dt>
                    <dd className="text-[var(--foreground-soft)]">{a.knows}</dd>
                  </div>
                  <div className="grid grid-cols-[4.5rem_1fr] gap-3 py-3">
                    <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Engages</dt>
                    <dd className="text-[var(--foreground-soft)]">{a.engages}</dd>
                  </div>
                </dl>
                <div className="mt-auto pt-8">
                  <Link
                    href={a.about.href}
                    className="text-[15px] font-medium text-[var(--primary)] underline underline-offset-4 decoration-[var(--border)] hover:decoration-current"
                  >
                    {a.about.label}
                  </Link>
                </div>
              </div>
              <ExpertPresence name={a.name === "Regina" ? "regina" : "wincent"} />
            </article>
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
