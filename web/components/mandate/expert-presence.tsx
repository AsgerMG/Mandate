import Image from "next/image";

type ExpertName = "regina" | "wincent";

const EXPERTS = {
  regina: {
    src: "/images/mandate/regina-architectural-figure.png",
    alt: "Regina as a faceless architectural figure of layered mineral planes",
  },
  wincent: {
    src: "/images/mandate/wincent-architectural-figure.png",
    alt: "Wincent as a faceless architectural figure of interwoven metal and glass pathways",
  },
} satisfies Record<ExpertName, { src: string; alt: string }>;

export function ExpertPresence({
  name,
  className = "",
  priority = false,
}: {
  name: ExpertName;
  className?: string;
  priority?: boolean;
}) {
  const expert = EXPERTS[name];

  return (
    <div className={`expert-presence expert-presence--${name} ${className}`} data-expert={name}>
      <Image
        src={expert.src}
        alt={expert.alt}
        fill
        priority={priority}
        sizes="(min-width: 1024px) 34vw, (min-width: 640px) 36vw, 42vw"
        className="expert-presence__image"
      />

      {name === "regina" ? (
        <div className="expert-presence__index" aria-hidden>
          <i /><i /><i /><i />
          <span />
        </div>
      ) : (
        <div className="expert-presence__network" aria-hidden>
          <span className="expert-presence__orbit" />
          <i /><i /><i />
          <b />
        </div>
      )}
    </div>
  );
}
