/**
 * Live research: the open web, with every source used stored in grounding.
 *
 * One bounded sub-call on the research model with Anthropic's web_search and
 * web_fetch server tools. It must return findings as {claim, url, quote}, the
 * quote verbatim from the page. Each URL then goes through mandate-api
 * /grounding/fetch (stored once, by sha256, for every founder after this one)
 * and each quote through /grounding/cite. A finding whose quote is not on the
 * page as we fetched it is returned as UNVERIFIED, never as cited: the model's
 * memory of a page is not the page.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { recordUsage } from "@/lib/intelligence/cost";
import type { CitationLedger, Specialist } from "./ledger";
import { RESEARCH_EFFORT, RESEARCH_MODEL, WEB_FETCH_TOOL, WEB_SEARCH_TOOL } from "./models";
import type { ModelClient } from "./loop";
import type { MandateApi } from "./services";

const SYSTEM = `You research public-policy and public-finance questions for a European startup advisor.
Use web search and web fetch. Prefer PRIMARY sources: the institution's own pages, official journals,
legislation databases, regulators, programme rules. Avoid blogs and consultancies unless nothing else exists.

Return ONLY a JSON object, no prose around it:
{"summary": "<3-6 sentences answering the question>",
 "findings": [{"claim": "<one fact>", "url": "<the page that states it>",
               "quote": "<the exact words on that page that state it, copied verbatim, 1-3 sentences>"}],
 "gaps": ["<what you could not establish>"]}
At most 6 findings. The quote MUST be copied character for character from the page text, because it
is checked against the page. If you cannot quote it, put it under gaps instead.`;

export interface ResearchFinding { claim: string; url: string; quote: string }

function parse(text: string): { summary?: string; findings?: ResearchFinding[]; gaps?: string[] } {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = block ? block[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) throw new SyntaxError("research returned no JSON");
  return JSON.parse(body.slice(start, end + 1));
}

export async function research(deps: {
  client: ModelClient; mandate: MandateApi; ledger: CitationLedger; specialist: Specialist;
}, input: { question: string; domains?: string[]; max_searches?: number }) {
  const search: Anthropic.ToolUnion = {
    type: WEB_SEARCH_TOOL, name: "web_search", max_uses: Math.min(input.max_searches ?? 4, 5),
    ...(input.domains?.length ? { allowed_domains: input.domains } : {}),
  } as Anthropic.ToolUnion;
  const fetchTool = { type: WEB_FETCH_TOOL, name: "web_fetch", max_uses: 4 } as unknown as Anthropic.ToolUnion;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: input.question }];
  let msg: Anthropic.Message | undefined;
  for (let i = 0; i < 4; i++) {
    msg = await deps.client.create({
      model: RESEARCH_MODEL, max_tokens: 12000,
      system: [{ type: "text", text: SYSTEM }],
      tools: [search, fetchTool], messages,
      thinking: { type: "adaptive" }, output_config: { effort: RESEARCH_EFFORT },
    });
    recordUsage(msg.model ?? RESEARCH_MODEL, msg.usage as never);
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  const text = (msg?.content ?? []).filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text).join("\n");
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(text);
  } catch {
    return { summary: text.slice(0, 1500), cited: [], unverified: [],
      note: "Research did not return structured findings; everything above is UNVERIFIED." };
  }
  const cited: { citation: string; claim: string; url: string }[] = [];
  const unverified: { claim: string; url: string; reason: string }[] = [];
  for (const f of (parsed.findings ?? []).slice(0, 6)) {
    if (!f?.url || !f?.quote) continue;
    try {
      const v = await deps.mandate.fetch(f.url);
      if (!v.citable) throw new Error("the page has no extractable text");
      const c = await deps.mandate.cite({ sha256: v.sha256, quote: f.quote });
      const id = deps.ledger.add({ ...c, title: c.title ?? v.title ?? null }, deps.specialist, "research",
        v.title ?? undefined);
      cited.push({ citation: id, claim: f.claim, url: c.canonical_url });
    } catch (e) {
      unverified.push({ claim: f.claim, url: f.url, reason: e instanceof Error ? e.message.slice(0, 160) : String(e) });
    }
  }
  return {
    summary: parsed.summary ?? "",
    cited: cited.map((c) => ({ ...c, line: deps.ledger.line(c.citation) })),
    unverified,
    gaps: parsed.gaps ?? [],
    note: "Cite only the [cN] ids under `cited`. Everything under `unverified` or in the summary alone is UNVERIFIED.",
  };
}
