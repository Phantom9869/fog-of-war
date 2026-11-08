import {
  ACTION_GUARD,
  DIR_NONE,
  MAX_TURNS,
  PHASE_COMMIT,
  PHASE_FINISHED,
  PHASE_REVEAL,
  PRACTICE_WINDOW_SEC,
  START_A,
  START_B,
  START_HP,
  WIN_A,
  WIN_B,
  WIN_DRAW,
  WIN_NONE,
} from "./constants";
import { chooseBotAction } from "./bot-ai";
import { describeResolution, type LogLine } from "./describe";
import { commitment, randomSalt, toHex } from "./hash";
import { resolve, validateAction, type Action } from "./rules";

export type BotSeal = {
  commitment: Uint8Array;
  open: () => Action & { salt: Uint8Array };
};

export type LocalMatch = {
  posA: number;
  posB: number;
  hpA: number;
  hpB: number;
  turn: number;
  phase: number;
  winner: number;
  deadline: number;
  windowMs: number;
  commitA: string | null;
  commitB: string | null;
  revealedA: boolean;
  revealedB: boolean;
  human: (Action & { salt: Uint8Array }) | null;
  bot: BotSeal | null;
  lastFlags: number;
  lastDamageA: number;
  lastDamageB: number;
  lastActionA: number;
  lastDirA: number;
  lastActionB: number;
  lastDirB: number;
  log: LogLine[];
};

const PRACTICE_MATCH = new Uint8Array(32).fill(1);

function sealBot(posB: number, posA: number, hpB: number, hpA: number, turn: number): BotSeal {
  const choice = chooseBotAction(posB, posA, hpB, hpA);
  const salt = randomSalt();
  const hash = commitment({
    matchId: PRACTICE_MATCH,
    turn,
    player: 1,
    action: choice.kind,
    dir: choice.dir,
    salt,
  });
  return {
    commitment: hash,
    open: () => ({ kind: choice.kind, dir: choice.dir, salt }),
  };
}

export function createPractice(now = Date.now()): LocalMatch {
  const bot = sealBot(START_B, START_A, START_HP, START_HP, 1);
  return {
    posA: START_A,
    posB: START_B,
    hpA: START_HP,
    hpB: START_HP,
    turn: 1,
    phase: PHASE_COMMIT,
    winner: WIN_NONE,
    deadline: now + PRACTICE_WINDOW_SEC * 1000,
    windowMs: PRACTICE_WINDOW_SEC * 1000,
    commitA: null,
    commitB: toHex(bot.commitment),
    revealedA: false,
    revealedB: false,
    human: null,
    bot,
    lastFlags: 0,
    lastDamageA: 0,
    lastDamageB: 0,
    lastActionA: 255,
    lastDirA: 255,
    lastActionB: 255,
    lastDirB: 255,
    log: [
      {
        turn: 0,
        tone: "info",
        text: "Practice lane. The rival sealed from the public board before you chose. This seal is only a sequencing lock in your browser.",
      },
    ],
  };
}

export function sealHuman(match: LocalMatch, action: Action, now = Date.now()): LocalMatch {
  if (match.phase !== PHASE_COMMIT) throw new Error("Orders are not being sealed right now.");
  if (now >= match.deadline) throw new Error("The practice clock already closed this seal.");
  if (match.commitA) throw new Error("You already sealed this turn.");
  validateAction(match.posA, action);
  const salt = randomSalt();
  const hash = commitment({
    matchId: PRACTICE_MATCH,
    turn: match.turn,
    player: 0,
    action: action.kind,
    dir: action.dir,
    salt,
  });
  return {
    ...match,
    commitA: toHex(hash),
    human: { ...action, salt },
    phase: PHASE_REVEAL,
    deadline: now + match.windowMs,
  };
}

export function revealPractice(match: LocalMatch, now = Date.now()): LocalMatch {
  if (match.phase !== PHASE_REVEAL || !match.human || !match.bot) {
    throw new Error("Nothing is waiting to be opened.");
  }
  if (now >= match.deadline) throw new Error("The practice clock already closed the reveal.");
  const bot = match.bot.open();
  const humanHash = commitment({
    matchId: PRACTICE_MATCH,
    turn: match.turn,
    player: 0,
    action: match.human.kind,
    dir: match.human.dir,
    salt: match.human.salt,
  });
  const botHash = commitment({
    matchId: PRACTICE_MATCH,
    turn: match.turn,
    player: 1,
    action: bot.kind,
    dir: bot.dir,
    salt: bot.salt,
  });
  if (toHex(humanHash) !== match.commitA || toHex(botHash) !== match.commitB) {
    throw new Error("A seal does not match its preimage.");
  }
  const out = resolve(
    { pos: match.posA, hp: match.hpA },
    { pos: match.posB, hp: match.hpB },
    match.human,
    bot,
    match.turn,
    MAX_TURNS,
  );
  const line = describeResolution({
    turn: match.turn,
    youAreA: true,
    actionA: match.human.kind,
    dirA: match.human.dir,
    actionB: bot.kind,
    dirB: bot.dir,
    flags: out.flags,
    damageA: out.damageA,
    damageB: out.damageB,
    winner: out.winner,
  });
  const finished = out.winner !== WIN_NONE;
  const nextBot = finished ? null : sealBot(out.posB, out.posA, out.hpB, out.hpA, match.turn + 1);
  return {
    ...match,
    posA: out.posA,
    posB: out.posB,
    hpA: out.hpA,
    hpB: out.hpB,
    revealedA: true,
    revealedB: true,
    lastFlags: out.flags,
    lastDamageA: out.damageA,
    lastDamageB: out.damageB,
    lastActionA: match.human.kind,
    lastDirA: match.human.dir,
    lastActionB: bot.kind,
    lastDirB: bot.dir,
    winner: out.winner,
    phase: finished ? PHASE_FINISHED : PHASE_COMMIT,
    turn: finished ? match.turn : match.turn + 1,
    commitA: null,
    commitB: nextBot ? toHex(nextBot.commitment) : match.commitB,
    human: null,
    bot: nextBot,
    deadline: finished ? match.deadline : now + match.windowMs,
    log: [...match.log, line],
  };
}

export function timeoutPractice(match: LocalMatch, now = Date.now()): LocalMatch {
  if (match.phase === PHASE_FINISHED) throw new Error("The match is already over.");
  if (now < match.deadline) throw new Error("The practice clock is still running.");
  let winner = WIN_DRAW;
  if (match.phase === PHASE_COMMIT) {
    if (match.commitA && !match.commitB) winner = WIN_A;
    else if (!match.commitA && match.commitB) winner = WIN_B;
  } else if (match.revealedA && !match.revealedB) winner = WIN_A;
  else if (!match.revealedA && match.revealedB) winner = WIN_B;
  const line = describeResolution({
    turn: match.turn,
    youAreA: true,
    actionA: match.human?.kind ?? 255,
    dirA: match.human?.dir ?? 255,
    actionB: 255,
    dirB: 255,
    flags: 1 << 12,
    damageA: 0,
    damageB: 0,
    winner,
    timeout: true,
  });
  return { ...match, winner, phase: PHASE_FINISHED, log: [...match.log, line] };
}

export const GUARD: Action = { kind: ACTION_GUARD, dir: DIR_NONE };
