// The round-2 screen, rendered from questions the pipeline actually generated.
//
// Question quality was being judged from JSON in a terminal, which hides the
// thing that matters most: whether a founder looking at the screen can answer
// it. The defect that started this rework — a screen asking for technology
// readiness twice in two framings — is obvious side by side and invisible in a
// log.
//
// Fixture, not fabrication: every question here came out of a real
// funnel_bench run and is captured in __fixtures/questions.json. Regenerate by
// re-running the bench.
//
// Never reachable in production — see notFound() below.
import { notFound } from "next/navigation";
import questions from "@/lib/intelligence/__fixtures/questions.json";

export const metadata = { title: "Round 2 preview" };

interface Fixture { question: string; options: string[]; answer: string; archetype: string }

export default function QuestionsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const rows = questions as Fixture[];
  const byArchetype = new Map<string, Fixture[]>();
  for (const q of rows) {
    byArchetype.set(q.archetype, [...(byArchetype.get(q.archetype) ?? []), q]);
  }
  return (
    <main className="wrap py-10">
      <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]">
        Round 2 · generated questions
      </p>
      <h1 className="mb-2 text-2xl font-semibold">What a founder is actually asked</h1>
      {/* One screen per founder, framed as one screen. Stacked continuously
          this page read as a single 70-question interrogation, which is not a
          flow any founder sees and made the set look far worse than it is. */}
      <p className="mb-8 max-w-2xl text-[15px] text-[var(--muted-foreground)]">
        Each block below is one founder&rsquo;s entire round-2 screen. They are
        different companies, not a sequence: nobody is asked more than what is
        inside a single block.
      </p>
      {[...byArchetype.entries()].map(([archetype, qs]) => (
        <section
          key={archetype}
          className="mb-8 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] p-6"
        >
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">
            One founder · one screen
          </p>
          <p className="mb-5 text-sm font-semibold">
            {archetype} · {qs.length} question{qs.length === 1 ? "" : "s"}
          </p>
          <div className="space-y-6">
            {qs.map((q, i) => (
              <div key={i}>
                <p className="mb-2 text-[15px] font-semibold">{q.question}</p>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((o) => (
                    <span
                      key={o}
                      className={
                        "rounded-full border px-3 py-1.5 text-[13px] " +
                        (o === q.answer
                          ? "border-[var(--primary)] bg-[var(--muted)] font-medium"
                          : "border-[var(--border)] text-[var(--foreground-soft)]")
                      }
                    >
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
