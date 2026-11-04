import type { ReactNode } from "react";

export function EuroJourney({ children }: { children: ReactNode }) {
  return <div className="relative">{children}</div>;
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
    <section id={id} className={"relative " + className}>
      <div className="wrap">{children}</div>
    </section>
  );
}
