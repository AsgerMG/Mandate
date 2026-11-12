// LOCAL-ONLY (lib/bench/guard.ts). Speech to text with whisper.cpp on this
// Mac (lib/bench/whisper.ts). GET says whether it is installed (and warms the
// model); POST takes a recorded clip and returns the text. The clip is written
// to a private temp dir and deleted after; it never leaves the laptop.
import { fail, guard, json } from "@/lib/bench/guard";
import { LANGS, prewarm, transcribe, whisperStatus } from "@/lib/bench/whisper";

export const dynamic = "force-dynamic";
const MAX_BYTES = 25 * 1024 * 1024; // far more than a dictated answer

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const st = whisperStatus();
  if (st.available) prewarm();
  return json(st);
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return fail("the recording is too long", 413);
  const type = req.headers.get("content-type") ?? "";
  if (!/^(audio|video)\//.test(type) && type !== "application/octet-stream") return fail("expected an audio recording");
  const lang = new URL(req.url).searchParams.get("lang") ?? "auto";
  if (!(LANGS as readonly string[]).includes(lang)) return fail("unsupported language");
  const audio = Buffer.from(await req.arrayBuffer());
  if (audio.length < 200) return fail("the recording is empty");
  if (audio.length > MAX_BYTES) return fail("the recording is too long", 413);
  try {
    return json(await transcribe(audio, lang));
  } catch (e) {
    return fail(`Transcription failed: ${(e as Error).message}`, 500);
  }
}
