/**
 * One agent's tool-use loop: send, run the tools the model asked for, send the
 * results back, until the model stops. Used for the orchestrator, for each
 * specialist, and (one turn, server tools only) for research.
 *
 * The model client is a parameter, so the loop is tested on a scripted fake
 * (loop.test.ts) and the route passes the real SDK. Each response is metered
 * through lib/intelligence/cost.ts, and the loop stops at the mission's euro
 * ceiling rather than discovering the bill afterwards.
 *
 * Stop reasons, per the API: end_turn ends; pause_turn (a server tool's own
 * loop paused) is re-sent unchanged; refusal ends without running that turn's
 * tools; max_tokens with a tool call pending is an error (the input may be
 * truncated); tool_use runs every requested tool and returns all results in ONE
 * user message.
 */
import Anthropic from "@anthropic-ai/sdk";
import { currentCost, recordUsage } from "@/lib/intelligence/cost";

export interface ModelClient {
  create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
}

/** The SDK, streamed (long turns would otherwise hit HTTP timeouts). */
export function sdkClient(client = new Anthropic({ maxRetries: 2 })): ModelClient {
  return {
    create: (params) => client.messages.stream(params).finalMessage(),
  };
}

export interface ToolHandler {
  /** Runs the tool. A thrown error becomes an is_error result the model can read. */
  run(input: Record<string, unknown>): Promise<unknown>;
  /** Required keys, checked before running (the parse can be truncated). */
  required?: string[];
}

export interface LoopOptions {
  client: ModelClient;
  model: string;
  system: Anthropic.TextBlockParam[];
  tools: Anthropic.ToolUnion[];
  handlers: Record<string, ToolHandler>;
  messages: Anthropic.MessageParam[];
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  maxTurns?: number;
  /** Euros: past `wrapUpAt` a note asks the model to finish; at `stopAt` the loop ends. */
  budget?: { wrapUpAt: number; stopAt: number; note: string };
  onToolCall?: (name: string, input: Record<string, unknown>) => void;
  onText?: (text: string) => void;
}

export interface LoopResult {
  text: string;
  messages: Anthropic.MessageParam[];
  stop: "end_turn" | "refusal" | "max_turns" | "budget" | "error";
  turns: number;
  error?: string;
}

function textOf(m: Anthropic.Message): string {
  return m.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}

function render(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 1);
}

export async function runLoop(o: LoopOptions): Promise<LoopResult> {
  const messages = [...o.messages];
  const maxTurns = o.maxTurns ?? 12;
  let wrapped = false;
  let lastText = "";
  for (let turn = 1; turn <= maxTurns; turn++) {
    if (o.budget && currentCost() >= o.budget.stopAt) {
      return { text: lastText, messages, stop: "budget", turns: turn - 1 };
    }
    let msg: Anthropic.Message;
    try {
      msg = await o.client.create({
        model: o.model,
        max_tokens: o.maxTokens ?? 16000,
        system: o.system,
        tools: o.tools,
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: o.effort ?? "medium" },
        // caches the conversation prefix turn over turn (tools and system are
        // cached by the breakpoint on the last system block)
        cache_control: { type: "ephemeral" },
      });
    } catch (e) {
      if (e instanceof Anthropic.APIError) {
        return { text: lastText, messages, stop: "error", turns: turn, error: `${e.status}: ${e.message}` };
      }
      return { text: lastText, messages, stop: "error", turns: turn, error: String(e) };
    }
    recordUsage(msg.model ?? o.model, msg.usage as never);
    const text = textOf(msg);
    if (text) { lastText = text; o.onText?.(text); }
    messages.push({ role: "assistant", content: msg.content });

    if (msg.stop_reason === "pause_turn") continue;
    if (msg.stop_reason === "refusal") return { text: lastText, messages, stop: "refusal", turns: turn };
    const calls = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!calls.length) return { text: lastText, messages, stop: "end_turn", turns: turn };
    if (msg.stop_reason === "max_tokens") {
      return { text: lastText, messages, stop: "error", turns: turn, error: "a tool call was cut off at max_tokens" };
    }

    const results = await Promise.all(calls.map(async (call): Promise<Anthropic.ToolResultBlockParam> => {
      const input = (call.input ?? {}) as Record<string, unknown>;
      const h = o.handlers[call.name];
      if (!h) return { type: "tool_result", tool_use_id: call.id, is_error: true, content: `unknown tool ${call.name}` };
      const missing = (h.required ?? []).filter((k) => input[k] === undefined || input[k] === null || input[k] === "");
      if (missing.length) {
        return { type: "tool_result", tool_use_id: call.id, is_error: true,
          content: `missing required input: ${missing.join(", ")}` };
      }
      o.onToolCall?.(call.name, input);
      try {
        return { type: "tool_result", tool_use_id: call.id, content: render(await h.run(input)) };
      } catch (e) {
        return { type: "tool_result", tool_use_id: call.id, is_error: true,
          content: e instanceof Error ? e.message : String(e) };
      }
    }));
    const content: (Anthropic.ToolResultBlockParam | Anthropic.TextBlockParam)[] = results;
    if (o.budget && !wrapped && currentCost() >= o.budget.wrapUpAt) {
      wrapped = true;
      content.push({ type: "text", text: o.budget.note });
    }
    messages.push({ role: "user", content });
  }
  return { text: lastText, messages, stop: "max_turns", turns: maxTurns };
}
