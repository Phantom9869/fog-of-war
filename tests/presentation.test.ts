import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAP_H, MAP_W, START_A, START_B, isPillar, xy } from "../lib/constants";
import { poseForUnit, walkPose } from "../lib/sprite-layout";

function pngSize(file: string) {
  const buf = readFileSync(file);
  assert.equal(buf.subarray(1, 4).toString(), "PNG");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const cue = {
  fromA: 10,
  toA: 11,
  fromB: 14,
  toB: 13,
  slashA: false,
  slashB: true,
  hitA: false,
  hitB: false,
  guardA: true,
  guardB: false,
};

test("walk pose follows the square step", () => {
  assert.equal(walkPose(10, 11), "walkE");
  assert.equal(walkPose(11, 10), "walkW");
  assert.equal(walkPose(10, 5), "walkN");
  assert.equal(walkPose(5, 10), "walkS");
});

test("poses follow resolution, not a separate combat result", () => {
  assert.equal(poseForUnit("a", 3, 0, null), "idle");
  assert.equal(poseForUnit("a", 3, 0, { ...cue, fromA: 10, toA: 11, slashA: false, guardA: false }), "walkE");
  assert.equal(poseForUnit("b", 3, 0, cue), "attack");
  assert.equal(poseForUnit("a", 3, 0, { ...cue, fromA: 10, toA: 10 }), "guard");
  assert.equal(poseForUnit("a", 2, 0, { ...cue, hitA: true }), "hit");
  assert.equal(poseForUnit("a", 0, 1, null), "defeat");
  assert.equal(poseForUnit("a", 3, 1, null), "victory");
  assert.equal(poseForUnit("b", 3, 1, null), "defeat");
  assert.equal(poseForUnit("a", 1, 3, null), "defeat");
});

test("the arena is twenty-five squares, five by five", () => {
  assert.equal(MAP_W * MAP_H, 25);
  const cells = Array.from({ length: 25 }, (_, index) => index);
  assert.deepEqual(xy(START_A), { x: 0, y: 2 });
  assert.deepEqual(xy(START_B), { x: 4, y: 2 });
  assert.deepEqual(cells.filter((pos) => isPillar(pos)), [6, 8, 16, 18]);
  for (const pos of cells) {
    const { x, y } = xy(pos);
    assert.equal(y * MAP_W + x, pos);
    assert.ok(x >= 0 && x < MAP_W && y >= 0 && y < MAP_H);
  }
});

test("a floor frame is one tactical cell, not a four-stone block", () => {
  assert.deepEqual(pngSize("public/assets/tiles/floor.png"), { w: 128, h: 32 });
  assert.deepEqual(pngSize("public/assets/environment/sky.png"), { w: 360, h: 200 });
  assert.deepEqual(pngSize("public/assets/environment/layer-stars.png"), { w: 128, h: 64 });
  assert.deepEqual(pngSize("public/assets/environment/layer-castle.png"), { w: 180, h: 100 });
});

test("sprite sheets and tiles keep one pixel density", () => {
  assert.deepEqual(pngSize("public/assets/characters/warden.png"), { w: 128, h: 480 });
  assert.deepEqual(pngSize("public/assets/characters/wraith.png"), { w: 128, h: 480 });
  assert.deepEqual(pngSize("public/assets/environment/platform.png"), { w: 192, h: 192 });
  assert.deepEqual(pngSize("public/assets/tiles/floor.png"), { w: 128, h: 32 });
  assert.deepEqual(pngSize("public/assets/tiles/pillar.png"), { w: 32, h: 32 });
  assert.deepEqual(pngSize("public/assets/tiles/wall.png"), { w: 32, h: 32 });
  assert.deepEqual(pngSize("public/assets/environment/torch.png"), { w: 64, h: 24 });
  assert.deepEqual(pngSize("public/assets/ui/advance.png"), { w: 32, h: 32 });
  assert.deepEqual(pngSize("public/assets/ui/strike.png"), { w: 32, h: 32 });
  assert.deepEqual(pngSize("public/assets/ui/guard.png"), { w: 32, h: 32 });
  assert.deepEqual(pngSize("public/assets/ui/lock.png"), { w: 32, h: 32 });
});
