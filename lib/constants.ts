export const MAP_W = 5;
export const MAP_H = 5;
export const DIR_N = 0;
export const DIR_E = 1;
export const DIR_S = 2;
export const DIR_W = 3;
export const DIR_NONE = 4;

export const ACTION_MOVE = 0;
export const ACTION_ATTACK = 1;
export const ACTION_GUARD = 2;
export const ACTION_UNSET = 255;

export const WIN_NONE = 0;
export const WIN_A = 1;
export const WIN_B = 2;
export const WIN_DRAW = 3;

export const START_HP = 3;
export const START_A = 10;
export const START_B = 14;
export const MAX_TURNS = 8;
export const MIN_WINDOW = 15;
export const MAX_WINDOW = 180;
export const PRACTICE_WINDOW_SEC = 45;

export const PHASE_COMMIT = 0;
export const PHASE_REVEAL = 1;
export const PHASE_FINISHED = 2;

export const F_COLLISION = 1 << 0;
export const F_CROSSING = 1 << 1;
export const F_HIT_A = 1 << 4;
export const F_HIT_B = 1 << 5;
export const F_GUARD_A = 1 << 6;
export const F_GUARD_B = 1 << 7;
export const F_WHIFF_A = 1 << 8;
export const F_WHIFF_B = 1 << 9;
export const F_BLOCK_ON_A = 1 << 10;
export const F_BLOCK_ON_B = 1 << 11;
export const F_TIMEOUT = 1 << 12;
export const F_SUDDEN = 1 << 13;

export const DOMAIN = "fog-of-war-v1";
export const MATCH_SIZE = 256;

export const DIR_NAME = ["north", "east", "south", "west"] as const;
export const ACTION_NAME = ["advance", "strike", "guard"] as const;

export function isPillar(pos: number): boolean {
  return pos === 6 || pos === 8 || pos === 16 || pos === 18;
}

export function xy(pos: number): { x: number; y: number } {
  return { x: pos % MAP_W, y: Math.floor(pos / MAP_W) };
}
