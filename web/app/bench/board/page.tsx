import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { benchEnabled } from "@/lib/bench/events";
import { CaseBoardPage } from "../case-board-page";
import "../bench.css";
import "../board.css";

// The full case board: a conversation's board as a client-ready page
// (/bench/board?c=<conversation id>, or ?fixture=forklift | fintech). Local
// bench only, like /bench itself: everywhere else this page does not exist.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Case board", robots: { index: false, follow: false } };

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!benchEnabled(process.env)) notFound();
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return <CaseBoardPage conversationId={one(q.c) ?? null} fixture={one(q.fixture) ?? null} />;
}
