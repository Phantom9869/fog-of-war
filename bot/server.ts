import { createServer, type IncomingMessage } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Connection, Keypair, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { chooseBotAction } from "../lib/bot-ai";
import { commitIx, decodeMatch, revealIx } from "../lib/codec";
import { PHASE_COMMIT, PHASE_REVEAL } from "../lib/constants";
import { commitment, toHex } from "../lib/hash";

const PORT = Number(process.env.BOT_PORT ?? 3921);
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const KEY_FILE = path.join(process.cwd(), "bot/.bot-keypair.json");
const SEAL_FILE = path.join(process.cwd(), "bot/.seals.json");

type Seal = { action: number; dir: number; salt: number[] };
const seals = new Map<string, Seal>();

function loadSeals() {
  if (!existsSync(SEAL_FILE)) return;
  const parsed = JSON.parse(readFileSync(SEAL_FILE, "utf8")) as Record<string, Seal>;
  for (const [key, value] of Object.entries(parsed)) seals.set(key, value);
}

function saveSeals() {
  const obj: Record<string, Seal> = {};
  for (const [key, value] of seals) obj[key] = value;
  writeFileSync(SEAL_FILE, JSON.stringify(obj), { mode: 0o600 });
}

function keypair(): Keypair {
  if (existsSync(KEY_FILE)) {
    const raw = JSON.parse(readFileSync(KEY_FILE, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const created = Keypair.generate();
  mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  writeFileSync(KEY_FILE, JSON.stringify(Array.from(created.secretKey)), { mode: 0o600 });
  console.log(`fog bot pubkey ${created.publicKey.toBase58()}`);
  return created;
}

function programId(): PublicKey | null {
  if (process.env.PROGRAM_ID) return new PublicKey(process.env.PROGRAM_ID);
  const file = path.join(process.cwd(), "public/program.json");
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { programId?: string };
  return parsed.programId ? new PublicKey(parsed.programId) : null;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function send(res: import("node:http").ServerResponse, status: number, body: unknown) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(raw);
}

const signer = keypair();
loadSeals();
const connection = new Connection(RPC, "confirmed");

async function signAndSend(ixs: TransactionInstruction[]) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: signer.publicKey, recentBlockhash: blockhash }).add(...ixs);
  tx.sign(signer);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      send(res, 204, {});
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/status") {
      send(res, 200, {
        pubkey: signer.publicKey.toBase58(),
        rpc: RPC,
        programId: programId()?.toBase58() ?? null,
      });
      return;
    }
    if (req.method !== "POST" || (url.pathname !== "/lock" && url.pathname !== "/reveal")) {
      send(res, 404, { error: "Not found" });
      return;
    }
    const body = await readBody(req);
    if ("action" in body || "salt" in body || "kind" in body || "dir" in body) {
      send(res, 400, { error: "This service does not accept move preimages." });
      return;
    }
    const id = programId();
    if (!id) {
      send(res, 503, { error: "Program id is not configured. Deploy with scripts/localnet.sh." });
      return;
    }
    if (typeof body.match !== "string") {
      send(res, 400, { error: "match pubkey is required" });
      return;
    }
    const match = new PublicKey(body.match);
    const account = await connection.getAccountInfo(match);
    if (!account) {
      send(res, 404, { error: "Match account not found" });
      return;
    }
    const state = decodeMatch(account.data);
    const seat = state.playerA.equals(signer.publicKey) ? 0 : state.playerB.equals(signer.publicKey) ? 1 : -1;
    if (seat < 0) {
      send(res, 403, { error: "This bot is not a player in that match." });
      return;
    }
    const sealKey = `${match.toBase58()}:${state.turn}`;
    if (url.pathname === "/lock") {
      if (state.phase !== PHASE_COMMIT) {
        send(res, 409, { error: "Match is not accepting seals." });
        return;
      }
      const already = seat === 0 ? state.committedA === 1 : state.committedB === 1;
      if (already) {
        const stored = seat === 0 ? state.commitA : state.commitB;
        send(res, 200, { ok: true, already: true, commitment: toHex(stored), turn: state.turn });
        return;
      }
      const pos = seat === 0 ? state.posA : state.posB;
      const opp = seat === 0 ? state.posB : state.posA;
      const hp = seat === 0 ? state.hpA : state.hpB;
      const oppHp = seat === 0 ? state.hpB : state.hpA;
      const choice = chooseBotAction(pos, opp, hp, oppHp);
      const salt = new Uint8Array(32);
      crypto.getRandomValues(salt);
      const hash = commitment({
        matchId: match.toBytes(),
        turn: state.turn,
        player: seat,
        action: choice.kind,
        dir: choice.dir,
        salt,
      });
      seals.set(sealKey, { action: choice.kind, dir: choice.dir, salt: [...salt] });
      saveSeals();
      const signature = await signAndSend([commitIx(id, signer.publicKey, match, hash)]);
      send(res, 200, { ok: true, signature, commitment: toHex(hash), turn: state.turn });
      return;
    }
    if (state.phase !== PHASE_REVEAL) {
      send(res, 409, { error: "Match is not in the reveal phase." });
      return;
    }
    const revealed = seat === 0 ? state.revealedA === 1 : state.revealedB === 1;
    if (revealed) {
      send(res, 200, { ok: true, already: true });
      return;
    }
    const seal = seals.get(sealKey);
    if (!seal) {
      send(res, 409, {
        error: "The bot no longer has this turn's seal. Enforce the on-chain timeout or start a new match.",
      });
      return;
    }
    const signature = await signAndSend([
      revealIx(id, signer.publicKey, match, seal.action, seal.dir, Uint8Array.from(seal.salt)),
    ]);
    seals.delete(sealKey);
    saveSeals();
    send(res, 200, { ok: true, signature });
  } catch (error) {
    const message = error instanceof Error ? error.message : "bot failure";
    send(res, 500, { error: message.slice(0, 400) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`fog bot listening on 127.0.0.1:${PORT} as ${signer.publicKey.toBase58()}`);
});
