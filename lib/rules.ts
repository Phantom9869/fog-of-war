import {
  ACTION_ATTACK,
  ACTION_GUARD,
  ACTION_MOVE,
  DIR_NONE,
  DIR_W,
  F_BLOCK_ON_A,
  F_BLOCK_ON_B,
  F_COLLISION,
  F_CROSSING,
  F_GUARD_A,
  F_GUARD_B,
  F_HIT_A,
  F_HIT_B,
  F_SUDDEN,
  F_WHIFF_A,
  F_WHIFF_B,
  MAP_H,
  MAP_W,
  WIN_A,
  WIN_B,
  WIN_DRAW,
  WIN_NONE,
  isPillar,
} from "./constants";

export type Action = { kind: number; dir: number };
export type Fighter = { pos: number; hp: number };
export type Resolution = {
  posA: number;
  posB: number;
  hpA: number;
  hpB: number;
  damageA: number;
  damageB: number;
  flags: number;
  winner: number;
};

export function step(pos: number, dir: number): number | null {
  if (pos < 0 || pos >= MAP_W * MAP_H) return null;
  const x = pos % MAP_W;
  const y = Math.floor(pos / MAP_W);
  let nx = x;
  let ny = y;
  if (dir === 0) ny = y - 1;
  else if (dir === 1) nx = x + 1;
  else if (dir === 2) ny = y + 1;
  else if (dir === 3) nx = x - 1;
  else return null;
  if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return null;
  return ny * MAP_W + nx;
}

export class RuleError extends Error {
  constructor(readonly code: "IllegalMove" | "BadAction") {
    super(code);
  }
}

export function validateAction(pos: number, action: Action): void {
  if (action.kind === ACTION_MOVE) {
    if (action.dir > DIR_W) throw new RuleError("BadAction");
    const dest = step(pos, action.dir);
    if (dest === null || isPillar(dest)) throw new RuleError("IllegalMove");
    return;
  }
  if (action.kind === ACTION_ATTACK) {
    if (action.dir > DIR_W) throw new RuleError("BadAction");
    if (step(pos, action.dir) === null) throw new RuleError("IllegalMove");
    return;
  }
  if (action.kind === ACTION_GUARD) {
    if (action.dir !== DIR_NONE) throw new RuleError("BadAction");
    return;
  }
  throw new RuleError("BadAction");
}

function destination(pos: number, action: Action): number {
  validateAction(pos, action);
  if (action.kind === ACTION_MOVE) {
    const dest = step(pos, action.dir);
    if (dest === null) throw new RuleError("IllegalMove");
    return dest;
  }
  return pos;
}

export function resolve(
  a: Fighter,
  b: Fighter,
  actionA: Action,
  actionB: Action,
  turn: number,
  maxTurns: number,
): Resolution {
  const destA = destination(a.pos, actionA);
  const destB = destination(b.pos, actionB);
  let flags = 0;
  let posA = destA;
  let posB = destB;
  if (destA === destB) {
    flags |= F_COLLISION;
    posA = a.pos;
    posB = b.pos;
  } else if (destA === b.pos && destB === a.pos && destA !== a.pos && destB !== b.pos) {
    flags |= F_CROSSING;
    posA = a.pos;
    posB = b.pos;
  }
  if (actionA.kind === ACTION_GUARD) flags |= F_GUARD_A;
  if (actionB.kind === ACTION_GUARD) flags |= F_GUARD_B;

  let damageA = 0;
  let damageB = 0;
  const strike = (
    from: number,
    action: Action,
    defenderPos: number,
    defender: Action,
    whiff: number,
    hit: number,
    blocked: number,
    guardFlag: number,
  ) => {
    if (action.kind !== ACTION_ATTACK) return 0;
    const target = step(from, action.dir);
    if (target === null) {
      flags |= whiff;
      return 0;
    }
    if (target === defenderPos) {
      if (defender.kind === ACTION_GUARD) {
        flags |= blocked | guardFlag;
        return 0;
      }
      flags |= hit;
      return 1;
    }
    flags |= whiff;
    return 0;
  };
  damageB = strike(posA, actionA, posB, actionB, F_WHIFF_A, F_HIT_B, F_BLOCK_ON_B, F_GUARD_B);
  damageA = strike(posB, actionB, posA, actionA, F_WHIFF_B, F_HIT_A, F_BLOCK_ON_A, F_GUARD_A);

  const hpA = Math.max(0, a.hp - damageA);
  const hpB = Math.max(0, b.hp - damageB);
  let winner = WIN_NONE;
  if (hpA === 0 && hpB === 0) winner = WIN_DRAW;
  else if (hpA === 0) winner = WIN_B;
  else if (hpB === 0) winner = WIN_A;
  else if (turn >= maxTurns) {
    flags |= F_SUDDEN;
    winner = hpA > hpB ? WIN_A : hpB > hpA ? WIN_B : WIN_DRAW;
  }
  return { posA, posB, hpA, hpB, damageA, damageB, flags, winner };
}
