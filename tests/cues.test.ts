import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTION_ATTACK,
  ACTION_GUARD,
  ACTION_MOVE,
  F_BLOCK_ON_B,
  F_GUARD_B,
  F_HIT_B,
  F_TIMEOUT,
  PHASE_COMMIT,
  PHASE_FINISHED,
  PHASE_REVEAL,
} from "../lib/constants";
import { cueBetween, phaseLabel, type Snap } from "../lib/cues";

function snap(partial: Partial<Snap> = {}): Snap {
  return {
    posA: 10,
    posB: 14,
    hpA: 3,
    hpB: 3,
    phase: PHASE_COMMIT,
    turn: 1,
    winner: 0,
    lastFlags: 0,
    lastDamageA: 0,
    lastDamageB: 0,
    lastActionA: 255,
    lastActionB: 255,
    ...partial,
  };
}

test("sealing does not invent a strike or a move", () => {
  const cue = cueBetween(snap(), snap({ phase: PHASE_REVEAL }));
  assert.equal(cue, null);
});

test("a real advance travels and deals no damage", () => {
  const cue = cueBetween(
    snap({ phase: PHASE_REVEAL, posA: 10, posB: 14 }),
    snap({
      phase: PHASE_COMMIT,
      turn: 2,
      posA: 11,
      posB: 13,
      lastActionA: ACTION_MOVE,
      lastActionB: ACTION_MOVE,
    }),
  );
  assert.ok(cue);
  assert.equal(cue.fromA, 10);
  assert.equal(cue.toA, 11);
  assert.equal(cue.toB, 13);
  assert.equal(cue.dmgA, 0);
  assert.equal(cue.dmgB, 0);
  assert.equal(cue.slashA, false);
  assert.equal(cue.hitB, false);
});

test("a connecting strike shows the slash and only the real damage", () => {
  const cue = cueBetween(
    snap({ phase: PHASE_REVEAL, posA: 12, posB: 13, hpB: 3 }),
    snap({
      phase: PHASE_COMMIT,
      turn: 4,
      posA: 12,
      posB: 13,
      hpB: 2,
      lastActionA: ACTION_ATTACK,
      lastActionB: ACTION_GUARD,
      lastDamageB: 1,
      lastFlags: F_HIT_B,
    }),
  );
  assert.ok(cue);
  assert.equal(cue.slashA, true);
  assert.equal(cue.hitB, true);
  assert.equal(cue.dmgB, 1);
  assert.equal(cue.dmgA, 0);
  assert.equal(cue.fromA, cue.toA);
});

test("a guarded strike raises a shield and no damage number", () => {
  const cue = cueBetween(
    snap({ phase: PHASE_REVEAL, posA: 12, posB: 13 }),
    snap({
      phase: PHASE_COMMIT,
      turn: 4,
      posA: 12,
      posB: 13,
      lastActionA: ACTION_ATTACK,
      lastActionB: ACTION_GUARD,
      lastFlags: F_GUARD_B | F_BLOCK_ON_B,
    }),
  );
  assert.ok(cue);
  assert.equal(cue.slashA, true);
  assert.equal(cue.guardB, true);
  assert.equal(cue.blockedB, true);
  assert.equal(cue.dmgB, 0);
  assert.equal(cue.hitB, false);
});

test("timeout forfeit does not invent combat", () => {
  const cue = cueBetween(
    snap({ phase: PHASE_COMMIT }),
    snap({ phase: PHASE_FINISHED, winner: 2, lastFlags: F_TIMEOUT }),
  );
  assert.ok(cue);
  assert.equal(cue.timeout, true);
  assert.equal(cue.slashA, false);
  assert.equal(cue.dmgA, 0);
  assert.equal(cue.dmgB, 0);
});

test("the same snapshot twice does not replay", () => {
  const current = snap({ phase: PHASE_COMMIT, turn: 2, posA: 11 });
  assert.equal(cueBetween(current, current), null);
});

test("phase labels follow the live phase", () => {
  assert.equal(phaseLabel({ phase: PHASE_COMMIT, youSealed: false, rivalSealed: true, resolving: false, winner: 0 }), "Choose");
  assert.equal(phaseLabel({ phase: PHASE_COMMIT, youSealed: true, rivalSealed: false, resolving: false, winner: 0 }), "Waiting");
  assert.equal(phaseLabel({ phase: PHASE_REVEAL, youSealed: true, rivalSealed: true, resolving: false, winner: 0 }), "Reveal");
  assert.equal(phaseLabel({ phase: PHASE_COMMIT, youSealed: false, rivalSealed: true, resolving: true, winner: 0 }), "Resolving");
  assert.equal(phaseLabel({ phase: PHASE_FINISHED, youSealed: true, rivalSealed: true, resolving: false, winner: 1 }), "Match over");
});
