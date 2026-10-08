import Image from "next/image";

// Original transparent assets from the approved Figma screens.
const poses = {
  listening: "2646c.png",
  greeting: "06f01.png",
  thinking: "d1568.png",
  presenting: "bd951.png",
  waiting: "e872d.png",
  celebrating: "d8f4a.png",
  confused: "1882c.png",
  stopping: "8b210.png",
  authorizing: "7e86e.png",
  detective: "28375.png",
} as const;

export type VoxiPose = keyof typeof poses;

export function Voxi({
  pose = "greeting",
  className = "",
  priority = false,
}: {
  pose?: VoxiPose;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={`/brand/v2/${poses[pose]}`}
      width={328}
      height={328}
      sizes="(max-width: 767px) 240px, 328px"
      alt=""
      className={`voxi ${className}`}
      data-voxi-pose={pose}
      priority={priority}
      loading={priority ? undefined : "eager"}
    />
  );
}

export function VoxiScene({
  pose,
  className = "",
  large = false,
  background = true,
}: {
  pose: VoxiPose;
  className?: string;
  large?: boolean;
  background?: boolean;
}) {
  return (
    <div
      className={`voxi-scene ${large ? "voxi-scene-large" : ""} ${className}`}
    >
      {background && (
        <Image
          src={`/brand/v2/${large ? "45dfc.svg" : "3ceff.svg"}`}
          width={large ? 316 : 144}
          height={large ? 316 : 144}
          className="voxi-backdrop"
          alt=""
        />
      )}
      <Voxi pose={pose} />
    </div>
  );
}
