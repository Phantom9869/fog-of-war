import {
  ACTION_NAME,
  ACTION_UNSET,
  DIR_NAME,
  DIR_NONE,
  F_BLOCK_ON_A,
  F_BLOCK_ON_B,
  F_COLLISION,
  F_CROSSING,
  F_HIT_A,
  F_HIT_B,
  F_SUDDEN,
  F_TIMEOUT,
  F_WHIFF_A,
  F_WHIFF_B,
  WIN_A,
  WIN_B,
  WIN_DRAW,
} from "./constants";

export type LogLine = { turn: number; text: string; tone: "info" | "hit" | "good" | "bad" | "end" };

function order(kind: number, dir: number, who: string): string {
  if (kind === ACTION_UNSET || kind === 255) return `${who} never opened a seal`;
  if (kind === 2) return `${who} guards`;
  const way = dir >= 0 && dir < 4 ? DIR_NAME[dir] : "somewhere";
  const base = ACTION_NAME[kind] ?? "act";
  const verb = who === "You" ? base : `${base}s`;
  return `${who} ${verb}${kind === 2 || dir === DIR_NONE ? "" : " " + way}`;
}

export function describeResolution(input: {
  turn: number;
  youAreA: boolean | null;
  actionA: number;
  dirA: number;
  actionB: number;
  dirB: number;
  flags: number;
  damageA: number;
  damageB: number;
  winner: number;
  timeout?: boolean;
}): LogLine {
  const name = (seatA: boolean) => {
    if (input.youAreA === null) return seatA ? "West" : "East";
    return seatA === input.youAreA ? "You" : "Rival";
  };
  if (input.flags & F_TIMEOUT || input.timeout) {
    const why =
      input.winner === WIN_DRAW
        ? "neither seal arrived"
        : input.winner === WIN_A
          ? `${name(false)} stalled`
          : `${name(true)} stalled`;
    return {
      turn: input.turn,
      tone: "end",
      text: `Turn ${input.turn}. The clock closed the round — ${why}.`,
    };
  }
  const bits: string[] = [
    `Turn ${input.turn}. ${sentence(order(input.actionA, input.dirA, name(true)))} ${sentence(order(input.actionB, input.dirB, name(false)))}`,
  ];
  if (input.flags & F_COLLISION) bits.push("Both claim the same square and hold.");
  if (input.flags & F_CROSSING) bits.push("They try to pass through each other and both hold.");
  if (input.flags & F_WHIFF_A) bits.push(`${name(true)}'s strike finds fog.`);
  if (input.flags & F_WHIFF_B) bits.push(`${name(false)}'s strike finds fog.`);
  if (input.flags & F_BLOCK_ON_A) bits.push(`${name(true)} parries.`);
  if (input.flags & F_BLOCK_ON_B) bits.push(`${name(false)} parries.`);
  if (input.flags & F_HIT_A) bits.push(`${name(true)} ${name(true) === "You" ? "take" : "takes"} ${input.damageA}.`);
  if (input.flags & F_HIT_B) bits.push(`${name(false)} ${name(false) === "You" ? "take" : "takes"} ${input.damageB}.`);
  if (input.flags & F_SUDDEN) bits.push("The turn cap breaks the stalemate by health.");
  let tone: LogLine["tone"] = "info";
  if (input.winner !== 0) tone = "end";
  else if (input.damageA || input.damageB) tone = "hit";
  return { turn: input.turn, tone, text: bits.join(" ") };
}

function sentence(s: string): string {
  return s.endsWith(".") ? s : s + ".";
}

export function winnerLine(winner: number, youAreA: boolean | null): string {
  if (winner === WIN_DRAW) return "Draw. The arena keeps both seals.";
  if (winner === WIN_A) return youAreA === false ? "East takes the arena." : youAreA === true ? "You take the arena." : "West takes the arena.";
  if (winner === WIN_B) return youAreA === true ? "Rival takes the arena." : youAreA === false ? "You take the arena." : "East takes the arena.";
  return "";
}
