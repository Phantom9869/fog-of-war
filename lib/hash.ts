import { sha256 } from "@noble/hashes/sha2.js";
import { DOMAIN } from "./constants";

export type CommitInput = {
  matchId: Uint8Array;
  turn: number;
  player: number;
  action: number;
  dir: number;
  salt: Uint8Array;
};

export function commitment(input: CommitInput): Uint8Array {
  const turn = new Uint8Array(4);
  new DataView(turn.buffer).setUint32(0, input.turn, true);
  const parts = [
    new TextEncoder().encode(DOMAIN),
    input.matchId,
    turn,
    Uint8Array.of(input.player),
    Uint8Array.of(input.action),
    Uint8Array.of(input.dir),
    input.salt,
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    buf.set(part, offset);
    offset += part.length;
  }
  return sha256(buf);
}

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomSalt(): Uint8Array {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return salt;
}
