import {
  ACTION_ATTACK,
  ACTION_GUARD,
  F_BLOCK_ON_A,
  F_BLOCK_ON_B,
  F_GUARD_A,
  F_GUARD_B,
  F_HIT_A,
  F_HIT_B,
  F_TIMEOUT,
  PHASE_COMMIT,
  PHASE_FINISHED,
  PHASE_REVEAL,
} from "./constants";

export type Snap = {
  posA: number;
  posB: number;
  hpA: number;
  hpB: number;
  phase: number;
  turn: number;
  winner: number;
  lastFlags: number;
  lastDamageA: number;
  lastDamageB: number;
  lastActionA: number;
  lastActionB: number;
};

export type Cue = {
  id: string;
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
  dmgA: number;
  dmgB: number;
  blockedA: boolean;
  blockedB: boolean;
  timeout: boolean;
};

export function snapKey(snap: Snap): string {
  return [
    snap.turn,
    snap.phase,
    snap.posA,
    snap.posB,
    snap.hpA,
    snap.hpB,
    snap.lastFlags,
    snap.winner,
    snap.lastDamageA,
    snap.lastDamageB,
    snap.lastActionA,
    snap.lastActionB,
  ].join(":");
}

export function cueBetween(prev: Snap, next: Snap): Cue | null {
  if (snapKey(prev) === snapKey(next)) return null;
  const timeout =
    (next.lastFlags & F_TIMEOUT) !== 0 &&
    next.phase === PHASE_FINISHED &&
    prev.phase !== PHASE_FINISHED;
  const resolved = prev.phase === PHASE_REVEAL && next.phase !== PHASE_REVEAL;
  if (!resolved && !timeout) return null;
  const id = snapKey(next);
  if (timeout) {
    return {
      id,
      fromA: prev.posA,
      toA: next.posA,
      fromB: prev.posB,
      toB: next.posB,
      slashA: false,
      slashB: false,
      hitA: false,
      hitB: false,
      guardA: false,
      guardB: false,
      dmgA: 0,
      dmgB: 0,
      blockedA: false,
      blockedB: false,
      timeout: true,
    };
  }
  return {
    id,
    fromA: prev.posA,
    toA: next.posA,
    fromB: prev.posB,
    toB: next.posB,
    slashA: next.lastActionA === ACTION_ATTACK,
    slashB: next.lastActionB === ACTION_ATTACK,
    hitA: (next.lastFlags & F_HIT_A) !== 0 && next.lastDamageA > 0,
    hitB: (next.lastFlags & F_HIT_B) !== 0 && next.lastDamageB > 0,
    guardA: next.lastActionA === ACTION_GUARD || (next.lastFlags & F_GUARD_A) !== 0,
    guardB: next.lastActionB === ACTION_GUARD || (next.lastFlags & F_GUARD_B) !== 0,
    dmgA: next.lastDamageA,
    dmgB: next.lastDamageB,
    blockedA: (next.lastFlags & F_BLOCK_ON_A) !== 0,
    blockedB: (next.lastFlags & F_BLOCK_ON_B) !== 0,
    timeout: false,
  };
}

export function phaseLabel(input: {
  phase: number;
  youSealed: boolean;
  rivalSealed: boolean;
  resolving: boolean;
  winner: number;
}): string {
  if (input.resolving && input.winner === 0) return "Resolving";
  if (input.phase === PHASE_FINISHED) return "Match over";
  if (input.phase === PHASE_REVEAL) return "Reveal";
  if (input.phase === PHASE_COMMIT && input.youSealed && !input.rivalSealed) return "Waiting";
  if (input.phase === PHASE_COMMIT) return "Choose";
  return "Round";
}
