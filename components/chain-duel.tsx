"use client";

import "@/lib/polyfill";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { ActionPad, legalCells } from "@/components/action-pad";
import { PlayTable } from "@/components/play-table";
import {
  airdrop,
  connectPhantom,
  connectionFor,
  ephemeralSigner,
  explorerTx,
  loadProgramConfig,
  phantomAvailable,
  programIsDeployed,
  rpcSlot,
  sendInstruction,
  type ClusterName,
  type WalletSigner,
} from "@/lib/chain";
import { commitIx, decodeMatch, initIx, matchPda, revealIx, timeoutIx, type MatchAccount } from "@/lib/codec";
import {
  ACTION_GUARD,
  DIR_NONE,
  F_TIMEOUT,
  PHASE_COMMIT,
  PHASE_FINISHED,
  PHASE_REVEAL,
  WIN_NONE,
} from "@/lib/constants";
import { describeResolution, winnerLine, type LogLine } from "@/lib/describe";
import { explainProgramError } from "@/lib/errors";
import { commitment, randomSalt } from "@/lib/hash";
import { step } from "@/lib/rules";
import type { Snap } from "@/lib/cues";

type Secret = { kind: number; dir: number; salt: Uint8Array; turn: number };
type TxRec = { label: string; signature: string };

export function ChainDuel({ onLeave }: { onLeave: () => void }) {
  const [cluster, setCluster] = useState<ClusterName>("localnet");
  const [slot, setSlot] = useState<number | null>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const [deployed, setDeployed] = useState<boolean | null>(null);
  const [signer, setSigner] = useState<WalletSigner | null>(null);
  const [ephemeral, setEphemeral] = useState<Keypair | null>(null);
  const [walletNote, setWalletNote] = useState<string | null>(null);
  const [opponentMode, setOpponentMode] = useState<"bot" | "human">("bot");
  const [opponent, setOpponent] = useState("");
  const [botPk, setBotPk] = useState<string | null>(null);
  const [botError, setBotError] = useState<string | null>(null);
  const [windowSec, setWindowSec] = useState(45);
  const [matchPk, setMatchPk] = useState("");
  const [account, setAccount] = useState<MatchAccount | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txs, setTxs] = useState<TxRec[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [kind, setKind] = useState<number | null>(null);
  const [sealedLocally, setSealedLocally] = useState(false);
  const [dir, setDir] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const secret = useRef<Secret | null>(null);
  const seenTurn = useRef(0);
  const botLock = useRef<string | null>(null);

  const refreshNet = useCallback(async () => {
    try {
      const next = await rpcSlot(cluster);
      setSlot(next);
      setRpcError(null);
    } catch {
      setSlot(null);
      setRpcError(cluster === "localnet" ? "Local validator is not answering on port 8899." : "Devnet RPC did not answer.");
    }
  }, [cluster]);

  useEffect(() => {
    const id = window.setInterval(() => void refreshNet(), 4000);
    queueMicrotask(() => void refreshNet());
    return () => window.clearInterval(id);
  }, [refreshNet]);

  useEffect(() => {
    void (async () => {
      const config = await loadProgramConfig();
      setProgramId(config?.programId ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!programId || slot === null) return;
    let cancelled = false;
    void programIsDeployed(cluster, programId)
      .then((ok) => {
        if (!cancelled) setDeployed(ok);
      })
      .catch(() => {
        if (!cancelled) setDeployed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cluster, programId, slot]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const loadBot = useCallback(async () => {
    try {
      const res = await fetch("/bot/status");
      if (!res.ok) throw new Error("Bot status failed");
      const body = (await res.json()) as { pubkey?: string };
      setBotPk(body.pubkey ?? null);
      setBotError(null);
    } catch {
      setBotPk(null);
      setBotError("Rival process is not running. Start it with npm run bot. No move was simulated.");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadBot());
  }, [loadBot]);

  const refreshMatch = useCallback(async () => {
    if (!matchPk) return;
    try {
      const info = await connectionFor(cluster).getAccountInfo(new PublicKey(matchPk));
      if (!info) {
        setError("That match account is not on this cluster.");
        setAccount(null);
        return;
      }
      setAccount(decodeMatch(info.data));
    } catch (err) {
      setError(explainProgramError(err));
    }
  }, [cluster, matchPk]);

  useEffect(() => {
    if (!matchPk) return;
    const id = window.setInterval(() => void refreshMatch(), 2000);
    queueMicrotask(() => void refreshMatch());
    return () => window.clearInterval(id);
  }, [matchPk, refreshMatch]);

  useEffect(() => {
    if (!account) return;
    if (account.lastTurn === 0 || account.lastTurn === seenTurn.current) return;
    seenTurn.current = account.lastTurn;
    const youAreA = signer ? account.playerA.equals(signer.publicKey) : null;
    setLog((lines) => [
      ...lines,
      describeResolution({
        turn: account.lastTurn,
        youAreA,
        actionA: account.lastActionA,
        dirA: account.lastDirA,
        actionB: account.lastActionB,
        dirB: account.lastDirB,
        flags: account.lastFlags,
        damageA: account.lastDamageA,
        damageB: account.lastDamageB,
        winner: account.winner,
        timeout: (account.lastFlags & F_TIMEOUT) !== 0,
      }),
    ]);
  }, [account, signer]);

  const run = async (label: string, task: () => Promise<string>) => {
    setBusy(label);
    setError(null);
    try {
      const signature = await task();
      setTxs((list) => [{ label, signature }, ...list].slice(0, 8));
      await refreshMatch();
    } catch (err) {
      setError(explainProgramError(err));
    } finally {
      setBusy(null);
    }
  };

  const makeEphemeralKey = async () => {
    if (cluster !== "localnet") {
      setWalletNote("Ephemeral keys are limited to the local validator. Devnet needs a wallet.");
      return;
    }
    const kp = Keypair.generate();
    setEphemeral(kp);
    setSigner(ephemeralSigner(kp));
    setWalletNote("This test key lives only in this tab. It is not saved and it is not a wallet.");
    try {
      await airdrop("localnet", kp.publicKey, 2);
    } catch (err) {
      setError(explainProgramError(err));
    }
  };

  const createMatch = async () => {
    if (!signer || !programId) return;
    const rival = opponentMode === "bot" ? botPk : opponent.trim();
    if (!rival) {
      setError(opponentMode === "bot" ? "The rival process has no pubkey yet." : "Paste the rival's pubkey.");
      return;
    }
    let rivalKey: PublicKey;
    try {
      rivalKey = new PublicKey(rival);
    } catch {
      setError("That rival pubkey is not valid.");
      return;
    }
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let nonce = 0n;
    for (const byte of bytes) nonce = (nonce << 8n) | BigInt(byte);
    const program = new PublicKey(programId);
    const [pda] = matchPda(program, signer.publicKey, nonce);
    await run("Create match", async () => {
      const sig = await sendInstruction(
        cluster,
        signer,
        initIx(program, signer.publicKey, rivalKey, pda, windowSec, nonce),
      );
      setMatchPk(pda.toBase58());
      setLog([
        {
          turn: 0,
          tone: "info",
          text: "Match created on the cluster. Orders are accepted only as signed transactions.",
        },
      ]);
      seenTurn.current = 0;
      secret.current = null;
      setSealedLocally(false);
      return sig;
    });
  };

  const seat = signer && account
    ? account.playerA.equals(signer.publicKey)
      ? 0
      : account.playerB.equals(signer.publicKey)
        ? 1
        : -1
    : -1;
  const myPos = seat === 0 ? account?.posA : seat === 1 ? account?.posB : account?.posA;
  const committed = seat === 0 ? account?.committedA === 1 : seat === 1 ? account?.committedB === 1 : false;
  const revealed = seat === 0 ? account?.revealedA === 1 : seat === 1 ? account?.revealedB === 1 : false;

  useEffect(() => {
    if (!account || !matchPk || !botPk || busy) return;
    const botIsB = account.playerB.toBase58() === botPk;
    const botIsA = account.playerA.toBase58() === botPk;
    if (!botIsA && !botIsB) return;
    const botSeat = botIsA ? 0 : 1;
    const botCommitted = botSeat === 0 ? account.committedA === 1 : account.committedB === 1;
    const botRevealed = botSeat === 0 ? account.revealedA === 1 : account.revealedB === 1;
    const humanRevealed = seat === 0 ? account.revealedA === 1 : seat === 1 ? account.revealedB === 1 : false;
    const token = `${matchPk}:${account.turn}:${account.phase}:${botCommitted}:${botRevealed}:${humanRevealed}`;
    if (botLock.current === token) return;
    const ask = (path: string) => {
      botLock.current = token;
      void fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ match: matchPk }),
      })
        .then((res) => {
          if (!res.ok) botLock.current = null;
          return refreshMatch();
        })
        .catch(() => {
          botLock.current = null;
        });
    };
    if (account.phase === PHASE_COMMIT && !botCommitted) ask("/bot/lock");
    else if (account.phase === PHASE_REVEAL && humanRevealed && !botRevealed) ask("/bot/reveal");
  }, [account, botPk, busy, matchPk, refreshMatch, seat]);

  const deadlineMs = account ? Number(account.deadline) * 1000 : 0;
  const left = account && account.phase !== PHASE_FINISHED ? Math.max(0, deadlineMs - now) : 0;
  const legal =
    account && seat >= 0 && account.phase === PHASE_COMMIT && !committed ? legalCells(myPos ?? 0, kind) : [];
  const selected =
    account && seat >= 0 && kind !== null && dir !== null && dir <= 3 ? step(myPos ?? 0, dir) : null;
  const youAreA = seat === 0 ? true : seat === 1 ? false : null;
  const rivalSealed = account
    ? seat === 0
      ? account.committedB === 1
      : seat === 1
        ? account.committedA === 1
        : account.committedA === 1 && account.committedB === 1
    : false;
  const linkFor = (signature: string) => explorerTx(signature, cluster);

  const seal = async () => {
    if (!signer || !account || !programId || kind === null || seat < 0) return;
    const action = { kind, dir: kind === ACTION_GUARD ? DIR_NONE : dir ?? DIR_NONE };
    const salt = randomSalt();
    const hash = commitment({
      matchId: new PublicKey(matchPk).toBytes(),
      turn: account.turn,
      player: seat,
      action: action.kind,
      dir: action.dir,
      salt,
    });
    secret.current = { ...action, salt, turn: account.turn };
    setSealedLocally(true);
    await run("Seal order", () =>
      sendInstruction(cluster, signer, commitIx(new PublicKey(programId), signer.publicKey, new PublicKey(matchPk), hash)),
    );
    setKind(null);
    setDir(null);
  };

  const rejectChange = async () => {
    if (!signer || !account || !programId || seat < 0) {
      setError("MOVE CHANGE REJECTED. This turn is already sealed.");
      return;
    }
    const salt = randomSalt();
    const hash = commitment({
      matchId: new PublicKey(matchPk).toBytes(),
      turn: account.turn,
      player: seat,
      action: ACTION_GUARD,
      dir: DIR_NONE,
      salt,
    });
    setBusy("Change sealed order");
    setError(null);
    try {
      await sendInstruction(
        cluster,
        signer,
        commitIx(new PublicKey(programId), signer.publicKey, new PublicKey(matchPk), hash),
      );
      setError("MOVE CHANGE REJECTED. The account accepted another seal, which these rules should refuse.");
    } catch (err) {
      setError(`MOVE CHANGE REJECTED. ${explainProgramError(err)}`);
    } finally {
      setBusy(null);
      await refreshMatch();
    }
  };

  const reveal = async (salt: Uint8Array, label: string) => {
    if (!signer || !secret.current || !programId) return;
    const current = secret.current;
    await run(label, () =>
      sendInstruction(
        cluster,
        signer,
        revealIx(
          new PublicKey(programId),
          signer.publicKey,
          new PublicKey(matchPk),
          current.kind,
          current.dir,
          salt,
        ),
      ),
    );
  };

  const setup = !account;
  const programLabel = useMemo(() => programId ?? "not configured", [programId]);

  return (
    <section className="chain">
      <header className="phase-row">
        <div>
          <p className="kicker">Ledger duel · {cluster === "localnet" ? "local validator" : "devnet"}</p>
          <h2>{setup ? "Open a match" : phaseTitle(account.phase)}</h2>
        </div>
        <div className="net">
          <span className={slot === null ? "bad" : "ok"}>{slot === null ? "RPC down" : `slot ${slot}`}</span>
          <span>{deployed ? "program deployed" : deployed === false ? "program missing" : "program unknown"}</span>
          <button type="button" onClick={onLeave}>Leave</button>
        </div>
      </header>
      {rpcError ? <p className="error">{rpcError}</p> : null}
      {!programId ? (
        <p className="error">No program id in public/program.json. Run scripts/localnet.sh. Chain mode will not invent one.</p>
      ) : null}
      {deployed === false ? (
        <p className="error">The configured program is not executable on this cluster. Nothing here is simulated.</p>
      ) : null}

      <div className="setup-grid">
        <label>
          Cluster
          <select value={cluster} onChange={(event) => setCluster(event.target.value as ClusterName)}>
            <option value="localnet">Local validator</option>
            <option value="devnet">Devnet</option>
          </select>
        </label>
        <label>
          Window
          <input
            type="number"
            min={15}
            max={180}
            value={windowSec}
            onChange={(event) => setWindowSec(Number(event.target.value))}
          />
        </label>
        <div className="wallet-box">
          <strong>{signer ? signer.publicKey.toBase58() : "No signer"}</strong>
          <div className="row">
            <button type="button" onClick={() => void connectPhantom().then(setSigner).catch((err) => setError(explainProgramError(err)))}>
              {phantomAvailable() ? "Connect Phantom" : "Phantom not injected"}
            </button>
            <button type="button" onClick={() => void makeEphemeralKey()} disabled={cluster !== "localnet"}>
              Ephemeral local key
            </button>
          </div>
          {walletNote ? <p className="hint">{walletNote}</p> : null}
          {ephemeral ? <p className="hint">Pubkey {ephemeral.publicKey.toBase58()}</p> : null}
        </div>
      </div>

      {setup ? (
        <div className="setup-grid">
          <div className="kinds">
            <button type="button" className={opponentMode === "bot" ? "on" : ""} onClick={() => setOpponentMode("bot")}>
              <strong>Fixed-policy rival</strong>
              <span>{botPk ? `${botPk.slice(0, 4)}…${botPk.slice(-4)}` : "offline"}</span>
            </button>
            <button type="button" className={opponentMode === "human" ? "on" : ""} onClick={() => setOpponentMode("human")}>
              <strong>Another wallet</strong>
              <span>Paste their pubkey</span>
            </button>
          </div>
          {opponentMode === "human" ? (
            <label>
              Rival pubkey
              <input value={opponent} onChange={(event) => setOpponent(event.target.value)} placeholder="Public key" />
            </label>
          ) : (
            <p className="hint">{botError ?? "The rival reads the public account, seals on-chain, and never receives your action."}</p>
          )}
          <div className="row">
            <button type="button" className="confirm" disabled={!signer || !programId || deployed === false || Boolean(busy)} onClick={() => void createMatch()}>
              {busy ?? "Create on-chain match"}
            </button>
            {cluster === "localnet" && botPk ? (
              <button
                type="button"
                onClick={() => void airdrop("localnet", new PublicKey(botPk), 2).then(() => setWalletNote("Airdropped 2 test SOL to the rival."))}
              >
                Airdrop rival
              </button>
            ) : null}
          </div>
          <label>
            Join existing match
            <input value={matchPk} onChange={(event) => setMatchPk(event.target.value.trim())} placeholder="Match account" />
          </label>
        </div>
      ) : (
        <PlayTable
          mode={cluster === "devnet" ? "devnet" : "localnet"}
          snap={accountSnap(account)}
          youAreA={youAreA}
          nameA="West"
          nameB="East"
          youSealed={committed}
          rivalSealed={rivalSealed}
          clock={
            account.deadline > 0n
              ? { kind: "chain", leftMs: left, totalMs: Number(account.window) * 1000 }
              : null
          }
          legal={legal}
          selected={selected}
          aim={kind === 1 ? "attack" : kind === 0 ? "move" : null}
          notice={
            seat < 0
              ? "Spectator. This board is the account. You cannot sign for either fighter."
              : "The board is public account data. The chain does not hide it. Only the current order is sealed."
          }
          log={
            <>
              <p className="hint">Program {programLabel}</p>
              <ol className="log">
                {log.length === 0 ? <li className="info">No resolved turn yet. The log fills from the account.</li> : null}
                {[...log].reverse().map((line, index) => (
                  <li key={`${line.turn}-${index}`} className={line.tone}>{line.text}</li>
                ))}
              </ol>
              <ul className="txs">
                {txs.map((tx) => {
                  const href = linkFor(tx.signature);
                  return (
                    <li key={tx.signature}>
                      <span>{tx.label}</span>
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer">{tx.signature.slice(0, 8)}…</a>
                      ) : (
                        <code title="Local validator signature. No public explorer link.">{tx.signature.slice(0, 12)}…</code>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          }
        >
          <p className={`status ${error ? "bad" : busy ? "wait" : txs[0] ? "ok" : ""}`}>
            {busy ? `Pending · ${busy}` : error ? `Rejected · ${error}` : txs[0] ? `Confirmed · ${txs[0].label}` : "No transaction yet"}
          </p>
          {account.phase === PHASE_FINISHED || account.winner !== WIN_NONE ? (
            <div className="verdict">
              <h3>{winnerLine(account.winner, youAreA)}</h3>
              <button type="button" className="confirm" onClick={() => { setAccount(null); setMatchPk(""); }}>
                New match
              </button>
            </div>
          ) : seat >= 0 && account.phase === PHASE_COMMIT && !committed ? (
            <ActionPad
              pos={myPos ?? 0}
              kind={kind}
              dir={dir}
              onKind={setKind}
              onDir={setDir}
              busy={Boolean(busy)}
              confirmLabel={busy ?? "Seal on-chain"}
              confirmHint="Lock your move on-chain."
              onConfirm={() => void seal()}
            />
          ) : seat >= 0 && account.phase === PHASE_COMMIT && committed ? (
            <ActionPad
              pos={myPos ?? 0}
              kind={kind}
              dir={dir}
              onKind={setKind}
              onDir={setDir}
              locked
              onLocked={() => void rejectChange()}
              confirmLabel="Sealed"
              confirmHint="This order is already on the account."
              onConfirm={() => void rejectChange()}
            />
          ) : seat >= 0 && account.phase === PHASE_REVEAL && !revealed ? (
            <div className="reveal-box">
              <p>Your order is sealed on the account. A changed move is rejected. A corrupted salt is rejected.</p>
              <button type="button" className="confirm" disabled={Boolean(busy)} onClick={() => secret.current && void reveal(secret.current.salt, "Reveal order")}>
                {busy ?? "Reveal on-chain"}
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={Boolean(busy) || !sealedLocally}
                onClick={() => {
                  if (!secret.current) return;
                  const bad = new Uint8Array(secret.current.salt);
                  bad[0] ^= 0xff;
                  void reveal(bad, "Tampered reveal");
                }}
              >
                Submit corrupted salt
              </button>
            </div>
          ) : (
            <p className="hint">{busy ?? "Waiting on the other seal. Positions update only when the account does."}</p>
          )}
          {account.phase !== PHASE_FINISHED ? (
            <button
              type="button"
              className="ghost-btn"
              disabled={!signer || Boolean(busy)}
              onClick={() =>
                signer &&
                programId &&
                void run("Enforce timeout", () =>
                  sendInstruction(cluster, signer, timeoutIx(new PublicKey(programId), new PublicKey(matchPk))),
                )
              }
            >
              Enforce on-chain timeout
            </button>
          ) : null}
        </PlayTable>
      )}
    </section>
  );
}

function phaseTitle(phase: number) {
  if (phase === PHASE_COMMIT) return "Seal phase";
  if (phase === PHASE_REVEAL) return "Reveal phase";
  if (phase === PHASE_FINISHED) return "Match finished";
  return "Ledger";
}

function accountSnap(account: MatchAccount): Snap {
  return {
    posA: account.posA,
    posB: account.posB,
    hpA: account.hpA,
    hpB: account.hpB,
    phase: account.phase,
    turn: account.turn,
    winner: account.winner,
    lastFlags: account.lastFlags,
    lastDamageA: account.lastDamageA,
    lastDamageB: account.lastDamageB,
    lastActionA: account.lastActionA,
    lastActionB: account.lastActionB,
  };
}
