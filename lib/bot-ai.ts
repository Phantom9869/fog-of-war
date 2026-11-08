import { ACTION_ATTACK, ACTION_GUARD, ACTION_MOVE, DIR_NONE, isPillar } from "./constants";
import { step } from "./rules";

/**
 * Deterministic rival. It reads only public positions and health.
 * It is not a language model.
 */
export function chooseBotAction(
  pos: number,
  opp: number,
  myHp: number,
  oppHp: number,
): { kind: number; dir: number } {
  const adjacent = directionBetween(pos, opp);
  if (adjacent !== null) {
    if (myHp === 1 && oppHp > 1) return { kind: ACTION_GUARD, dir: DIR_NONE };
    return { kind: ACTION_ATTACK, dir: adjacent };
  }
  const x = pos % 5;
  const y = Math.floor(pos / 5);
  const ox = opp % 5;
  const oy = Math.floor(opp / 5);
  const dx = ox - x;
  const dy = oy - y;
  let first: number;
  let second: number;
  if (Math.abs(dx) > Math.abs(dy)) {
    first = dx > 0 ? 1 : 3;
    second = dy > 0 ? 2 : dy < 0 ? 0 : first;
  } else if (Math.abs(dy) > Math.abs(dx)) {
    first = dy > 0 ? 2 : 0;
    second = dx > 0 ? 1 : dx < 0 ? 3 : first;
  } else {
    first = dx > 0 ? 1 : 3;
    second = dy > 0 ? 2 : 0;
  }
  for (const dir of [first, second, 1, 3, 2, 0]) {
    const dest = step(pos, dir);
    if (dest !== null && !isPillar(dest) && dest !== opp) return { kind: ACTION_MOVE, dir };
  }
  return { kind: ACTION_GUARD, dir: DIR_NONE };
}

function directionBetween(from: number, to: number): number | null {
  for (const dir of [0, 1, 2, 3]) {
    if (step(from, dir) === to) return dir;
  }
  return null;
}
