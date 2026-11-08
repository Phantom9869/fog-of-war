import type { Cue } from "@/lib/cues";
import { walkPose, type Pose } from "@/lib/sprite-layout";

export const BEAT = ["highlight", "orders", "move", "clash", "impact", "complete"] as const;
export type Beat = (typeof BEAT)[number];

export function timelineBeats(reduced: boolean): { beat: Beat; ms: number }[] {
  if (reduced) {
    return [
      { beat: "orders", ms: 0 },
      { beat: "impact", ms: 40 },
      { beat: "complete", ms: 160 },
    ];
  }
  return [
    { beat: "highlight", ms: 0 },
    { beat: "orders", ms: 400 },
    { beat: "move", ms: 900 },
    { beat: "clash", ms: 1700 },
    { beat: "impact", ms: 2400 },
    { beat: "complete", ms: 3200 },
  ];
}

export function beatsForCue(cue: Pick<Cue, "timeout">, reduced: boolean) {
  const beats = timelineBeats(reduced);
  if (!cue.timeout) return beats;
  return beats.filter((step) => step.beat === "highlight" || step.beat === "orders" || step.beat === "complete");
}

export function claimCue(seen: Set<string>, id: string) {
  if (seen.has(id)) return false;
  seen.add(id);
  return true;
}

export function placesForBeat(cue: Pick<Cue, "fromA" | "toA" | "fromB" | "toB">, beat: Beat) {
  if (beat === "highlight" || beat === "orders") return { a: cue.fromA, b: cue.fromB };
  return { a: cue.toA, b: cue.toB };
}

export function shownHp(hp: number, damage: number, beat: Beat | null) {
  if (!beat || beat === "impact" || beat === "complete") return hp;
  return hp + damage;
}

export function showDamage(beat: Beat | null) {
  return beat === "impact" || beat === "complete";
}

export function poseForBeat(
  team: "a" | "b",
  hp: number,
  winner: number,
  cue: Cue,
  beat: Beat,
): Pose {
  const mine = team === "a" ? 1 : 2;
  if (beat === "complete") {
    if (hp <= 0 || (winner !== 0 && winner !== mine)) return "defeat";
    if (winner === mine) return "victory";
  }
  if (cue.timeout) return "idle";
  const hit = team === "a" ? cue.hitA : cue.hitB;
  const slash = team === "a" ? cue.slashA : cue.slashB;
  const guard = team === "a" ? cue.guardA : cue.guardB;
  const blocked = team === "a" ? cue.blockedA : cue.blockedB;
  const from = team === "a" ? cue.fromA : cue.fromB;
  const to = team === "a" ? cue.toA : cue.toB;
  if (beat === "highlight" || beat === "orders") return "idle";
  if (beat === "move") return from === to ? "idle" : walkPose(from, to);
  if (beat === "clash") {
    if (slash) return "attack";
    if (guard) return "guard";
    return "idle";
  }
  if (hit) return "hit";
  if (blocked || guard) return "guard";
  if (slash) return "attack";
  return "idle";
}
