// A live progress ring drawn into the browser tab's favicon.
//
// The ambient layer of the status model: if the user has to keep the page open
// and watch the rail to feel safe, the ambient layer has failed. A brief takes
// ~3 minutes (median 184s, measured), so the tab itself has to carry enough
// signal — the title says how long is left, and this says how far along.
//
// Deliberately the same visual language as the rail icons rather than a generic
// spinner: 1.5px-equivalent stroke, accent colour, round caps, no fill. At 32px
// that reads as the same family of hand-drawn line art, just smaller.
//
// See project-management/brief-ux-plan.md Phase C1.

const SIZE = 64; // drawn at 2x and downscaled by the browser, so it stays crisp
const ACCENT = "#a6752e"; // --accent
const TRACK = "#e2dbc4"; // --line

let originalHref: string | null = null;

function iconLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  if (originalHref === null) originalHref = link.getAttribute("href") ?? "";
  return link;
}

/**
 * Draw the ring at `progress` (0-1), or an indeterminate arc when null.
 *
 * `null` matters as much as a number here: during retrieval nothing predicts a
 * run's size (measured), so a determinate ring would be presenting a guess with
 * the authority of a measurement. The indeterminate form is a short arc at a
 * rotating offset, which reads as motion rather than as completeness.
 */
export function drawFaviconProgress(progress: number | null, tick = 0): void {
  const link = iconLink();
  if (!link) return;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const centre = SIZE / 2;
  const radius = SIZE * 0.36;
  const lineWidth = SIZE * 0.09;

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.lineCap = "round";
  ctx.lineWidth = lineWidth;

  // Full faint track, so the ring reads as a dial rather than as a stray mark.
  ctx.strokeStyle = TRACK;
  ctx.beginPath();
  ctx.arc(centre, centre, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = ACCENT;
  ctx.beginPath();
  if (progress === null) {
    const start = (tick % 60) * (Math.PI / 30);
    ctx.arc(centre, centre, radius, start, start + Math.PI * 0.5);
  } else {
    const top = -Math.PI / 2;
    ctx.arc(centre, centre, radius, top, top + Math.PI * 2 * Math.min(1, Math.max(0, progress)));
  }
  ctx.stroke();

  link.href = canvas.toDataURL("image/png");
}

/** A closed ring that holds — the "your work is done" signal that survives a
 *  tab switch. Not cleared automatically: it is the whole point that it is still
 *  there when the user comes back. */
export function drawFaviconDone(): void {
  drawFaviconProgress(1);
}

export function restoreFavicon(): void {
  if (typeof document === "undefined" || originalHref === null) return;
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) return;
  // If the page had no icon link of its own, we created it — remove it rather
  // than leaving href="", which renders as a visibly broken icon (observed
  // 2026-07-30 as a 0-byte favicon after a failed run).
  if (originalHref === "") link.remove();
  else link.href = originalHref;
}
