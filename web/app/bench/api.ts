"use client";

// The page's side of the local bench routes: small fetch helpers and the
// NDJSON turn reader. Every error comes back as plain words.
import type { BenchEvent } from "@/lib/bench/events";

export class BenchError extends Error {}

const OFF = "The bench is switched off. Start it with: cd web && MANDATE_BENCH_LOCAL=1 npm run dev";

async function explain(res: Response): Promise<string> {
  if (res.status === 404 && !(res.headers.get("content-type") ?? "").includes("json")) return OFF;
  try { const j = await res.json(); if (j?.error) return String(j.error); } catch { /* not json */ }
  return `The app answered ${res.status}.`;
}

export async function api<T>(url: string, init?: { method?: string; json?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? (init?.json ? "POST" : "GET"),
      headers: init?.json ? { "content-type": "application/json" } : undefined,
      body: init?.json ? JSON.stringify(init.json) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new BenchError("Cannot reach the bench server. Is `npm run dev` still running?");
  }
  if (!res.ok) throw new BenchError(await explain(res));
  return res.json() as Promise<T>;
}

/** Read a turn's NDJSON stream, calling onEvent per line. Resolves when the
 *  stream ends; rejects (AbortError) when the signal aborts. */
export async function readTurn(res: Response, onEvent: (e: BenchEvent) => void): Promise<void> {
  if (!res.ok || !res.body) throw new BenchError(await explain(res));
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      try { onEvent(JSON.parse(line) as BenchEvent); } catch { /* a torn line */ }
    }
  }
}

export const when = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const days = Math.round(mins / 1440);
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
};
