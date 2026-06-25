import { readFileSync } from "fs";
import { join } from "path";

export const metadata = { title: "Limitations · EuroInvTracker" };

function getContent(): string {
  try {
    const full = readFileSync(join(process.cwd(), "..", "docs", "methodology.md"), "utf-8");
    const match = full.match(/## Known limitations[\s\S]*?(?=\n## |$)/);
    return match ? match[0] : "_Known limitations section not found in methodology.md._";
  } catch {
    return "_Limitations document not found._";
  }
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export default function Page() {
  const content = getContent();
  const lines = content.split("\n");

  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-widest text-[var(--muted-foreground)]">Reference document</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold">Known limitations</h1>
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          Sourced from <code>docs/methodology.md</code>. Every analysis page links here via the Scope qualifiers callout.
        </p>
      </header>

      <div className="prose text-sm space-y-3">
        {lines.map((line, i) => {
          if (line.startsWith("# ")) return <h1 key={i} className="text-2xl font-bold mt-8">{line.slice(2)}</h1>;
          if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-semibold mt-6">{line.slice(3)}</h2>;
          if (line.startsWith("### ")) return <h3 key={i} className="text-lg font-semibold mt-4">{line.slice(4)}</h3>;
          if (line.match(/^[-*] /)) return <li key={i} className="ml-4 list-disc leading-relaxed">{renderInline(line.slice(2))}</li>;
          if (line.trim() === "") return <br key={i} />;
          return <p key={i} className="leading-relaxed">{renderInline(line)}</p>;
        })}
      </div>

      <div className="mt-10 text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] pt-4">
        Full methodology: <a href="/methodology" className="underline">methodology</a>.
        Canonical source: <code>docs/methodology.md</code> in the repository.
      </div>
    </article>
  );
}
