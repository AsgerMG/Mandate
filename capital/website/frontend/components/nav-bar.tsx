"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Primary links sit directly in the header. Everything else is folded into the
// "More" menu so the bar reads as a product (for companies + lookup) first.
const PRIMARY_LINKS = [
  { href: "/for-companies", label: "For companies" },
  { href: "/companies", label: "Company lookup" },
];

const MORE_LINKS = [
  { href: "/methodology", label: "Methodology" },
  { href: "/limitations", label: "Limitations" },
];

export function NavBar() {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  // A link is active when the current path is, or sits beneath, its href.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 flex items-center justify-between h-16">
        <Link
          href="/"
          aria-current={isActive("/") ? "page" : undefined}
          className={`flex items-center gap-2 font-semibold text-lg tracking-tight transition-colors ${
            isActive("/")
              ? "text-[var(--primary)] underline decoration-2 underline-offset-4"
              : "text-[var(--primary)]"
          }`}
          onClick={() => {
            setOpen(false);
            setMoreOpen(false);
          }}
        >
          EuroInvTracker
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
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {link.label}
            </Link>
          ))}

          {/* More dropdown */}
          <div
            className="relative"
            onMouseEnter={() => setMoreOpen(true)}
            onMouseLeave={() => setMoreOpen(false)}
          >
            <button
              className="flex items-center gap-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-haspopup="true"
            >
              More
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full pt-2">
                <div className="min-w-40 rounded-lg border border-[var(--border)] bg-[var(--background)] py-1 shadow-lg">
                  {MORE_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMoreOpen(false)}
                      className="block px-4 py-2 text-base text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
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
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--background)] px-4 pb-2">
          {[...PRIMARY_LINKS, ...MORE_LINKS].map((link) => (
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
