import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chooseBotAction } from "../lib/bot-ai";
import { ACTION_MOVE, DIR_E, START_A, START_B, START_HP } from "../lib/constants";
import { fromHex, commitment, toHex } from "../lib/hash";
import { createPractice, revealPractice, sealHuman } from "../lib/local-match";
import { resolve } from "../lib/rules";

type Vector = {
  name: string;
  pos_a: number;
  hp_a: number;
  pos_b: number;
  hp_b: number;
  kind_a: number;
  dir_a: number;
  kind_b: number;
  dir_b: number;
  turn: number;
  pos_a_out: number;
  pos_b_out: number;
  hp_a_out: number;
  hp_b_out: number;
  damage_a: number;
  damage_b: number;
  flags: number;
  winner: number;
};

test("typescript rules match the shared vectors", () => {
  const cases = JSON.parse(readFileSync("fixtures/vectors.json", "utf8")) as Vector[];
  assert.ok(cases.length >= 8);
  for (const item of cases) {
    const got = resolve(
      { pos: item.pos_a, hp: item.hp_a },
      { pos: item.pos_b, hp: item.hp_b },
      { kind: item.kind_a, dir: item.dir_a },
      { kind: item.kind_b, dir: item.dir_b },
      item.turn,
      8,
    );
    assert.equal(got.posA, item.pos_a_out, item.name);
    assert.equal(got.posB, item.pos_b_out, item.name);
    assert.equal(got.hpA, item.hp_a_out, item.name);
    assert.equal(got.hpB, item.hp_b_out, item.name);
    assert.equal(got.damageA, item.damage_a, item.name);
    assert.equal(got.damageB, item.damage_b, item.name);
    assert.equal(got.flags, item.flags, item.name);
    assert.equal(got.winner, item.winner, item.name);
  }
});

test("commitment hash matches the rust fixture", () => {
  const fixture = JSON.parse(readFileSync("fixtures/hash.json", "utf8")) as {
    match: string;
    turn: number;
    player: number;
    action: number;
    dir: number;
    salt: string;
    hash: string;
  };
  const hash = commitment({
    matchId: fromHex(fixture.match),
    turn: fixture.turn,
    player: fixture.player,
    action: fixture.action,
    dir: fixture.dir,
    salt: fromHex(fixture.salt),
  });
  assert.equal(toHex(hash), fixture.hash);
});

test("bot policy is stable and ignores nothing but the board", () => {
  const first = chooseBotAction(START_B, START_A, START_HP, START_HP);
  const second = chooseBotAction(START_B, START_A, START_HP, START_HP);
  assert.deepEqual(first, second);
  assert.equal(first.kind, ACTION_MOVE);
  assert.equal(first.dir, 3);
});

test("practice rival is sealed before the human chooses and matches the public policy", () => {
  const opened = createPractice(1_000);
  const expected = chooseBotAction(opened.posB, opened.posA, opened.hpB, opened.hpA);
  assert.ok(opened.commitB);
  assert.equal(opened.commitA, null);
  const sealed = sealHuman(opened, { kind: ACTION_MOVE, dir: DIR_E }, 1_100);
  const revealed = revealPractice(sealed, 1_200);
  assert.equal(revealed.lastActionB, expected.kind);
  assert.equal(revealed.lastDirB, expected.dir);
  assert.equal(revealed.posA, 11);
  assert.equal(revealed.posB, 13);
});
