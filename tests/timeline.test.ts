import assert from "node:assert/strict";
import test from "node:test";
import { ACTION_ATTACK, ACTION_GUARD, F_BLOCK_ON_B, F_HIT_B, PHASE_COMMIT, PHASE_REVEAL } from "../lib/constants";
import { cueBetween, type Snap } from "../lib/cues";
import {
  beatsForCue,
  claimCue,
  placesForBeat,
  poseForBeat,
  showDamage,
  shownHp,
  timelineBeats,
} from "../lib/timeline";

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

test("beats run highlight, orders, move, clash, impact, then complete", () => {
  const beats = timelineBeats(false).map((step) => step.beat);
  assert.deepEqual(beats, ["highlight", "orders", "move", "clash", "impact", "complete"]);
  const times = timelineBeats(false).map((step) => step.ms);
  assert.deepEqual([...times].sort((a, b) => a - b), times);
});

test("a timeout skips movement and invented blows", () => {
  const cue = cueBetween(snap({ phase: PHASE_REVEAL }), snap({ phase: 2, winner: 1, lastFlags: 4096 }));
  assert.ok(cue);
  assert.equal(cue.timeout, true);
  assert.equal(cue.dmgA, 0);
  assert.deepEqual(
    beatsForCue(cue, false).map((step) => step.beat),
    ["highlight", "orders", "complete"],
  );
});

test("fighters stay put until the move beat, then stand on the resolved squares", () => {
  const cue = cueBetween(
    snap({ phase: PHASE_REVEAL, posA: 10, posB: 14 }),
    snap({ phase: PHASE_COMMIT, turn: 2, posA: 11, posB: 13, lastActionA: 0, lastActionB: 0 }),
  );
  assert.ok(cue);
  assert.deepEqual(placesForBeat(cue, "orders"), { a: 10, b: 14 });
  assert.deepEqual(placesForBeat(cue, "move"), { a: 11, b: 13 });
  assert.equal(poseForBeat("a", 3, 0, cue, "move"), "walkE");
  assert.equal(poseForBeat("a", 3, 0, cue, "orders"), "idle");
});

test("a real hit shows the swing, then recoil and the damage number", () => {
  const cue = cueBetween(
    snap({ phase: PHASE_REVEAL, posA: 11, posB: 13 }),
    snap({
      phase: PHASE_COMMIT,
      turn: 2,
      posA: 11,
      posB: 12,
      hpB: 2,
      lastFlags: F_HIT_B,
      lastDamageB: 1,
      lastActionA: ACTION_ATTACK,
      lastActionB: 0,
    }),
  );
  assert.ok(cue);
  assert.equal(cue.hitB, true);
  assert.equal(cue.dmgB, 1);
  assert.equal(poseForBeat("a", 3, 0, cue, "move"), "idle");
  assert.equal(poseForBeat("b", 2, 0, cue, "move"), "walkW");
  assert.equal(poseForBeat("a", 3, 0, cue, "clash"), "attack");
  assert.equal(poseForBeat("b", 2, 0, cue, "clash"), "idle");
  assert.equal(poseForBeat("b", 2, 0, cue, "impact"), "hit");
  assert.equal(showDamage("clash"), false);
  assert.equal(showDamage("impact"), true);
  assert.equal(shownHp(2, 1, "clash"), 3);
  assert.equal(shownHp(2, 1, "impact"), 2);
});

test("a blocked strike stays on the guard pose and deals no damage", () => {
  const cue = cueBetween(
    snap({ phase: PHASE_REVEAL, posA: 11, posB: 12 }),
    snap({
      phase: PHASE_COMMIT,
      turn: 3,
      posA: 11,
      posB: 12,
      lastFlags: F_BLOCK_ON_B,
      lastDamageB: 0,
      lastActionA: ACTION_ATTACK,
      lastActionB: ACTION_GUARD,
    }),
  );
  assert.ok(cue);
  assert.equal(cue.hitB, false);
  assert.equal(cue.blockedB, true);
  assert.equal(poseForBeat("b", 3, 0, cue, "clash"), "guard");
  assert.equal(poseForBeat("a", 3, 0, cue, "clash"), "attack");
  assert.equal(shownHp(3, 0, "impact"), 3);
});

test("the same resolution cue is not played twice", () => {
  const seen = new Set<string>();
  assert.equal(claimCue(seen, "turn-2"), true);
  assert.equal(claimCue(seen, "turn-2"), false);
  assert.equal(claimCue(seen, "turn-3"), true);
});
