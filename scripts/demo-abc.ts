import { writeFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { commitIx, decodeMatch, initIx, matchPda, revealIx, timeoutIx } from "../lib/codec";
import {
  ACTION_ATTACK,
  ACTION_GUARD,
  ACTION_MOVE,
  DIR_E,
  DIR_NONE,
  DIR_W,
  F_HIT_B,
  F_TIMEOUT,
  PHASE_COMMIT,
  PHASE_FINISHED,
  PHASE_REVEAL,
  WIN_A,
} from "../lib/constants";
import { commitment, randomSalt } from "../lib/hash";

const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const programId = new PublicKey(JSON.parse(readFileSync("public/program.json", "utf8")).programId as string);
const connection = new Connection(rpc, "confirmed");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Step = {
  label: string;
  signature: string | null;
  stage: "confirmed" | "simulation-rejected";
  error: string | null;
};

async function send(payer: Keypair, ix: ReturnType<typeof initIx>, label: string): Promise<Step> {
  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(ix);
    tx.sign(payer);
    const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    console.log(`${label} confirmed ${signature}`);
    return { label, signature, stage: "confirmed", error: null };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    const code = text.match(/custom program error: (0x[0-9a-f]+)/i)?.[1] ?? "unknown";
    console.log(`${label} rejected ${code} (no signature; preflight or simulation)`);
    return { label, signature: null, stage: "simulation-rejected", error: code };
  }
}

async function load(match: PublicKey) {
  const info = await connection.getAccountInfo(match);
  if (!info) throw new Error("match missing");
  return decodeMatch(info.data);
}

async function airdrop(key: Keypair) {
  const sig = await connection.requestAirdrop(key.publicKey, 2_000_000_000);
  await connection.confirmTransaction(sig, "confirmed");
}

async function main() {
  const west = Keypair.generate();
  const east = Keypair.generate();
  await airdrop(west);
  await airdrop(east);
  const steps: Record<string, Step[]> = { A: [], B: [], C: [] };

  const nonceA = BigInt(Date.now());
  const [matchA] = matchPda(programId, west.publicKey, nonceA);
  steps.A.push(await send(west, initIx(programId, west.publicKey, east.publicKey, matchA, 60, nonceA), "A init"));
  const saltA1 = randomSalt();
  const saltB1 = randomSalt();
  const hashA1 = commitment({ matchId: matchA.toBytes(), turn: 1, player: 0, action: ACTION_MOVE, dir: DIR_E, salt: saltA1 });
  const hashB1 = commitment({ matchId: matchA.toBytes(), turn: 1, player: 1, action: ACTION_MOVE, dir: DIR_W, salt: saltB1 });
  steps.A.push(await send(west, commitIx(programId, west.publicKey, matchA, hashA1), "A commit advance east"));
  steps.A.push(await send(east, commitIx(programId, east.publicKey, matchA, hashB1), "A commit advance west"));
  steps.A.push(await send(west, revealIx(programId, west.publicKey, matchA, ACTION_MOVE, DIR_E, saltA1), "A reveal advance east"));
  steps.A.push(await send(east, revealIx(programId, east.publicKey, matchA, ACTION_MOVE, DIR_W, saltB1), "A reveal advance west"));
  const mid = await load(matchA);
  if (mid.posA !== 11 || mid.posB !== 13 || mid.hpA !== 3 || mid.hpB !== 3) {
    throw new Error(`A approach unexpected pos=${mid.posA},${mid.posB} hp=${mid.hpA},${mid.hpB}`);
  }
  const saltA2 = randomSalt();
  const saltB2 = randomSalt();
  const hashA2 = commitment({ matchId: matchA.toBytes(), turn: 2, player: 0, action: ACTION_ATTACK, dir: DIR_E, salt: saltA2 });
  const hashB2 = commitment({ matchId: matchA.toBytes(), turn: 2, player: 1, action: ACTION_MOVE, dir: DIR_W, salt: saltB2 });
  steps.A.push(await send(west, commitIx(programId, west.publicKey, matchA, hashA2), "A commit strike east"));
  steps.A.push(await send(east, commitIx(programId, east.publicKey, matchA, hashB2), "A commit step west"));
  steps.A.push(await send(west, revealIx(programId, west.publicKey, matchA, ACTION_ATTACK, DIR_E, saltA2), "A reveal strike"));
  steps.A.push(await send(east, revealIx(programId, east.publicKey, matchA, ACTION_MOVE, DIR_W, saltB2), "A reveal step"));
  const fought = await load(matchA);
  if (fought.posA !== 11 || fought.posB !== 12 || fought.hpB !== 2 || (fought.lastFlags & F_HIT_B) === 0) {
    throw new Error(`A combat unexpected pos=${fought.posA},${fought.posB} hpB=${fought.hpB} flags=${fought.lastFlags}`);
  }
  console.log(`demo A combat hit pos=${fought.posA},${fought.posB} hp=${fought.hpA},${fought.hpB} flags=${fought.lastFlags}`);

  const nonceB = nonceA + 1n;
  const [matchB] = matchPda(programId, west.publicKey, nonceB);
  steps.B.push(await send(west, initIx(programId, west.publicKey, east.publicKey, matchB, 60, nonceB), "B init"));
  const saltB = randomSalt();
  const hashB = commitment({ matchId: matchB.toBytes(), turn: 1, player: 0, action: ACTION_MOVE, dir: DIR_E, salt: saltB });
  steps.B.push(await send(west, commitIx(programId, west.publicKey, matchB, hashB), "B first commit"));
  const sealed = await load(matchB);
  const other = commitment({
    matchId: matchB.toBytes(),
    turn: 1,
    player: 0,
    action: ACTION_GUARD,
    dir: DIR_NONE,
    salt: randomSalt(),
  });
  steps.B.push(await send(west, commitIx(programId, west.publicKey, matchB, other), "B second commit"));
  const kept = await load(matchB);
  const hashBefore = Buffer.from(sealed.commitA).toString("hex");
  const hashAfter = Buffer.from(kept.commitA).toString("hex");
  if (hashBefore !== hashAfter || kept.phase !== PHASE_COMMIT) {
    throw new Error("B changed the sealed hash or the phase");
  }
  if (steps.B[2]?.error !== "0x2") throw new Error(`B expected 0x2, got ${steps.B[2]?.error}`);
  console.log("demo B hash unchanged", hashAfter);

  const nonceC = nonceA + 2n;
  const [matchC] = matchPda(programId, west.publicKey, nonceC);
  steps.C.push(await send(west, initIx(programId, west.publicKey, east.publicKey, matchC, 15, nonceC), "C init"));
  const saltC = randomSalt();
  const saltE = randomSalt();
  const hashC = commitment({ matchId: matchC.toBytes(), turn: 1, player: 0, action: ACTION_GUARD, dir: DIR_NONE, salt: saltC });
  const hashE = commitment({ matchId: matchC.toBytes(), turn: 1, player: 1, action: ACTION_GUARD, dir: DIR_NONE, salt: saltE });
  steps.C.push(await send(west, commitIx(programId, west.publicKey, matchC, hashC), "C west commit"));
  steps.C.push(await send(east, commitIx(programId, east.publicKey, matchC, hashE), "C east commit"));
  const revealPhase = await load(matchC);
  if (revealPhase.phase !== PHASE_REVEAL) throw new Error(`C phase ${revealPhase.phase}`);
  steps.C.push(await send(west, timeoutIx(programId, matchC), "C timeout before deadline"));
  if (steps.C.at(-1)?.error !== "0x6") throw new Error("C early timeout was not 0x6");
  steps.C.push(await send(west, revealIx(programId, west.publicKey, matchC, ACTION_GUARD, DIR_NONE, saltC), "C west reveal"));
  const open = await load(matchC);
  if (open.revealedA !== 1 || open.revealedB !== 0) throw new Error("C reveal seats");
  let finished: Awaited<ReturnType<typeof load>> | null = null;
  for (let i = 0; i < 40; i += 1) {
    if (BigInt(Math.floor(Date.now() / 1000)) > open.deadline + 1n) {
      const step = await send(west, timeoutIx(programId, matchC), "C reveal timeout");
      steps.C.push(step);
      if (step.stage === "confirmed") {
        finished = await load(matchC);
        break;
      }
      if (step.error !== "0x6") throw new Error(`C timeout failed ${step.error}`);
    }
    await sleep(500);
  }
  if (!finished || finished.phase !== PHASE_FINISHED || finished.winner !== WIN_A || (finished.lastFlags & F_TIMEOUT) === 0) {
    throw new Error("C did not forfeit to the seat that revealed");
  }
  if (finished.posA !== 10 || finished.posB !== 14 || finished.lastDamageA !== 0) {
    throw new Error("C invented combat");
  }
  console.log(`demo C forfeit winner=${finished.winner} flags=${finished.lastFlags} pos=${finished.posA},${finished.posB}`);

  const evidence = {
    generatedAt: new Date().toISOString(),
    cluster: rpc,
    clusterKind: "localnet",
    explorer: null,
    note: "These signatures exist only on this local validator. They are not devnet or mainnet explorer records. Query the same RPC while that validator process is still running. A simulation rejection has no signature.",
    programId: programId.toBase58(),
    wallet: "none. Ephemeral keypairs lived in this process and were not written to disk.",
    demos: {
      A: {
        what: "Both seats commit and reveal. Turn 1 closes distance. Turn 2 west strikes the square east steps onto.",
        match: matchA.toBase58(),
        steps: steps.A,
        observed: { posA: fought.posA, posB: fought.posB, hpA: fought.hpA, hpB: fought.hpB, flags: fought.lastFlags, phase: fought.phase },
      },
      B: {
        what: "West commits, then submits a different order. The program rejects it and the stored hash stays.",
        match: matchB.toBase58(),
        steps: steps.B,
        hashBefore,
        hashAfter,
        phase: kept.phase,
      },
      C: {
        what: "Both commit. Only west reveals. Timeout before the deadline is rejected. After the reveal deadline, west wins by forfeit. No damage is invented.",
        match: matchC.toBase58(),
        steps: steps.C,
        observed: {
          winner: finished.winner,
          phase: finished.phase,
          flags: finished.lastFlags,
          posA: finished.posA,
          posB: finished.posB,
          damageA: finished.lastDamageA,
          damageB: finished.lastDamageB,
        },
      },
    },
  };
  const path = process.env.EVIDENCE_PATH ?? "evidence/localnet-abc.json";
  writeFileSync(path, JSON.stringify(evidence, null, 2));
  console.log(`evidence written ${path}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
