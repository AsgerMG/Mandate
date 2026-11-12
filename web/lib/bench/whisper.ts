// Local transcription for the bench: whisper.cpp on this Mac. Server only.
//
// The page records with MediaRecorder and posts the clip; here it is converted
// to 16 kHz mono WAV with ffmpeg in a private temp dir, transcribed, and the
// temp dir deleted, success or not. The audio never leaves the laptop.
//
// Speed: a whisper-server child (bound to 127.0.0.1) keeps the model loaded,
// so a clip costs well under a second instead of a 5-15 s model load. If the
// server will not start, whisper-cli runs per clip instead.
//
//   brew install whisper-cpp ffmpeg
//   model: ~/Mandate-backups/whisper/ggml-large-v3-turbo-q5_0.bin (574 MB)
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BREW = "/opt/homebrew/bin";
const which = (name: string, env?: string) => {
  if (env && process.env[env]) return process.env[env]!;
  for (const d of [BREW, "/usr/local/bin"]) if (existsSync(path.join(d, name))) return path.join(d, name);
  return null;
};
export const whisperModel = () =>
  process.env.WHISPER_MODEL ?? path.join(os.homedir(), "Mandate-backups", "whisper", "ggml-large-v3-turbo-q5_0.bin");

export type WhisperStatus = { available: boolean; reason?: string; model?: string };

export function whisperStatus(): WhisperStatus {
  if (!which("whisper-cli", "WHISPER_BIN")) return { available: false, reason: "whisper-cli is not installed (brew install whisper-cpp)" };
  if (!which("ffmpeg", "FFMPEG_BIN")) return { available: false, reason: "ffmpeg is not installed (brew install ffmpeg)" };
  if (!existsSync(whisperModel())) return { available: false, reason: `no model at ${whisperModel()}` };
  return { available: true, model: path.basename(whisperModel()) };
}

export const LANGS = ["auto", "en", "da", "de", "fr", "it", "es", "nl", "sv", "pl"] as const;

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (c: Buffer) => { out += c.toString("utf8"); });
    p.stderr.on("data", (c: Buffer) => { err = (err + c.toString("utf8")).slice(-4000); });
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("error", (e) => { clearTimeout(t); resolve({ code: -1, out, err: e.message }); });
    p.on("close", (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

// ── the warm server ────────────────────────────────────────────────────────

type Warm = { proc: ChildProcess | null; port: number; ready: Promise<boolean> };
const G = globalThis as unknown as { __benchWhisper?: Warm };
const PORT = Number(process.env.WHISPER_PORT ?? 8178);

async function healthy(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(800) });
    return r.ok && /whisper/i.test(await r.text());
  } catch { return false; }
}

function warm(): Warm {
  if (G.__benchWhisper) return G.__benchWhisper;
  const w: Warm = { proc: null, port: PORT, ready: Promise.resolve(false) };
  w.ready = (async () => {
    if (await healthy(PORT)) return true; // one already up (an earlier dev server)
    const bin = which("whisper-server");
    if (!bin) return false;
    const p = spawn(bin, ["-m", whisperModel(), "--host", "127.0.0.1", "--port", String(PORT), "-nt", "-l", "auto",
      "--public", os.tmpdir()], { stdio: "ignore" });
    w.proc = p;
    p.on("exit", () => { if (G.__benchWhisper === w) G.__benchWhisper = undefined; });
    process.once("exit", () => p.kill("SIGTERM"));
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await healthy(PORT)) return true;
    }
    p.kill("SIGTERM");
    return false;
  })();
  G.__benchWhisper = w;
  return w;
}

/** Start loading the model before the first clip arrives. */
export function prewarm(): void { if (whisperStatus().available) void warm().ready; }

async function viaServer(wav: Buffer, lang: string): Promise<string | null> {
  const w = warm();
  if (!(await w.ready)) return null;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "clip.wav");
  form.append("response_format", "json");
  form.append("language", lang);
  form.append("temperature", "0");
  try {
    const r = await fetch(`http://127.0.0.1:${w.port}/inference`, { method: "POST", body: form, signal: AbortSignal.timeout(120_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { text?: string; error?: string };
    return typeof j.text === "string" ? j.text : null;
  } catch { return null; }
}

/** whisper's way of saying "nothing": [BLANK_AUDIO], (music), and so on. */
export function cleanTranscript(s: string): string {
  return s.replace(/\[(?:BLANK_AUDIO|MUSIC|NOISE|SILENCE|[A-Z _]+)\]|\((?:music|silence|noise|inaudible)[^)]*\)/gi, "")
    .replace(/\s+/g, " ").trim();
}

export async function transcribe(audio: Buffer, lang = "auto"): Promise<{ text: string; ms: number; engine: "server" | "cli" }> {
  const st = whisperStatus();
  if (!st.available) throw new Error(st.reason);
  const started = Date.now();
  const tmp = mkdtempSync(path.join(os.tmpdir(), "bench-whisper-"));
  try {
    const src = path.join(tmp, "in.audio");
    const wavPath = path.join(tmp, "in.wav");
    writeFileSync(src, audio, { mode: 0o600 });
    const ff = await run(which("ffmpeg", "FFMPEG_BIN")!, ["-loglevel", "error", "-nostdin", "-y", "-i", src, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath], 60_000);
    if (ff.code !== 0 || !existsSync(wavPath)) throw new Error(`could not read the recording (${ff.err.trim().split("\n").pop() || "ffmpeg failed"})`);
    const wav = readFileSync(wavPath);
    const fromServer = await viaServer(wav, lang);
    if (fromServer !== null) return { text: cleanTranscript(fromServer), ms: Date.now() - started, engine: "server" };
    const outBase = path.join(tmp, "out");
    const r = await run(which("whisper-cli", "WHISPER_BIN")!, ["-np", "-nt", "-l", lang, "-m", whisperModel(), "-f", wavPath, "-otxt", "-of", outBase], 180_000);
    if (r.code !== 0) throw new Error(`whisper failed (${r.err.trim().split("\n").pop() || r.code})`);
    const text = existsSync(`${outBase}.txt`) ? readFileSync(`${outBase}.txt`, "utf8") : r.out;
    return { text: cleanTranscript(text), ms: Date.now() - started, engine: "cli" };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
