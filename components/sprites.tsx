import { FRAME, FRAME_H, ROW, type Pose } from "@/lib/sprite-layout";

export function Hero({ who, pose }: { who: "warden" | "wraith"; pose: Pose }) {
  return (
    <span
      className={`hero pose-${pose}`}
      style={{
        backgroundImage: `url(/assets/characters/${who}.png)`,
        backgroundPositionY: `calc(var(--u) * ${-ROW[pose]} * ${FRAME_H} / ${FRAME})`,
      }}
      aria-hidden
    />
  );
}
