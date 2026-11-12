import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { benchEnabled } from "@/lib/bench/events";
import { BenchApp } from "./bench-app";
import "./bench.css";

// The owner's local bench: talk to Wincent in an app instead of a terminal.
// Development only, switched on explicitly (MANDATE_BENCH_LOCAL=1); everywhere
// else, including every Vercel deploy, this page does not exist.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bench", robots: { index: false, follow: false } };

export default function BenchPage() {
  if (!benchEnabled(process.env)) notFound();
  return <BenchApp />;
}
