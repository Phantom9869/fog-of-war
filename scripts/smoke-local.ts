import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { commitIx, decodeMatch, initIx, matchPda, revealIx, timeoutIx } from "../lib/codec";
import { ACTION_GUARD, ACTION_MOVE, DIR_E, DIR_NONE, DIR_W, F_TIMEOUT, PHASE_COMMIT, PHASE_FINISHED, PHASE_REVEAL, WIN_A } from "../lib/constants";
import { commitment, randomSalt } from "../lib/hash";

const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const programId = new PublicKey(
  JSON.parse(readFileSync("public/program.json", "utf8")).programId as string,
);
const connection = new Connection(rpc, "confirmed");

async function send(payer: Keypair, ix: ReturnType<typeof initIx>) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(ix);
  tx.sign(payer);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

async function expectCode(payer: Keypair, ix: ReturnType<typeof initIx>, code: string, label: string) {
  try {
    await send(payer, ix);
    throw new Error(`${label} was accepted`);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (!new RegExp(`custom program error: ${code}`, "i").test(text)) {
      throw new Error(`${label} failed differently: ${text.slice(0, 240)}`);
    }
    console.log(`${label} rejected ${code}`);
  }
}

async function load(match: PublicKey) {
  const info = await connection.getAccountInfo(match);
  if (!info) throw new Error("match missing");
  return decodeMatch(info.data);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
const player = Keypair.generate();
const bot = JSON.parse(readFileSync("bot/.bot-keypair.json", "utf8")) as number[];
const rival = Keypair.fromSecretKey(Uint8Array.from(bot));
await connection.requestAirdrop(player.publicKey, 2_000_000_000);
await connection.requestAirdrop(rival.publicKey, 2_000_000_000);
await new Promise((r) => setTimeout(r, 800));

const nonce = 42n;
const [pda] = matchPda(programId, player.publicKey, nonce);
await send(player, initIx(programId, player.publicKey, rival.publicKey, pda, 60, nonce));
const lock = await fetch("http://127.0.0.1:3921/lock", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ match: pda.toBase58() }),
});
if (!lock.ok) throw new Error(await lock.text());
const locked = (await lock.json()) as { commitment?: string; action?: string };
if (locked.action) throw new Error("bot returned a preimage");
if (!locked.commitment) throw new Error("bot did not seal");

const salt = randomSalt();
const hash = commitment({
  matchId: pda.toBytes(),
  turn: 1,
  player: 0,
  action: ACTION_MOVE,
  dir: DIR_E,
  salt,
});
await send(player, commitIx(programId, player.publicKey, pda, hash));
const bad = new Uint8Array(salt);
bad[0] ^= 0xff;
await expectCode(
  player,
  revealIx(programId, player.publicKey, pda, ACTION_MOVE, DIR_E, bad),
  "0x4",
  "tampered reveal",
);
await send(player, revealIx(programId, player.publicKey, pda, ACTION_MOVE, DIR_E, salt));
const reveal = await fetch("http://127.0.0.1:3921/reveal", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ match: pda.toBase58() }),
});
if (!reveal.ok) throw new Error(await reveal.text());
const state = await load(pda);
if (state.phase !== PHASE_COMMIT || state.turn !== 2) {
  throw new Error(`unexpected state phase ${state.phase} turn ${state.turn}`);
}
if (state.posA !== 11) throw new Error(`west did not advance (${state.posA})`);
console.log(
  `smoke ok phase=${state.phase} turn=${state.turn} pos=${state.posA},${state.posB} east-dir-check=${DIR_W}`,
);

const nonce2 = BigInt(Date.now());
const [pda2] = matchPda(programId, player.publicKey, nonce2);
await send(player, initIx(programId, player.publicKey, rival.publicKey, pda2, 15, nonce2));
const salt2 = randomSalt();
const hash2 = commitment({
  matchId: pda2.toBytes(),
  turn: 1,
  player: 0,
  action: ACTION_MOVE,
  dir: DIR_E,
  salt: salt2,
});
await send(player, commitIx(programId, player.publicKey, pda2, hash2));
const sealed = await load(pda2);
const replacement = commitment({
  matchId: pda2.toBytes(),
  turn: 1,
  player: 0,
  action: ACTION_GUARD,
  dir: DIR_NONE,
  salt: randomSalt(),
});
await expectCode(player, commitIx(programId, player.publicKey, pda2, replacement), "0x2", "second commit");
const still = await load(pda2);
if (Buffer.from(still.commitA).toString("hex") !== Buffer.from(sealed.commitA).toString("hex")) {
  throw new Error("second commit changed the sealed hash");
}
console.log("commitment unchanged after rejected reseal");
if (still.phase !== PHASE_COMMIT) throw new Error(`second commit left phase ${still.phase}`);
const lock2 = await fetch("http://127.0.0.1:3921/lock", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ match: pda2.toBase58() }),
});
if (!lock2.ok) throw new Error(await lock2.text());
const opened = await load(pda2);
if (opened.phase !== PHASE_REVEAL) throw new Error(`expected reveal phase, got ${opened.phase}`);
await expectCode(player, timeoutIx(programId, pda2), "0x6", "reveal timeout before deadline");
await send(player, revealIx(programId, player.publicKey, pda2, ACTION_MOVE, DIR_E, salt2));
const open = await load(pda2);
if (open.revealedA !== 1 || open.revealedB !== 0) {
  throw new Error(`reveal seats ${open.revealedA},${open.revealedB}`);
}
const deadline = open.deadline;
let timed: Awaited<ReturnType<typeof load>> | null = null;
for (let i = 0; i < 40; i += 1) {
  if (BigInt(Math.floor(Date.now() / 1000)) > deadline + 1n) {
    try {
      await send(player, timeoutIx(programId, pda2));
      timed = await load(pda2);
      break;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (!/custom program error: 0x6/i.test(text)) throw error;
    }
  }
  await sleep(500);
}
if (!timed) throw new Error("reveal deadline never became enforceable");
if (timed.phase !== PHASE_FINISHED || timed.winner !== WIN_A) {
  throw new Error(`reveal timeout outcome phase=${timed.phase} winner=${timed.winner}`);
}
if ((timed.lastFlags & F_TIMEOUT) === 0) throw new Error("timeout flag missing");
if (timed.posA !== 10 || timed.posB !== 14 || timed.lastDamageA !== 0 || timed.lastDamageB !== 0) {
  throw new Error(`timeout invented combat pos=${timed.posA},${timed.posB} dmg=${timed.lastDamageA},${timed.lastDamageB}`);
}
console.log(
  `reveal-timeout forfeit winner=${timed.winner} phase=${timed.phase} flags=${timed.lastFlags} pos=${timed.posA},${timed.posB} deadline=${deadline}`,
);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
