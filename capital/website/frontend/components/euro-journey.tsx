"use client";

// "Follow the Euro" — the spine of the trip. A glowing euro coin rides a gold
// rail pinned to the side of the viewport, descending as the reader scrolls
// through the journey; the rail fills gold behind it. The vehicle of the story.

import { useEffect, useRef, useState, type ReactNode } from "react";

export function EuroJourney({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const total = r.height - vh;
        const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
        setProgress(p);
        setActive(r.top < vh * 0.5 && r.bottom > vh * 0.5);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      cancelAnimationFrame(raf);
    };
  }, []);

  const pct = `${(progress * 100).toFixed(2)}%`;

  return (
    <div ref={ref} className="relative">
      {/* The euro rail, fixed to the viewport while the journey is on screen. */}
      <div
        className={
          "pointer-events-none fixed left-5 top-24 bottom-12 z-30 hidden lg:block transition-opacity duration-700 " +
          (active ? "opacity-100" : "opacity-0")
        }
        aria-hidden
      >
        <div className="relative h-full w-px bg-[var(--border)]">
          <div
            className="absolute left-0 top-0 w-px bg-gradient-to-b from-[#2f4a7e] via-[#10203f] to-[#8f8b80]"
            style={{ height: pct }}
          />
          <div
            className="absolute -left-[14px] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[#7f5820] font-serif text-[13px] font-bold text-[var(--paper)] shadow-[0_1px_3px_rgba(10,10,10,0.2)]"
            style={{ top: pct }}
          >
            €
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

/** One full-width chapter of the trip on the dark stage. */
export function Chapter({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={"relative px-4 sm:px-6 " + className}>
      <div className="mx-auto max-w-5xl">{children}</div>
    </section>
  );
}
