export const FRAME = 32;
export const FRAME_H = 48;
export const SCALE = 2;
export const SHEET_COLS = 4;
export const SHEET_ROWS = 10;

export const ROW = {
  idle: 0,
  walkS: 1,
  walkN: 2,
  walkE: 3,
  walkW: 4,
  attack: 5,
  guard: 6,
  hit: 7,
  victory: 8,
  defeat: 9,
} as const;

export type Pose = keyof typeof ROW;

export function poseForUnit(
  team: "a" | "b",
  hp: number,
  winner: number,
  cue: {
    fromA: number;
    toA: number;
    fromB: number;
    toB: number;
    slashA: boolean;
    slashB: boolean;
    hitA: boolean;
    hitB: boolean;
    guardA: boolean;
    guardB: boolean;
  } | null,
): Pose {
  const mine = team === "a" ? 1 : 2;
  if (hp <= 0 || (winner !== 0 && winner !== mine)) return "defeat";
  if (winner === mine) return "victory";
  if (!cue) return "idle";
  const hit = team === "a" ? cue.hitA : cue.hitB;
  const slash = team === "a" ? cue.slashA : cue.slashB;
  const guard = team === "a" ? cue.guardA : cue.guardB;
  const from = team === "a" ? cue.fromA : cue.fromB;
  const to = team === "a" ? cue.toA : cue.toB;
  if (hit) return "hit";
  if (slash) return "attack";
  if (guard && from === to) return "guard";
  if (from !== to) return walkPose(from, to);
  if (guard) return "guard";
  return "idle";
}

export function walkPose(from: number, to: number): Pose {
  const fx = from % 5;
  const fy = Math.floor(from / 5);
  const tx = to % 5;
  const ty = Math.floor(to / 5);
  if (ty < fy) return "walkN";
  if (ty > fy) return "walkS";
  if (tx > fx) return "walkE";
  return "walkW";
}
