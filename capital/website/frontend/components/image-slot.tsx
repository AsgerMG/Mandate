// A reserved slot for artwork we have not commissioned yet.
//
// The site previously shipped two stock photographs (the Berlaymont and the
// Strasbourg hemicycle) in soft, rounded, drop-shadowed frames. Both the
// imagery and the framing sat outside the reference system, so the photos are
// gone and this stands in their place: the reference's own image treatment —
// a flat 1px rule, 2px radius, no shadow — over a cream fill, at the 3:2 ratio
// the reference hero art uses.
//
// It reads as a deliberate block rather than a broken image, and dropping real
// artwork in later means replacing this element, not redesigning the frame.

export function ImageSlot({
  label,
  className = "",
}: {
  /** What belongs here, in a few words. Rendered as the slot's caption. */
  label: string;
  className?: string;
}) {
  return (
    <div
      className={
        "flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 " +
        "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] px-6 text-center " +
        className
      }
      role="img"
      aria-label={`Placeholder: ${label}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
        [ Image ]
      </span>
      <span className="max-w-[22rem] font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-[var(--muted-foreground)]">
        {label}
      </span>
    </div>
  );
}
