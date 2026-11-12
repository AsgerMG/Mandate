"use client";

// Speech for the bench composer. Primary: record in the page (MediaRecorder),
// transcribe with whisper.cpp on this Mac (/api/bench/transcribe); the audio
// never leaves the laptop and the clip is deleted after. Hold the button (or
// Space in an empty composer) to talk, or click once to start and again to
// stop. Fallback, only when whisper is not installed: the browser's own speech
// recognition (Chrome sends audio to Google; Safari can run on-device).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

export type RecState = "idle" | "recording" | "transcribing";
export type RecorderHandle = { holdStart(): void; holdEnd(): void; cancel(): void };

const LANGS: [string, string][] = [["auto", "Auto"], ["en", "EN"], ["da", "DA"], ["de", "DE"], ["fr", "FR"], ["it", "IT"], ["es", "ES"], ["nl", "NL"], ["sv", "SV"], ["pl", "PL"]];
const MAX_MS = 10 * 60 * 1000;
const HOLD_MS = 350;

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
};
const makeRecognition = (): Recognition | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
};
const pickMime = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
const join = (base: string, add: string) => (base.trim() ? `${base.replace(/\s*$/, "")} ${add}` : add);
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export const Recorder = forwardRef<RecorderHandle, {
  value: string; onChange: (v: string) => void; disabled?: boolean; onState?: (s: RecState) => void;
}>(function Recorder({ value, onChange, disabled, onState }, ref) {
  const [engine, setEngine] = useState<"checking" | "whisper" | "browser" | "none">("checking");
  const [state, setStateRaw] = useState<RecState>("idle");
  const [note, setNote] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [lang, setLang] = useState(() => (typeof window === "undefined" ? "auto" : localStorage.getItem("bench.lang") ?? "auto"));
  const media = useRef<{ rec: MediaRecorder; stream: MediaStream; ctx: AudioContext; started: number; cancel: boolean } | null>(null);
  const browserRec = useRef<Recognition | null>(null);
  const hold = useRef<{ at: number } | null>(null);
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  const tick = useRef<number | null>(null);

  const setState = useCallback((s: RecState) => { setStateRaw(s); onState?.(s); }, [onState]);

  useEffect(() => {
    fetch("/api/bench/transcribe", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((s) => {
      if (s?.available) setEngine("whisper");
      else { setEngine(makeRecognition() ? "browser" : "none"); if (s?.reason) setNote(`Local transcription off: ${s.reason}`); }
    }).catch(() => setEngine(makeRecognition() ? "browser" : "none"));
  }, []);

  const release = () => {
    const m = media.current;
    if (!m) return;
    m.stream.getTracks().forEach((t) => t.stop());
    void m.ctx.close().catch(() => {});
    if (tick.current) cancelAnimationFrame(tick.current);
    tick.current = null;
    media.current = null;
    setLevel(0);
  };
  useEffect(() => () => { release(); browserRec.current?.stop(); }, []);

  async function send(blob: Blob) {
    setState("transcribing");
    try {
      const res = await fetch(`/api/bench/transcribe?lang=${encodeURIComponent(lang)}`, { method: "POST", headers: { "content-type": blob.type || "audio/webm" }, body: blob });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `transcription failed (${res.status})`);
      const text = String(j.text ?? "").trim();
      if (!text) setNote("Heard nothing. Try again, a little closer to the microphone.");
      else { onChange(join(valueRef.current, text)); setNote(null); }
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setState("idle");
    }
  }

  async function startWhisper() {
    if (media.current || state === "transcribing") return;
    setNote(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (e) {
      setNote((e as Error).name === "NotAllowedError" ? "Microphone blocked: allow it for localhost in the browser's site settings." : "No microphone found.");
      hold.current = null;
      return;
    }
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const started = Date.now();
    media.current = { rec, stream, ctx, started, cancel: false };
    const loop = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(Math.min(1, peak / 64));
      const ms = Date.now() - started;
      setElapsed(ms);
      if (ms > MAX_MS) { stopWhisper(); return; }
      tick.current = requestAnimationFrame(loop);
    };
    tick.current = requestAnimationFrame(loop);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const m = media.current;
      const dur = m ? Date.now() - m.started : 0;
      const cancelled = m?.cancel;
      release();
      if (cancelled) { setState("idle"); return; }
      if (dur < 500) { setState("idle"); setNote("Too short. Hold to talk, or click once to start and again to stop."); return; }
      void send(new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }));
    };
    rec.start(1000);
    setState("recording");
  }

  function stopWhisper(cancel = false) {
    const m = media.current;
    if (!m) return;
    m.cancel = cancel;
    if (m.rec.state !== "inactive") m.rec.stop(); else release();
  }

  function toggleBrowser() {
    if (browserRec.current) { browserRec.current.stop(); return; }
    const r = makeRecognition();
    if (!r) return;
    r.lang = lang === "auto" ? navigator.language || "en-GB" : lang;
    r.continuous = true; r.interimResults = true;
    const base = valueRef.current;
    let finalText = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      onChange(join(base, finalText + interim));
    };
    r.onerror = (e) => setNote(e.error === "not-allowed" ? "Microphone blocked: allow it in the browser." : `Dictation: ${e.error}`);
    r.onend = () => { browserRec.current = null; setState("idle"); };
    browserRec.current = r;
    r.start();
    setState("recording");
  }

  const holdStart = () => {
    if (disabled) return;
    if (engine === "browser") { toggleBrowser(); return; }
    if (engine !== "whisper") return;
    if (state === "recording") { hold.current = null; stopWhisper(); return; } // second click of toggle mode
    hold.current = { at: Date.now() };
    void startWhisper();
  };
  const holdEnd = () => {
    const h = hold.current;
    hold.current = null;
    if (engine !== "whisper" || !h) return;
    if (Date.now() - h.at >= HOLD_MS) stopWhisper(); // a hold: release ends it. A click: keep recording.
  };
  const cancel = () => { hold.current = null; if (engine === "whisper") stopWhisper(true); else browserRec.current?.stop(); };
  useImperativeHandle(ref, () => ({ holdStart, holdEnd, cancel }));

  if (engine === "none" || engine === "checking") {
    return engine === "none" ? <span className="bench-rec__off" title={note ?? "No speech engine"}>No mic</span> : <span className="bench-rec__btn" aria-hidden />;
  }
  const busy = state === "transcribing";
  return (
    <div className="bench-rec" data-state={state}>
      <button
        type="button"
        className="bench-rec__btn"
        disabled={disabled || busy}
        onPointerDown={(e) => { e.preventDefault(); holdStart(); }}
        onPointerUp={holdEnd}
        onPointerLeave={() => { if (hold.current && Date.now() - hold.current.at >= HOLD_MS) holdEnd(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); holdStart(); } }}
        aria-pressed={state === "recording"}
        title={engine === "whisper"
          ? "Hold to talk, or click to start and click to stop. Space works too when the box is empty. Transcribed on this Mac."
          : "Dictate with the browser's recognizer (local whisper is not installed)"}
      >
        {busy ? <span className="bench-rec__spin" aria-label="Transcribing" /> : <MicIcon />}
        <span className="bench-rec__meter" style={{ transform: `scaleY(${state === "recording" ? 0.15 + level * 0.85 : 0})` }} aria-hidden />
      </button>
      <div className="bench-rec__meta">
        {state === "recording" ? <span className="bench-rec__time"><i />{engine === "whisper" ? clock(elapsed) : "listening"}</span>
          : busy ? <span className="bench-rec__time">transcribing</span>
          : (
            <select aria-label="Spoken language" value={lang} onChange={(e) => { setLang(e.target.value); localStorage.setItem("bench.lang", e.target.value); }} className="bench-rec__lang">
              {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
        <span className="bench-rec__engine">{engine === "whisper" ? "on-device" : "browser"}</span>
      </div>
      {note && <p className="bench-rec__note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></p>}
    </div>
  );
});

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}
