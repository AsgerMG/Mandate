"use client";

// Push-to-talk dictation for the bench: the browser's own speech recognition
// (Web Speech API). Chrome sends the audio to Google's speech service; Safari on
// macOS can recognise on-device. For confidential cases, prefer Safari or macOS
// dictation (Fn twice). No server of ours sees the audio.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
};

function makeRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/** Appends what is said to the draft (`base` + spoken text), live. */
export function DictationButton({ value, onChange, disabled }: {
  value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  const rec = useRef<Recognition | null>(null);
  const base = useRef("");
  const [on, setOn] = useState(false);
  // whether this browser has speech recognition: read on the client, false on the server
  const hasApi = useSyncExternalStore(() => () => {}, () => makeRecognition() !== null, () => false);
  const [blocked, setBlocked] = useState(false);
  const supported = hasApi && !blocked;
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => () => rec.current?.stop(), []);

  function start() {
    const r = makeRecognition();
    if (!r) { setBlocked(true); return; }
    r.lang = navigator.language || "en-GB";
    r.continuous = true;
    r.interimResults = true;
    base.current = value ? value.replace(/\s*$/, " ") : "";
    let finalText = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      onChange(base.current + finalText + interim);
    };
    r.onerror = (e) => { setNote(e.error === "not-allowed" ? "Microphone blocked: allow it in the browser" : `Dictation: ${e.error}`); };
    r.onend = () => setOn(false);
    rec.current = r;
    setNote(null);
    r.start();
    setOn(true);
  }

  function stop() { rec.current?.stop(); setOn(false); }

  if (!supported) return null;
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={on ? stop : start}
        disabled={disabled}
        aria-pressed={on}
        title={on ? "Stop dictation" : "Dictate (click, speak, click to stop)"}
        className={`rounded-sm border px-3 py-3 text-[11px] font-semibold uppercase tracking-[.08em] disabled:opacity-40 ${
          on ? "border-[#a77c36] bg-[#a77c36] text-white animate-pulse" : "border-[#c9bf9c] text-[#5e6574] hover:border-[#a77c36]"}`}
      >
        {on ? "● Listening" : "🎙 Speak"}
      </button>
      {note && <span className="mt-1 text-[10px] text-[#a0522d]">{note}</span>}
    </div>
  );
}
