"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// One masthead for the whole Mandate site. The brand and the bench (one link
// per agent) are always there; the links on the right belong to whichever
// agent the founder is with, so Wincent's pages keep the masthead they had and
// Regina's get the one regina-ai.eu had, inside one component instead of two.
//
// The agent a path belongs to is decided by `agentFor` and nothing else. A new
// agent is a new entry in AGENTS.

type NavLink = { href: string; label: string };
type Agent = {
  name: string;
  /** Where the bench link goes: the agent's own landing page. */
  home: string;
  /** Paths that belong to this agent, by prefix. */
  owns: string[];
  links: NavLink[];
};

const AGENTS: Agent[] = [
  {
    name: "Wincent",
    home: "/wincent",
    owns: ["/wincent", "/about-public-capital"],
    links: [{ href: "/about-public-capital", label: "How to raise" }],
  },
  {
    name: "Regina",
    home: "/regina",
    owns: ["/regina"],
    links: [
      { href: "/regina/documents", label: "Live register" },
      { href: "/regina/about", label: "About" },
    ],
  },
];

const under = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

function agentFor(pathname: string): Agent | null {
  return AGENTS.find((a) => a.owns.some((p) => under(pathname, p))) ?? null;
}

export function NavBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = agentFor(pathname);
  // A link is active when the current path is, or sits beneath, its href. An
  // agent's landing page is exact-match only, or every page of the agent would
  // light it up alongside its own link.
  const isActive = (href: string) =>
    href === "/" || AGENTS.some((a) => a.home === href) ? pathname === href : under(pathname, href);

  const close = () => setOpen(false);
  const mobileLinks: (NavLink & { current?: boolean })[] = [
    ...AGENTS.map((a) => ({ href: a.home, label: a.name, current: a === current })),
    ...(current ? current.links : []),
  ];

  return (
    // Static, not sticky — the masthead scrolls away, as on the reference.
    // A sticky masthead is what buried the euro rail and the pinned scrolly
    // stages underneath it; letting it scroll removes that whole class of
    // overlap and gives the pinned graphics the full viewport back.
    <nav className="border-b border-[var(--primary)] bg-[var(--paper)]">
      <div className="wrap flex items-center justify-between gap-6 h-[4.5rem]">
        <div className="flex items-center gap-6 min-w-0">
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className={`font-serif flex items-center gap-2 text-lg font-semibold tracking-tight text-[var(--primary)] transition-colors ${
              pathname === "/" ? "underline decoration-2 underline-offset-4" : ""
            }`}
            onClick={close}
          >
            Mandate
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/eu-flag.svg" alt="EU flag" width={20} height={20} className="rounded-sm" />
          </Link>

          {/* The bench: one link per agent, the current one marked. */}
          <div className="hidden md:flex items-center gap-5 border-l border-[var(--border)] pl-6 text-base">
            {AGENTS.map((a) => (
              <Link
                key={a.name}
                href={a.home}
                aria-current={isActive(a.home) ? "page" : undefined}
                className={`font-serif transition-colors ${
                  current === a
                    ? "font-semibold text-[var(--primary)] underline decoration-2 underline-offset-4"
                    : "text-[var(--foreground-soft)] hover:text-[var(--foreground)] hover:underline hover:underline-offset-[3px]"
                }`}
              >
                {a.name}
              </Link>
            ))}
          </div>
        </div>

        {/* The current agent's informational links. */}
        {current && (
          <div className="hidden md:flex items-center gap-7 text-base">
            {current.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`transition-colors ${
                  isActive(link.href)
                    ? "font-semibold text-[var(--primary)] underline decoration-2 underline-offset-4"
                    : "text-[var(--foreground-soft)] hover:text-[var(--foreground)] hover:underline hover:underline-offset-[3px]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}

        {/* Mobile hamburger button */}
        <button
          className="md:hidden p-3 -mr-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close navigation" : "Open navigation"}
        >
          {open ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--paper)] px-4 pb-2">
          {mobileLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={close}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={`block py-3 text-base border-b border-[var(--border)] last:border-0 transition-colors ${
                isActive(link.href) || link.current
                  ? "font-semibold text-[var(--primary)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
