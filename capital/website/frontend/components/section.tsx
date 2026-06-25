import { ReactNode } from "react";

interface SectionProps {
  title: string;
  caption?: string;
  children: ReactNode;
  className?: string;
}

export function Section({ title, caption, children, className = "" }: SectionProps) {
  return (
    <section className={`mt-12 ${className}`}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
        {caption && <p className="text-sm text-[var(--muted-foreground)] mt-1">{caption}</p>}
      </div>
      {children}
    </section>
  );
}
