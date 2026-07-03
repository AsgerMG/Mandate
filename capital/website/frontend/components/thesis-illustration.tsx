// Conceptual illustration of the common thesis behind public capital: private
// finance shies away from the early, risky stages (the valley of death), so
// public money anchors those first bets and hands off to private capital as
// companies mature. Pure SVG, no data behind it. Dark-themed for the trip.

const BLUE = "#60a5fa"; // public capital, glowing blue
const GREEN = "#4ade80"; // private capital, glowing green
const RED = "#f87171"; // the valley
const AXIS = "rgba(10,10,10,0.16)";
const MUTED = "#6b6b64";
const FAINT = "#64748b";
const SERIF = "var(--font-playfair), Georgia, serif";

export function ThesisIllustration() {
  return (
    <figure className="rounded-2xl border border-black/10 bg-white/70 p-4">
      <figcaption className="mb-1 px-1">
        <p className="text-[10px] uppercase tracking-widest text-[#12264f]">The common thesis</p>
        <p className="text-sm font-semibold text-[#141414]" style={{ fontFamily: SERIF }}>
          Public money bridges the valley of death
        </p>
      </figcaption>

      <svg viewBox="0 0 440 318" className="w-full" role="img"
        aria-label="Stylised chart: public capital is abundant in early company stages where private capital is scarce, the gap in the middle is the valley of death, and private capital takes over as companies scale.">
        <defs>
          <linearGradient id="thesis-pub" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BLUE} stopOpacity="0.35" />
            <stop offset="100%" stopColor={BLUE} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="thesis-priv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity="0.32" />
            <stop offset="100%" stopColor={GREEN} stopOpacity="0.02" />
          </linearGradient>
          <marker id="thesis-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0.5 L7.5,4 L0,7.5 Z" fill={MUTED} />
          </marker>
        </defs>

        {/* plot frame */}
        <line x1="42" y1="26" x2="42" y2="248" stroke={AXIS} strokeWidth="1" />
        <line x1="42" y1="248" x2="424" y2="248" stroke={AXIS} strokeWidth="1" />
        <text x="-150" y="16" transform="rotate(-90)" fontSize="9.5" fill={MUTED} fontFamily={SERIF} textAnchor="middle">
          Capital available
        </text>

        {/* the valley band */}
        <rect x="150" y="26" width="124" height="222" fill={RED} opacity="0.07" />
        <line x1="150" y1="26" x2="150" y2="248" stroke={RED} strokeWidth="0.75" strokeDasharray="3 4" opacity="0.45" />
        <line x1="274" y1="26" x2="274" y2="248" stroke={RED} strokeWidth="0.75" strokeDasharray="3 4" opacity="0.45" />
        <text x="212" y="234" fontSize="10" fontStyle="italic" fill={RED} opacity="0.9" fontFamily={SERIF} textAnchor="middle">
          the valley of death
        </text>

        {/* public capital: high early, fades as companies mature */}
        <path d="M42,66 C150,74 230,160 424,238 L424,248 L42,248 Z" fill="url(#thesis-pub)" />
        <path d="M42,66 C150,74 230,160 424,238" fill="none" stroke={BLUE} strokeWidth="2.25" />

        {/* private capital: scarce early, steep once companies scale */}
        <path d="M42,240 C200,236 290,140 424,48 L424,248 L42,248 Z" fill="url(#thesis-priv)" />
        <path d="M42,240 C200,236 290,140 424,48" fill="none" stroke={GREEN} strokeWidth="2.25" strokeDasharray="7 4" />

        {/* hand-off point, where the curves cross */}
        <circle cx="305" cy="151" r="4.5" fill="#f3f2ed" stroke="#e2e8f0" strokeWidth="1.5" />
        <line x1="305" y1="143" x2="305" y2="98" stroke={MUTED} strokeWidth="0.9" strokeDasharray="2 3" />
        <text x="305" y="88" fontSize="9.5" fill={MUTED} fontFamily={SERIF} textAnchor="middle">
          the hand-off
        </text>

        {/* curve labels */}
        <text x="56" y="52" fontSize="11" fontWeight="700" fill={BLUE} fontFamily={SERIF}>
          Public capital
        </text>
        <text x="58" y="64" fontSize="8.5" fill={MUTED} fontFamily={SERIF}>
          grants · state aid · public equity
        </text>
        <text x="420" y="36" fontSize="11" fontWeight="700" fill={GREEN} fontFamily={SERIF} textAnchor="end">
          Private capital
        </text>
        <text x="420" y="48" fontSize="8.5" fill={MUTED} fontFamily={SERIF} textAnchor="end">
          VC · growth equity · bank debt
        </text>

        {/* the claim: anchor de-risks, private money follows */}
        <path d="M120,168 C170,186 220,190 268,178" fill="none" stroke={MUTED} strokeWidth="1" markerEnd="url(#thesis-arrow)" />
        <text x="124" y="206" fontSize="9.5" fill="#cbd5e1" fontFamily={SERIF}>
          <tspan x="124" dy="0">public anchors de-risk the first bets,</tspan>
          <tspan x="124" dy="12">pulling private money in behind</tspan>
        </text>

        {/* maturity axis */}
        {[
          ["Research", 80],
          ["Prototype", 180],
          ["First product", 285],
          ["Scale", 392],
        ].map(([label, x]) => (
          <g key={label as string}>
            <line x1={x as number} y1="248" x2={x as number} y2="252" stroke={MUTED} strokeWidth="1" />
            <text x={x as number} y="266" fontSize="9.5" fill={MUTED} fontFamily={SERIF} textAnchor="middle">
              {label}
            </text>
          </g>
        ))}
        <text x="233" y="288" fontSize="9" fill={FAINT} fontFamily={SERIF} textAnchor="middle" fontStyle="italic">
          company maturity →
        </text>

        {/* footnote inside the frame */}
        <text x="42" y="310" fontSize="9" fill={FAINT} fontFamily={SERIF}>
          Stylised. The promise this study tests: does the money actually follow this design?
        </text>
      </svg>
    </figure>
  );
}
