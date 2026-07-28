import type { Metadata } from "next";
import Link from "next/link";
import { RETENTION_DAYS } from "@/lib/intelligence/record";
import { MAX_DESCRIPTION_CHARS } from "@/lib/intelligence/sanitize";

export const metadata: Metadata = {
  title: "Privacy | Wincent",
  description:
    "What Wincent stores when you generate a funding brief, why, for how long, and how to have it removed.",
};

/**
 * Written because the product started retaining submissions and the site had
 * no privacy page at all. The values here are READ FROM THE CODE that enforces
 * them (RETENTION_DAYS, MAX_DESCRIPTION_CHARS) rather than restated, so the
 * notice cannot quietly describe a policy the software stopped following —
 * the same drift that made a stale sanitiser silently discard every founder's
 * sector for a day.
 */
export default function PrivacyPage() {
  return (
    <main className="wrap py-16">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Privacy
      </p>
      <h1 className="mb-6 text-4xl font-semibold tracking-tight">
        What we keep, and for how long
      </h1>

      <div className="max-w-2xl space-y-6 text-[17px] leading-relaxed">
        <p className="text-[19px] text-[var(--foreground-soft)]">
          Wincent is a research tool. You can generate a funding brief without an
          account, and we do not ask for your name, email or any personal contact
          detail at any point.
        </p>

        <Section title="What is stored when you generate a brief">
          <p>
            When you complete the form we keep the answers you gave — your company
            name, country, the description you typed (capped at{" "}
            {MAX_DESCRIPTION_CHARS.toLocaleString()} characters), and your
            eligibility answers — together with the shortlist of institutions we
            produced and why each one was included or dropped.
          </p>
          <p>
            We keep it for one reason: to check later whether the brief was any
            good. Without the answers alongside the recommendation, there is no way
            to tell a useful brief from a plausible-sounding one.
          </p>
        </Section>

        <Section title="What is not stored">
          <p>
            No account, no email address, no cookies for tracking, no advertising or
            analytics identifiers, and nothing that links two separate submissions to
            the same person. We do not sell or share submissions with third parties.
          </p>
        </Section>

        <Section title="How long">
          <p>
            Submissions are deleted after{" "}
            <strong>{RETENTION_DAYS} days</strong>. That window is set by the
            application cycle this tool exists to support: public funding decisions
            typically take six to twelve months, so a shorter window would delete the
            evidence before the outcome is known.
          </p>
          <p>
            Where we have recorded what actually happened to an application, the
            structured decision is kept and the free text you wrote is deleted, so
            what remains cannot be traced back to a specific company.
          </p>
        </Section>

        <Section title="Third parties in the loop">
          <p>
            Generating a brief sends your company description to Anthropic (for
            drafting) and to a web search provider (to find comparable companies).
            The funding data itself comes from public European and national registers
            and is not personal data. Hosting is Vercel; the database is Railway,
            hosted in the EU.
          </p>
        </Section>

        <Section title="Removing your submission">
          <p>
            Email{" "}
            <a className="underline" href="mailto:asger@grimberg.dk">
              asger@grimberg.dk
            </a>{" "}
            with your company name and we will delete every submission matching it.
            No verification hoops — the data is not sensitive enough to justify
            making deletion harder than submission.
          </p>
        </Section>

        <p className="border-t border-[var(--border)] pt-6 text-sm text-[var(--muted-foreground)]">
          Last updated 28 July 2026. If this notice and the software ever disagree,
          the software is the bug — the retention window above is read directly from
          the code that enforces it.{" "}
          <Link className="underline" href="/brief">
            Back to the brief
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
