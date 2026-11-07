import type { Metadata } from "next";
import Link from "next/link";
import { Companion, CompanionPair } from "@/components/mandate/companions";

export const metadata: Metadata = {
  title: "Mandate",
  description:
    "Your public-affairs operating system. Mandate watches policy and public capital, then tells your company what to do next.",
};

const SIGNALS = [
  {
    kind: "Product",
    title: "Your release gate just moved",
    detail: "New AI Act guidance puts the clinical-assistance feature on the higher-scrutiny path.",
    when: "Decide 12 Nov",
  },
  {
    kind: "Runway",
    title: "A €7.5m non-dilutive path opens before the next raise",
    detail: "The technical fit is strong. One consortium condition can still rule the company out.",
    when: "Window 28 Nov",
  },
  {
    kind: "Market access",
    title: "France and Germany now imply different company plans",
    detail: "One reaches buyers sooner. The other offers materially stronger public-capital leverage.",
    when: "9 days",
  },
];

export default function MandateHome() {
  return (
    <div className="overflow-hidden">
      <section className="relative isolate bg-[var(--navy)] text-[#f8f1df]">
        <div className="absolute inset-0 -z-10 opacity-60 [background-image:radial-gradient(circle_at_78%_38%,rgba(178,139,68,.16),transparent_34%)]" />
        <div className="wrap grid items-center gap-8 py-14 lg:min-h-[calc(100svh-4.5rem)] lg:grid-cols-[.92fr_1.08fr] lg:gap-10 lg:py-20">
          <div className="relative z-10 max-w-2xl">
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#c9ad72]">
              The public realm shapes your market
            </p>
            <h1 className="mt-6 max-w-[11ch] font-serif text-[clamp(3.5rem,7.7vw,7rem)] font-medium leading-[.88] tracking-[-.055em] !text-[#fffaf0]">
              Europe moves before markets do.
            </h1>
            <p className="mt-7 max-w-xl text-base leading-relaxed text-[#c7c9d0] sm:text-lg">
              Rules decide when you can launch. Public capital changes how long you can build.
              Institutions decide which categories get made. Mandate turns that movement into leverage.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/workspace"
                className="group inline-flex items-center gap-3 rounded-sm bg-[#f2d78f] px-6 py-3.5 text-sm font-semibold text-[#10203f] transition hover:bg-[#ffe5a1]"
              >
                Map your public position
                <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <a href="#companions" className="px-4 py-3 text-sm text-[#d6d7dc] hover:text-white">
                How it works
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute inset-x-0 top-8 z-10 hidden font-mono text-[8px] uppercase tracking-[.13em] text-white/35 lg:block">
              <span className="absolute left-[6%] top-20">Brussels · rules</span>
              <span className="absolute right-[4%] top-2">Luxembourg · capital</span>
              <span className="absolute left-[12%] top-52">Paris · implementation</span>
              <span className="absolute right-[5%] top-44">Berlin · programmes</span>
            </div>
            <CompanionPair showLabels={false} />
            <div className="relative z-10 mx-auto -mt-12 w-[min(29rem,94%)] rounded-md border border-white/15 bg-[#111b35]/95 p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-4">
                <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#b9a477]">Decision brief · market entry</p>
                <span className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7f899d]">9 days to decide</span>
              </div>
              <p className="mt-2 font-serif text-2xl leading-tight text-[#fff8e9]">
                Germany offers the stronger capital route. France reaches market sooner.
              </p>
              <div className="mt-4 border-t border-white/10 pt-4 text-xs leading-relaxed text-[#aeb5c4]">
                <p><span className="text-[#e7e8eb]">Why now:</span> the next application window closes before the product release gate.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="companions" className="wrap py-20 sm:py-32">
        <div className="max-w-3xl">
          <p className="eyebrow text-[10px]">Public affairs is market strategy</p>
          <h2 className="mt-4 font-serif text-4xl font-medium leading-tight sm:text-6xl">
            Markets are made in public.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--foreground-soft)]">
            Before a category scales, institutions define its rules, fund its infrastructure,
            buy its first deployments, and decide what counts as legitimate. Mandate shows founders
            where that process is moving—and where they can still alter the outcome.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          <article className="relative min-h-[27rem] overflow-hidden rounded-md border border-[#c8c0af] bg-[#efebe2] p-7 sm:min-h-[33rem] sm:p-9">
            <div className="relative z-10 max-w-sm">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#6f4965]">Policy intelligence</p>
              <h3 className="mt-2 font-serif text-4xl font-semibold">Regina</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#46516a]">
                Tracks who holds the pen, which obligations are hardening, where consultation is
                still open, and when a rule changes the product or market plan.
              </p>
            </div>
            <div className="absolute -bottom-10 right-0 text-[#10203f]">
              <Companion name="regina" size="lg" showLabel={false} />
            </div>
            <Link prefetch={false} href="/regina" className="absolute bottom-8 left-8 z-20 text-sm font-semibold underline underline-offset-4">
              Policy intelligence →
            </Link>
          </article>

          <article className="relative min-h-[27rem] overflow-hidden rounded-md border border-[#c8c0af] bg-[#efebe2] p-7 sm:min-h-[33rem] sm:p-9">
            <div className="relative z-10 max-w-sm">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#536c59]">Public capital</p>
              <h3 className="mt-2 font-serif text-4xl font-semibold">Wincent</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#46516a]">
                Reads the state as investor, lender, and first customer—then maps the institutions,
                instruments, and political priorities that can extend runway.
              </p>
            </div>
            <div className="absolute -bottom-10 right-0 text-[#10203f]">
              <Companion name="wincent" size="lg" showLabel={false} />
            </div>
            <Link prefetch={false} href="/wincent" className="absolute bottom-8 left-8 z-20 text-sm font-semibold underline underline-offset-4">
              Capital intelligence →
            </Link>
          </article>
        </div>
      </section>

      <section className="bg-[#e9e3d4] py-20 sm:py-28">
        <div className="wrap grid gap-12 lg:grid-cols-[.78fr_1.22fr]">
          <div>
            <p className="eyebrow text-[10px]">Today, for your company</p>
            <h2 className="mt-4 max-w-md font-serif text-4xl font-medium leading-tight sm:text-5xl">
              Movement becomes a queue of decisions.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-[var(--foreground-soft)]">
              No feed to clear. Mandate ranks the few changes that alter your plan, explains the
              implication, and gives each next step an owner and a date.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-[#c8bea7] bg-[#fffdf8] shadow-[0_24px_60px_rgba(37,31,19,.08)]">
            <div className="flex items-center justify-between border-b border-[#ddd4c1] px-5 py-4">
              <div>
                <p className="font-serif text-xl font-semibold">Today</p>
                <p className="text-xs text-[var(--muted-foreground)]">Northstar Bio · Friday, 6 November</p>
              </div>
              <span className="rounded-full bg-[#e9dfc4] px-3 py-1 font-mono text-[9px] uppercase tracking-[.1em]">3 need attention</span>
            </div>
            {SIGNALS.map((signal, index) => (
              <div key={signal.title} className="grid grid-cols-[auto_1fr_auto] gap-4 border-b border-[#e7dfcf] px-5 py-5 last:border-0">
                <div className="grid h-8 w-8 place-items-center rounded-full border border-[#cdbd95] font-mono text-[10px] text-[#7f5820]">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#8a6a32]">{signal.kind}</p>
                  <h3 className="mt-1 font-serif text-xl font-semibold">{signal.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--foreground-soft)]">{signal.detail}</p>
                </div>
                <span className="font-mono text-[9px] uppercase text-[var(--muted-foreground)]">{signal.when}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--navy)] py-20 text-[#f8f1df] sm:py-28">
        <div className="wrap text-center">
          <h2 className="mx-auto max-w-4xl font-serif text-4xl font-medium leading-tight sm:text-6xl">
            What should your company be ready for next?
          </h2>
          <Link href="/workspace" className="mt-8 inline-flex items-center gap-3 rounded-sm bg-[#f2d78f] px-7 py-3.5 text-sm font-semibold text-[#10203f] hover:bg-[#ffe5a1]">
            Open Mandate <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
