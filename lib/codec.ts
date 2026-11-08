import {
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { MATCH_SIZE } from "./constants";

export type MatchAccount = {
  playerA: PublicKey;
  playerB: PublicKey;
  bump: number;
  phase: number;
  hpA: number;
  hpB: number;
  posA: number;
  posB: number;
  committedA: number;
  committedB: number;
  revealedA: number;
  revealedB: number;
  actionA: number;
  dirA: number;
  actionB: number;
  dirB: number;
  winner: number;
  turn: number;
  maxTurns: number;
  commitA: Uint8Array;
  commitB: Uint8Array;
  deadline: bigint;
  window: bigint;
  nonce: bigint;
  lastPrevPosA: number;
  lastPrevPosB: number;
  lastDamageA: number;
  lastDamageB: number;
  lastFlags: number;
  lastActionA: number;
  lastDirA: number;
  lastActionB: number;
  lastDirB: number;
  lastHpABefore: number;
  lastHpBBefore: number;
  lastTurn: number;
};

export function decodeMatch(data: Uint8Array): MatchAccount {
  if (data.length < MATCH_SIZE) throw new Error("Account data is too small to be a match.");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let i = 0;
  const magic = new TextDecoder().decode(data.subarray(0, 8));
  if (magic !== "FOGWAR01") throw new Error("This account is not a Fog of War match.");
  i = 8;
  const take = (n: number) => {
    const slice = data.subarray(i, i + n);
    i += n;
    return slice;
  };
  const u8 = () => data[i++];
  const u16 = () => {
    const n = view.getUint16(i, true);
    i += 2;
    return n;
  };
  const u32 = () => {
    const n = view.getUint32(i, true);
    i += 4;
    return n;
  };
  const i64 = () => {
    const n = view.getBigInt64(i, true);
    i += 8;
    return n;
  };
  const u64 = () => {
    const n = view.getBigUint64(i, true);
    i += 8;
    return n;
  };
  const playerA = new PublicKey(take(32));
  const playerB = new PublicKey(take(32));
  return {
    playerA,
    playerB,
    bump: u8(),
    phase: u8(),
    hpA: u8(),
    hpB: u8(),
    posA: u8(),
    posB: u8(),
    committedA: u8(),
    committedB: u8(),
    revealedA: u8(),
    revealedB: u8(),
    actionA: u8(),
    dirA: u8(),
    actionB: u8(),
    dirB: u8(),
    winner: u8(),
    turn: (u8(), u32()),
    maxTurns: u32(),
    commitA: take(32),
    commitB: take(32),
    deadline: i64(),
    window: i64(),
    nonce: u64(),
    lastPrevPosA: u8(),
    lastPrevPosB: u8(),
    lastDamageA: u8(),
    lastDamageB: u8(),
    lastFlags: u16(),
    lastActionA: u8(),
    lastDirA: u8(),
    lastActionB: u8(),
    lastDirB: u8(),
    lastHpABefore: u8(),
    lastHpBBefore: u8(),
    lastTurn: u32(),
  };
}

export function matchPda(programId: PublicKey, playerA: PublicKey, nonce: bigint): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync([Buffer.from("match"), playerA.toBuffer(), buf], programId);
}

function ix(programId: PublicKey, keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[], data: Buffer) {
  return new TransactionInstruction({ programId, keys, data });
}

export function initIx(
  programId: PublicKey,
  playerA: PublicKey,
  playerB: PublicKey,
  match: PublicKey,
  windowSec: number,
  nonce: bigint,
): TransactionInstruction {
  const data = Buffer.alloc(49);
  data.writeUInt8(0, 0);
  playerB.toBuffer().copy(data, 1);
  data.writeBigInt64LE(BigInt(windowSec), 33);
  data.writeBigUInt64LE(nonce, 41);
  return ix(
    programId,
    [
      { pubkey: playerA, isSigner: true, isWritable: true },
      { pubkey: match, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  );
}

export function commitIx(
  programId: PublicKey,
  player: PublicKey,
  match: PublicKey,
  hash: Uint8Array,
): TransactionInstruction {
  const data = Buffer.alloc(33);
  data.writeUInt8(1, 0);
  Buffer.from(hash).copy(data, 1);
  return ix(
    programId,
    [
      { pubkey: player, isSigner: true, isWritable: false },
      { pubkey: match, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  );
}

export function revealIx(
  programId: PublicKey,
  player: PublicKey,
  match: PublicKey,
  action: number,
  dir: number,
  salt: Uint8Array,
): TransactionInstruction {
  const data = Buffer.alloc(35);
  data.writeUInt8(2, 0);
  data.writeUInt8(action, 1);
  data.writeUInt8(dir, 2);
  Buffer.from(salt).copy(data, 3);
  return ix(
    programId,
    [
      { pubkey: player, isSigner: true, isWritable: false },
      { pubkey: match, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  );
}

export function timeoutIx(programId: PublicKey, match: PublicKey): TransactionInstruction {
  return ix(
    programId,
    [
      { pubkey: match, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    ],
    Buffer.from([3]),
  );
}
