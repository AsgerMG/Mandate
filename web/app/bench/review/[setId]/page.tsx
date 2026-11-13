import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { benchEnabled } from "@/lib/bench/events";
import { ReviewSetApp } from "../../review-set-app";
import "../../bench.css";
import "../../board.css";

// A review set for the expert (/bench/review/<set id>): the runs in order,
// "Case 1 of 4", each a chat with a comment on every reply and a 1-5 grade,
// and none of Train or Distil. Local bench only, like /bench itself.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review", robots: { index: false, follow: false } };

export default async function ReviewSetPage({ params }: { params: Promise<{ setId: string }> }) {
  if (!benchEnabled(process.env)) notFound();
  const { setId } = await params;
  return <ReviewSetApp setId={setId} />;
}
