"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { ExpertPresence } from "@/components/mandate/expert-presence";
import { CITE_RE, parseLanded, parseWebSources, type BenchEvent, type Citation } from "@/lib/bench/events";

type Msg = { role: "client" | "wincent"; text: string };
type Busy = null | { label: string; kind: "thinking" | "researching" | "reading" | "writing" };
type Source = { url: string; label: string };

const STARTERS: { title: string; tag: string; text: string }[] = [
  {
    title: "Fintech guarantees",
    tag: "DE · FR · IT · EU",
    text: "We are a fintech lender. We have raised EUR 40M. We want our SME loan portfolio guaranteed by public guarantee schemes in Germany, France and Italy, and at EU level. We do not have a banking licence. What are our routes?",
  },
  {
    title: "Italian robot deployment",
    tag: "IT",
    text: "We deploy industrial robots in SME factories on a robots-as-a-service model: we buy the robots, place them with the customer and finance them over 3-5 years. We are expanding into Italy. We are thinking of setting up an Italian company and either registering it as a startup innovativa or getting Art. 106 status so we can finance our customers ourselves. Which public money fits, and where in Italy?",
  },
  {
    title: "AI tutoring for kids",
    tag: "Edtech · B2C",
    text: "We're an AI-native startup building learning tech that engages young children. We already have private investors. How can public money help us?",
  },
];

const SAVE_PROMPT = "Please save the run now, in the bench format.";

/** "[c1, c4]" becomes two chip links the markdown renderer turns into chips. */
const withChips = (text: string) =>
  text.replace(CITE_RE, (_, ids: string) =>
    ids.split(/\s*[,;]\s*/).map((id) => `[${id}](#cite-${id})`).join(""));

function Chip({ id, cite }: { id: string; cite?: Citation }) {
  const web = id.startsWith("w");
  return (
    <span className="bench-chip" data-kind={web ? "web" : "grounded"} tabIndex={0}>
      {id}
      <span className="bench-chip__card" role="tooltip">
        <span className="bench-chip__kind">{web ? "Web source, fetched this run" : "Grounded citation"}</span>
        {cite?.label && <span className="bench-chip__label">{cite.label}</span>}
        {cite?.quote && <span className="bench-chip__quote">&ldquo;{cite.quote.length > 420 ? `${cite.quote.slice(0, 420)}…` : cite.quote}&rdquo;</span>}
        {cite?.url && <a className="bench-chip__url" href={cite.url} target="_blank" rel="noreferrer">{cite.url}</a>}
        {!cite && <span className="bench-chip__quote">Source details not captured in this view.</span>}
      </span>
    </span>
  );
}

function Reply({ text, cites }: { text: string; cites: Record<string, Citation> }) {
  return (
    <div className="bench-md">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("#cite-")) { const id = href.slice(6); return <Chip id={id} cite={cites[id]} />; }
            return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
          },
        }}
      >
        {withChips(text)}
      </ReactMarkdown>
    </div>
  );
}

function LandedList({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <section className="mt-6">
      <h3 className="font-mono text-[9px] uppercase tracking-[.15em] text-[#8d7240]">{title}</h3>
      {items.length ? (
        <ul className="mt-2 space-y-2">
          {items.map((it, i) => (
            <li key={i} className="border-l-2 border-[#d8cfbc] pl-3 text-[12px] leading-relaxed text-[#2b3c5e]">
              <Reply text={it} cites={{}} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] text-[#9a917f]">{empty}</p>
      )}
    </section>
  );
}

export function BenchApp() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [cites, setCites] = useState<Record<string, Citation>>({});
  const [sources, setSources] = useState<Source[]>([]);
  const [saved, setSaved] = useState<{ path: string; ledger: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const allCites = useMemo(() => {
    const web: Record<string, Citation> = {};
    for (const m of messages) if (m.role === "wincent") Object.assign(web, parseWebSources(m.text));
    return { ...web, ...cites };
  }, [messages, cites]);

  const landed = useMemo(() => {
    const acc = { decisions: [] as string[], flags: [] as string[], steps: [] as string[], question: null as string | null };
    for (const m of messages) {
      if (m.role !== "wincent") continue;
      const l = parseLanded(m.text);
      acc.decisions.push(...l.decisions); acc.flags.push(...l.flags); acc.steps.push(...l.steps);
      if (l.question) acc.question = l.question;
    }
    return acc;
  }, [messages]);

  async function send(text: string, sid: string | null = sessionId) {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "client", text: message }, { role: "wincent", text: "" }]);
    setBusy({ label: "thinking", kind: "thinking" });
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/api/bench/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, sessionId: sid }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(res.status === 404 ? "The bench route is off. Start the dev server with MANDATE_BENCH_LOCAL=1." : `HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let sawText = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as BenchEvent;
          if (ev.t === "session") setSessionId(ev.id);
          else if (ev.t === "activity") setBusy({ label: ev.label, kind: ev.kind });
          else if (ev.t === "cites") setCites((c) => ({ ...c, ...ev.items }));
          else if (ev.t === "source") setSources((s) => (s.some((x) => x.url === ev.url) ? s : [...s, { url: ev.url, label: ev.label }]));
          else if (ev.t === "saved") setSaved({ path: ev.path, ledger: ev.ledger });
          else if (ev.t === "done" && ev.error) setError(ev.error);
          else if (ev.t === "text") {
            // A new assistant message inside one turn (text, tools, more text)
            // starts a new paragraph rather than running on.
            const d = ev.d === "" ? (sawText ? "\n\n" : "") : ev.d;
            if (ev.d) sawText = true;
            if (!d) continue;
            setMessages((m) => {
              const last = m[m.length - 1];
              const next = (last.text + d).replace(/^\s+/, "").replace(/\n{3,}/g, "\n\n");
              return [...m.slice(0, -1), { ...last, text: next }];
            });
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(null);
      abort.current = null;
      setMessages((m) => (m.length && m[m.length - 1].role === "wincent" && !m[m.length - 1].text.trim() ? m.slice(0, -1) : m));
    }
  }

  function newCase() {
    abort.current?.abort();
    setMessages([]); setSessionId(null); setCites({}); setSources([]); setSaved(null); setError(null); setBusy(null); setInput("");
  }

  const figureState = busy ? (busy.kind === "writing" ? "speaking" : "working") : messages.length ? "listening" : "idle";
  const statusLine = busy ? `${busy.label.charAt(0).toUpperCase()}${busy.label.slice(1)}…` : messages.length ? "Your turn" : "Ready for a case";
  const grounded = Object.entries(cites);

  return (
    <div className="bench-shell bg-[#f3eee3] text-[#162544]">
      {/* Left rail: the case, the starters, and Wincent at the foot. */}
      <aside className="bench-rail border-r border-[#d8cfbc] bg-[#ece5d7]">
        <div className="p-4">
          <div className="rounded-lg border border-[#d1c5ae] bg-[#f8f3e9] p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-[#1c3156] font-serif text-sm font-semibold text-white">W</div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">Wincent bench</p>
                <p className="text-[10px] text-[#858070]">Public capital · local</p>
              </div>
            </div>
          </div>
          <button
            onClick={newCase}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm bg-[#132342] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-white hover:bg-[#1b315b]"
          >
            <span className="text-[#e4bd69]">✦</span> New case
          </button>
          <p className="mt-6 font-mono text-[8px] uppercase tracking-[.14em] text-[#8f7750]">Starter cases</p>
          <div className="mt-2 space-y-1.5">
            {STARTERS.map((s) => (
              <button
                key={s.title}
                disabled={!!busy}
                onClick={() => { newCase(); void send(s.text, null); }}
                className="block w-full rounded-md px-3 py-2 text-left transition hover:bg-[#e2dacb] disabled:opacity-50"
              >
                <span className="block text-[13px] text-[#23304a]">{s.title}</span>
                <span className="font-mono text-[8px] uppercase tracking-[.1em] text-[#9c9586]">{s.tag}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="bench-figure" data-state={figureState}>
          <ExpertPresence name="wincent" priority className="bench-figure__presence" />
          <div className="bench-figure__label">
            <span className="font-serif text-lg font-semibold">Wincent</span>
            <span className="bench-figure__state"><i aria-hidden />{statusLine}</span>
          </div>
        </div>
      </aside>

      {/* The conversation. */}
      <section className="bench-main">
        <div ref={scroller} className="bench-scroll">
          <div className="mx-auto max-w-[46rem] px-6 py-8">
            {messages.length === 0 ? (
              <div className="pt-10">
                <p className="font-mono text-[9px] uppercase tracking-[.17em] text-[#8d7240]">Public capital</p>
                <h1 className="mt-2 font-serif text-4xl font-semibold tracking-[-.025em] text-[#142342] sm:text-5xl">Bring Wincent a case.</h1>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#697080]">
                  Describe the company and what it is trying to do. Wincent asks what is decisive first, then works the case with you, citing every fact.
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {STARTERS.map((s) => (
                    <button
                      key={s.title}
                      onClick={() => void send(s.text)}
                      className="group flex flex-col items-start justify-start self-start rounded-xl border border-[#d8cfbc] bg-[#fffdfa] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#b9a77d] hover:shadow-[0_14px_30px_rgba(30,30,20,.06)]"
                    >
                      <span className="font-mono text-[8px] uppercase tracking-[.12em] text-[#7c715e]">{s.tag}</span>
                      <span className="mt-2 block font-serif text-lg font-semibold leading-tight text-[#162544]">{s.title}</span>
                      <span className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-[#5e6574]">{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((m, i) =>
                  m.role === "client" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-[#132342] px-4 py-3 text-[13.5px] leading-relaxed text-white">
                        {m.text === SAVE_PROMPT ? "Save the run." : m.text}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-3">
                      <div className="mt-1 grid h-7 w-7 flex-none place-items-center rounded-full border border-[#c9bf9c] bg-[#fffdfa] font-serif text-xs font-semibold text-[#7f5820]">W</div>
                      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-[#e2dbc4] bg-[#fffdfa] px-5 py-4">
                        <p className="mb-1 font-mono text-[8px] uppercase tracking-[.14em] text-[#8d7240]">Wincent</p>
                        {m.text ? <Reply text={m.text} cites={allCites} /> : <p className="flex items-center gap-3 text-[11px] italic text-[#8d8574]"><Typing />{busy?.label ? `${busy.label}…` : ""}</p>}
                        {busy && i === messages.length - 1 && m.text && <p className="mt-3 text-[11px] italic text-[#8d8574]">{busy.label}…</p>}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
            {error && <p className="mt-6 rounded-md border border-[#e0b8b0] bg-[#fbefec] px-4 py-3 text-[12px] text-[#8a3b2f]">{error}</p>}
            {saved && (
              <p className="mt-6 rounded-md border border-[#c9d8c4] bg-[#f0f5ee] px-4 py-3 text-[12px] text-[#2f5a35]">
                Run saved: <code className="font-mono">{saved.path}</code>
                {saved.ledger && <> and <code className="font-mono">{saved.ledger}</code></>}
              </p>
            )}
          </div>
        </div>
        <form
          className="bench-composer border-t border-[#d8cfbc] bg-[#f3eee3]/95 px-6 py-4"
          onSubmit={(e) => { e.preventDefault(); void send(input); }}
        >
          <div className="mx-auto flex max-w-[46rem] items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
              rows={2}
              placeholder={messages.length ? "Answer Wincent, or ask the next question" : "Describe the company and what it needs"}
              className="min-h-[3.25rem] flex-1 resize-none rounded-lg border border-[#d1c5ae] bg-[#fffdfa] px-4 py-3 text-[13.5px] leading-relaxed outline-none placeholder:text-[#a39a88] focus:border-[#a77c36]"
            />
            {busy ? (
              <button type="button" onClick={() => abort.current?.abort()} className="rounded-sm border border-[#c9bf9c] px-4 py-3 text-[11px] font-semibold uppercase tracking-[.08em] text-[#5e6574]">Stop</button>
            ) : (
              <button type="submit" disabled={!input.trim()} className="rounded-sm bg-[#132342] px-5 py-3 text-[11px] font-semibold uppercase tracking-[.08em] text-white hover:bg-[#1b315b] disabled:opacity-40">Send</button>
            )}
          </div>
        </form>
      </section>

      {/* What landed: only what the replies and the tools actually said. */}
      <aside className="bench-landed border-l border-[#d8cfbc] bg-[#f8f4ea]">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">What landed</h2>
          <button
            disabled={!sessionId || !!busy}
            onClick={() => void send(SAVE_PROMPT)}
            className="rounded-sm border border-[#b9a77d] px-3 py-1.5 font-mono text-[8px] uppercase tracking-[.12em] text-[#70572e] hover:bg-[#efe6d3] disabled:opacity-40"
          >
            Save the run
          </button>
        </div>
        <p className="mt-1 text-[11px] text-[#848071]">Read from Wincent&apos;s replies so far.</p>
        {landed.question && (
          <div className="mt-5 rounded-lg border border-[#e4d6b4] bg-[#fbf3df] p-3">
            <p className="font-mono text-[8px] uppercase tracking-[.14em] text-[#8d7240]">Open question</p>
            <div className="mt-1 text-[12px] leading-relaxed text-[#23304a]"><Reply text={landed.question} cites={{}} /></div>
          </div>
        )}
        <LandedList title="Decisions" items={landed.decisions} />
        <LandedList title="Flags" items={landed.flags} />
        <LandedList title="Next steps" items={landed.steps} />
        <section className="mt-6">
          <h3 className="font-mono text-[9px] uppercase tracking-[.15em] text-[#8d7240]">Sources</h3>
          {grounded.length === 0 && sources.length === 0 ? (
            <p className="mt-2 text-[11px] text-[#9a917f]">None yet. Each grounded citation and web page Wincent reads appears here.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {grounded.map(([id, c]) => (
                <li key={id} className="flex gap-1.5 text-[11px] leading-snug" title={c.quote}>
                  <span className="bench-chip bench-chip--static self-start" data-kind="grounded">{id}</span>
                  {c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-[#2b3c5e] hover:text-[#7f5820]">{c.label || c.url}</a> : <span className="line-clamp-2 text-[#2b3c5e]">{c.label}</span>}
                </li>
              ))}
              {sources.map((s) => (
                <li key={s.url} className="text-[11px] leading-snug">
                  <span className="bench-chip bench-chip--static" data-kind="web">web</span>{" "}
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-[#2b3c5e] hover:text-[#7f5820]">{s.label}</a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="mt-8 border-t border-[#e6dfd1] pt-3 text-[10px] leading-relaxed text-[#9a917f]">
          Local bench. Runs Claude Code on your own plan; production is read only. Nothing leaves this laptop until you save and commit.
        </p>
      </aside>
    </div>
  );
}

function Typing(): ReactNode {
  return (
    <span className="bench-typing" aria-label="Wincent is working">
      <i /><i /><i />
    </span>
  );
}
