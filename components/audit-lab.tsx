"use client";

import "@/lib/polyfill";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  airdrop,
  connectionFor,
  ephemeralSigner,
  loadProgramConfig,
  programIsDeployed,
  rpcSlot,
  sendInstruction,
} from "@/lib/chain";
import { commitIx, initIx, matchPda, revealIx, timeoutIx } from "@/lib/codec";
import { ACTION_GUARD, DIR_NONE } from "@/lib/constants";
import { explainProgramError } from "@/lib/errors";
import { commitment, randomSalt } from "@/lib/hash";

type Line = { ok: boolean; text: string };

export function AuditLab() {
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [armed, setArmed] = useState<{
    program: PublicKey;
    match: PublicKey;
    a: Keypair;
    salt: Uint8Array;
  } | null>(null);

  const push = (ok: boolean, text: string) => setLines((list) => [...list, { ok, text }]);

  const prepare = async () => {
    setBusy(true);
    setLines([]);
    setArmed(null);
    try {
      const slot = await rpcSlot("localnet");
      push(true, `Local validator answered at slot ${slot}.`);
      const config = await loadProgramConfig();
      if (!config?.programId) {
        push(false, "public/program.json is missing. Run scripts/localnet.sh. This page will not fake a program.");
        return;
      }
      const program = new PublicKey(config.programId);
      const deployed = await programIsDeployed("localnet", config.programId);
      if (!deployed) {
        push(false, "Program account is not executable on the local validator.");
        return;
      }
      push(true, `Program ${config.programId} is executable.`);
      const a = Keypair.generate();
      const b = Keypair.generate();
      await airdrop("localnet", a.publicKey, 2);
      await airdrop("localnet", b.publicKey, 2);
      push(true, "Airdropped test SOL to two ephemeral keys held in this tab. This is an attack harness, not a hidden match.");
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      let nonce = 0n;
      for (const byte of bytes) nonce = (nonce << 8n) | BigInt(byte);
      const [pda] = matchPda(program, a.publicKey, nonce);
      await sendInstruction("localnet", ephemeralSigner(a), initIx(program, a.publicKey, b.publicKey, pda, 20, nonce));
      push(true, `Match ${pda.toBase58()} created with a 20 second window.`);
      const salt = randomSalt();
      const hash = commitment({
        matchId: pda.toBytes(),
        turn: 1,
        player: 0,
        action: ACTION_GUARD,
        dir: DIR_NONE,
        salt,
      });
      await sendInstruction("localnet", ephemeralSigner(a), commitIx(program, a.publicKey, pda, hash));
      const saltB = randomSalt();
      const hashB = commitment({
        matchId: pda.toBytes(),
        turn: 1,
        player: 1,
        action: ACTION_GUARD,
        dir: DIR_NONE,
        salt: saltB,
      });
      await sendInstruction("localnet", ephemeralSigner(b), commitIx(program, b.publicKey, pda, hashB));
      push(true, "Both harness keys sealed a guard. The account is now in reveal.");
      const info = await connectionFor("localnet").getAccountInfo(pda);
      if (!info) throw new Error("Match disappeared");
      const view = new DataView(info.data.buffer, info.data.byteOffset, info.data.byteLength);
      const deadlineSec = view.getBigInt64(160, true);
      setDeadline(Number(deadlineSec) * 1000);
      setArmed({ program, match: pda, a, salt });
    } catch (error) {
      push(false, explainProgramError(error));
    } finally {
      setBusy(false);
    }
  };

  const tamper = async () => {
    if (!armed) return;
    setBusy(true);
    const bad = new Uint8Array(armed.salt);
    bad[0] ^= 0xff;
    try {
      await sendInstruction(
        "localnet",
        ephemeralSigner(armed.a),
        revealIx(armed.program, armed.a.publicKey, armed.match, ACTION_GUARD, DIR_NONE, bad),
      );
      push(false, "Tampered reveal was accepted. That is a bug.");
    } catch (error) {
      push(true, `Tampered reveal rejected: ${explainProgramError(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const early = async () => {
    if (!armed) return;
    setBusy(true);
    try {
      await sendInstruction("localnet", ephemeralSigner(armed.a), timeoutIx(armed.program, armed.match));
      push(false, "Timeout was accepted before the deadline. That is a bug.");
    } catch (error) {
      push(true, `Early timeout rejected: ${explainProgramError(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const late = async () => {
    if (!armed) return;
    setBusy(true);
    try {
      const sig = await sendInstruction("localnet", ephemeralSigner(armed.a), timeoutIx(armed.program, armed.match));
      push(true, `Timeout enforced. Signature ${sig.slice(0, 12)}… on the local validator.`);
    } catch (error) {
      push(false, explainProgramError(error));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const due = deadline !== null && now >= deadline;

  return (
    <main className="gate">
      <p className="kicker">Red team</p>
      <h1>Break the seal.</h1>
      <p className="lede">
        These buttons send real transactions to the local validator. A corrupted salt must come back as a commitment
        mismatch. A timeout before the clock must be refused. The Rust suite warps time instantly; this page waits
        out the real 20 second window.
      </p>
      <div className="row">
        <button type="button" className="confirm" disabled={busy} onClick={() => void prepare()}>
          {busy ? "Sending…" : "Prepare harness"}
        </button>
        <button type="button" disabled={!armed || busy} onClick={() => void tamper()}>
          Tamper the reveal
        </button>
        <button type="button" disabled={!armed || busy} onClick={() => void early()}>
          Enforce timeout early
        </button>
        <button type="button" disabled={!armed || busy || !due} onClick={() => void late()}>
          {due ? "Enforce timeout now" : "Timeout after the clock"}
        </button>
        <Link href="/">Back to the arena</Link>
      </div>
      <ol className="log">
        {lines.length === 0 ? <li className="info">No attempt yet.</li> : null}
        {lines.map((line, index) => (
          <li key={index} className={line.ok ? "good" : "bad"}>
            {line.text}
          </li>
        ))}
      </ol>
    </main>
  );
}
