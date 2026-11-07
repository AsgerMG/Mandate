"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/#companions", label: "Your team" },
  { href: "/regina/documents", label: "Intelligence" },
  { href: "/about-public-capital", label: "Why Mandate" },
];

export function NavBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);
  const workspace = pathname.startsWith("/workspace");

  return (
    <nav className={`relative z-50 border-b ${workspace ? "border-white/10 bg-[#0d1730] text-white" : "border-[var(--border)] bg-[var(--paper)]"}`}>
      <div className="wrap flex h-[4.5rem] items-center justify-between gap-6">
        <Link href="/" onClick={close} className="flex items-center gap-3">
          <span className={`grid h-8 w-8 place-items-center rounded-full border ${workspace ? "border-[#d5b46a]/45" : "border-[#10203f]/25"}`}>
            <span className="h-2.5 w-2.5 rotate-45 border border-[#b48a42]" />
          </span>
          <span className="font-serif text-xl font-semibold tracking-[-.02em]">Mandate</span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {!workspace && NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              className="text-sm text-[var(--foreground-soft)] transition-colors hover:text-[var(--foreground)]"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={workspace ? "/" : "/workspace"}
            className={`rounded-sm px-5 py-2.5 text-xs font-semibold uppercase tracking-[.08em] transition ${
              workspace
                ? "border border-white/20 text-white hover:border-white/40"
                : "bg-[var(--primary)] text-[var(--paper)] hover:bg-[var(--primary-hover)]"
            }`}
          >
            {workspace ? "Exit preview" : "Open workspace"}
          </Link>
        </div>

        <button
          className={`-mr-3 p-3 transition-colors md:hidden ${workspace ? "text-white/70 hover:text-white" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
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

      {open && (
        <div className={`border-t px-4 pb-3 md:hidden ${workspace ? "border-white/10 bg-[#0d1730]" : "border-[var(--border)] bg-[var(--paper)]"}`}>
          {!workspace && NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              onClick={close}
              className="block border-b border-[var(--border)] py-3 text-sm text-[var(--foreground-soft)]"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={workspace ? "/" : "/workspace"}
            onClick={close}
            className={`mt-3 block rounded-sm px-4 py-3 text-center text-xs font-semibold uppercase tracking-[.08em] ${
              workspace ? "border border-white/20 text-white" : "bg-[var(--primary)] text-[var(--paper)]"
            }`}
          >
            {workspace ? "Exit preview" : "Open workspace"}
          </Link>
        </div>
      )}
    </nav>
  );
}
