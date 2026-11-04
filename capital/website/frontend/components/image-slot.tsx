import Image from "next/image";

export function ImageSlot({
  src,
  alt,
  className = "",
  imageClassName = "",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}) {
  return (
    <figure
      className={
        "relative aspect-[3/2] w-full overflow-hidden bg-transparent " +
        className
      }
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(min-width: 1280px) 40rem, (min-width: 1024px) 46vw, calc(100vw - 2rem)"
        className={`object-contain ${imageClassName}`}
      />
    </figure>
  );
}
