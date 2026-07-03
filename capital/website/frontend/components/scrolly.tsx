"use client";

// A reusable sticky-graphic scrollytelling engine. A visual pins to one side of
// the viewport while a column of text "steps" scrolls past it; the active step
// is published through context so the pinned graphic can transform in response.
//
// RSC note: the page that uses this is a server component, so it cannot pass a
// `graphic(active)` render function across the boundary. Instead the graphic is
// a (client) element rendered inside the provider, and it reads the active step
// with `useScrollyStep()`. Both `steps` and `graphic` are plain React nodes,
// which are serialisable across the server→client boundary.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const ScrollyContext = createContext(0);

/** Read the active step index from inside a pinned graphic. */
export function useScrollyStep(): number {
  return useContext(ScrollyContext);
}

export function Scrolly({
  steps,
  graphic,
  align = "left",
}: {
  /** One node per narrative beat. The reader scrolls through these. */
  steps: ReactNode[];
  /** The pinned visual. Render a client component that calls useScrollyStep(). */
  graphic: ReactNode;
  /** Which side the sticky graphic sits on (desktop only). */
  align?: "left" | "right";
}) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    // A step becomes active when it crosses a thin band at the vertical centre
    // of the viewport, so the graphic changes as each beat reaches the middle.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActive(Number((e.target as HTMLElement).dataset.index));
          }
        }
      },
      { rootMargin: "-48% 0px -48% 0px", threshold: 0 },
    );
    const els = refs.current.filter(Boolean) as HTMLDivElement[];
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [steps.length]);

  return (
    <ScrollyContext.Provider value={active}>
      {/* Mobile: the graphic pins as a banner at the top of the section. */}
      <div className="sticky top-16 z-20 mb-2 border-b border-[var(--border)] bg-[var(--background)]/95 py-3 backdrop-blur md:hidden">
        <div className="flex h-[36vh] items-center justify-center">{graphic}</div>
      </div>

      {/* Desktop: two columns — a sticky graphic and the scrolling steps. */}
      <div className="md:grid md:grid-cols-2 md:gap-x-14">
        <div className={align === "right" ? "md:order-2" : ""}>
          <div className="sticky top-16 hidden h-[calc(100vh-4rem)] items-center md:flex">
            <div className="w-full">{graphic}</div>
          </div>
        </div>

        <div className={align === "right" ? "md:order-1" : ""}>
          {steps.map((step, i) => (
            <div
              key={i}
              data-index={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className={
                "flex min-h-[68vh] items-center py-10 transition-opacity duration-500 " +
                (active === i ? "opacity-100" : "md:opacity-35")
              }
            >
              <div className="w-full">{step}</div>
            </div>
          ))}
        </div>
      </div>
    </ScrollyContext.Provider>
  );
}

/**
 * The standard pinned visual: any element, with a caption that swaps to match
 * the active step (so even a static visual reads as "responding" to the story).
 * Composed in the server page — `visual` and `captions` are plain nodes.
 */
export function PinnedGraphic({
  visual,
  captions,
}: {
  visual: ReactNode;
  captions?: ReactNode[];
}) {
  const active = useScrollyStep();
  const cap = captions?.length ? captions[Math.min(active, captions.length - 1)] : null;
  return (
    <div className="w-full">
      <div className="mx-auto max-h-[58vh] w-full overflow-hidden">{visual}</div>
      {cap != null && (
        <p
          key={active}
          className="mt-3 text-sm leading-relaxed text-[var(--muted-foreground)] motion-safe:animate-[scrollyFade_0.45s_ease]"
        >
          {cap}
        </p>
      )}
    </div>
  );
}

/** A small step-progress rail, optional, for the side of a scrolly block. */
export function ScrollyProgress({ count }: { count: number }) {
  const active = useScrollyStep();
  return (
    <div className="flex flex-col items-center gap-2" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={
            "h-1.5 w-1.5 rounded-full transition-colors duration-300 " +
            (i === active ? "bg-[#003399]" : "bg-[var(--border)]")
          }
        />
      ))}
    </div>
  );
}
