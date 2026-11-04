"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The former /for-companies page is now two: the narrative case
// (/about-public-capital) as a plain text link, and the interactive tool
// (/brief) as the CTA pill (Legora pattern). Mobile keeps both as a flat list.
const PRIMARY_LINKS = [
  { href: "/about-public-capital", label: "How to raise" },
];

const MOBILE_LINKS = [
  { href: "/about-public-capital", label: "How to raise" },
  { href: "/brief", label: "Get your brief" },
];

/** The country count arrives as a PROP, not as an import.
 *
 *  It used to be `import { corpusStats } from "@/lib/data"` — legal while that
 *  was a static JSON import, and impossible now that the figures are read from
 *  the corpus census at render time: a "use client" component cannot await, and
 *  `lib/data.ts` reaches `pg` (check_client_boundary.ts is the guard that would
 *  have caught the bundling attempt). The server layout does the one read and
 *  hands the number down, which also keeps the masthead and the footer showing
 *  the same corpus — they are now two consumers of one value rather than two
 *  readers of one file. */
export function NavBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // A link is active when the current path is, or sits beneath, its href.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    // Static, not sticky — the masthead scrolls away, as on the reference.
    // A sticky masthead is what buried the euro rail and the pinned scrolly
    // stages underneath it; letting it scroll removes that whole class of
    // overlap and gives the pinned graphics the full viewport back.
    <nav className="border-b border-[var(--primary)] bg-[var(--paper)]">
      <div className="wrap flex items-center justify-between h-[4.5rem]">
        <Link
          href="/"
          aria-current={isActive("/") ? "page" : undefined}
          className={`font-serif flex items-center gap-2 text-lg font-semibold tracking-tight transition-colors ${
            isActive("/")
              ? "text-[var(--primary)] underline decoration-2 underline-offset-4"
              : "text-[var(--primary)]"
          }`}
          onClick={() => setOpen(false)}
        >
          Wincent
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/eu-flag.svg" alt="EU flag" width={20} height={20} className="rounded-sm" />
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-7 text-base">
          {PRIMARY_LINKS.map((link) => (
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

          {/* The product CTA: outlined, fills on hover — no rounded pill. */}
          <Link
            href="/brief"
            className="rounded-[var(--radius)] border border-[var(--primary)] px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-[var(--paper)]"
          >
            Get your brief
          </Link>
        </div>

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
          {MOBILE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={`block py-3 text-base border-b border-[var(--border)] last:border-0 transition-colors ${
                isActive(link.href)
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
