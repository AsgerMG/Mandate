// The path of a public euro, as a diagram: from national tax revenue it forks
// two ways. One road is pooled at EU level (European funds); the other stays
// national and runs on two stacked rails, state aid and the development banks.
// Both converge into the "public anchor" that de-risks the private capital that
// follows. Pure SVG so it renders on the dark stage with a gold money-trail.

const GOLD = "#12264f";

function Node({
  x,
  y,
  w,
  title,
  sub,
  highlight,
}: {
  x: number;
  y: number;
  w: number;
  title: string;
  sub?: string;
  highlight?: boolean;
}) {
  const h = 54;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        fill={highlight ? "rgba(18,38,79,0.10)" : "rgba(10,10,10,0.05)"}
        stroke={highlight ? GOLD : "rgba(10,10,10,0.2)"}
        strokeWidth={highlight ? 1.5 : 1}
      />
      <text
        x={x + w / 2}
        y={sub ? y + 23 : y + 32}
        textAnchor="middle"
        fill="#1d1c18"
        style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontSize: 14, fontWeight: 700 }}
      >
        {title}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + 40} textAnchor="middle" fill="#6b6b64" style={{ fontSize: 10 }}>
          {sub}
        </text>
      )}
    </g>
  );
}

export function EuroFlow() {
  const cEU = 158; // left road centre
  const cNat = 486; // national road centre
  return (
    <svg viewBox="0 0 640 520" className="w-full" role="img" aria-label="How a public euro flows">
      <defs>
        <linearGradient id="trail" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GOLD} stopOpacity="0.9" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {/* grouping box around the two national rails */}
      <rect x={cNat - 128} y={168} width={256} height={172} rx={14} fill="rgba(18,38,79,0.03)" stroke="rgba(10,10,10,0.12)" />
      <text x={cNat} y={160} textAnchor="middle" fill="#6b6b64" style={{ fontSize: 10, letterSpacing: 2 }}>
        THE NATIONAL ROAD
      </text>

      {/* Money trail */}
      <g fill="none" stroke="url(#trail)" strokeWidth="2">
        {/* treasury to the two roads */}
        <path d={`M320 76 C 320 128, ${cEU} 128, ${cEU} 214`} />
        <path d={`M320 76 C 320 128, ${cNat} 128, ${cNat} 168`} />
        {/* inside the national box: down the spine through both rails */}
        <path d={`M${cNat} 168 L ${cNat} 190`} />
        <path d={`M${cNat} 244 L ${cNat} 266`} />
        {/* roads to the anchor */}
        <path d={`M${cEU} 268 C ${cEU} 330, 320 340, 320 386`} />
        <path d={`M${cNat} 340 C ${cNat} 366, 320 360, 320 386`} />
        {/* anchor to private */}
        <path d="M320 440 L 320 462" />
      </g>
      <g fill={GOLD}>
        <circle cx="320" cy="76" r="4" />
        <circle cx={cEU} cy="214" r="4" />
        <circle cx={cNat} cy="168" r="4" />
        <circle cx="320" cy="386" r="4" />
      </g>

      <Node x={210} y={20} w={220} title="National treasuries" sub="tax revenue from across Europe" highlight />
      <Node x={cEU - 100} y={214} w={200} title="European funds" sub="pooled at EU level" />
      <Node x={cNat - 108} y={190} w={216} title="State aid" sub="grants via the EU register" />
      <Node x={cNat - 108} y={266} w={216} title="Development banks" sub="loans, grants, equity" />
      <Node x={200} y={386} w={240} title="Public anchor" sub="de-risks the first, hardest bets" highlight />
      <Node x={225} y={462} w={190} title="Private capital" sub="follows in behind" />
    </svg>
  );
}
