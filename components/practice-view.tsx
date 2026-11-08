"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionPad, legalCells } from "@/components/action-pad";
import { PlayTable } from "@/components/play-table";
import {
  ACTION_ATTACK,
  ACTION_GUARD,
  ACTION_MOVE,
  DIR_NONE,
  PHASE_COMMIT,
  PHASE_FINISHED,
  PHASE_REVEAL,
} from "@/lib/constants";
import type { Snap } from "@/lib/cues";
import { winnerLine } from "@/lib/describe";
import {
  createPractice,
  revealPractice,
  sealHuman,
  timeoutPractice,
  type LocalMatch,
} from "@/lib/local-match";
import { step } from "@/lib/rules";
import { play } from "@/components/sound";

export function PracticeView({ onLeave }: { onLeave: () => void }) {
  const [match, setMatch] = useState<LocalMatch>(() => createPractice());
  const [kind, setKind] = useState<number | null>(null);
  const [dir, setDir] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "1") setKind(ACTION_MOVE);
      if (event.key === "2") setKind(ACTION_ATTACK);
      if (event.key === "3") {
        setKind(ACTION_GUARD);
        setDir(DIR_NONE);
      }
      const map: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
      if (event.key in map) setDir(map[event.key]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const left = Math.max(0, match.deadline - now);
  const legal = useMemo(
    () => (match.phase === PHASE_COMMIT ? legalCells(match.posA, kind) : []),
    [kind, match.phase, match.posA],
  );
  const selected = kind !== null && dir !== null && dir <= 3 ? step(match.posA, dir) : null;
  const snap: Snap = {
    posA: match.posA,
    posB: match.posB,
    hpA: match.hpA,
    hpB: match.hpB,
    phase: match.phase,
    turn: match.turn,
    winner: match.winner,
    lastFlags: match.lastFlags,
    lastDamageA: match.lastDamageA,
    lastDamageB: match.lastDamageB,
    lastActionA: match.lastActionA,
    lastActionB: match.lastActionB,
  };

  const act = (fn: () => LocalMatch) => {
    try {
      setError(null);
      setMatch(fn());
      setKind(null);
      setDir(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The practice lane rejected that.");
    }
  };

  return (
    <PlayTable
      mode="browser"
      snap={snap}
      youAreA
      nameA="Warden"
      nameB="Wraith"
      youSealed={Boolean(match.commitA)}
      rivalSealed={Boolean(match.commitB)}
      clock={{ kind: "practice", leftMs: left, totalMs: match.windowMs }}
      legal={legal}
      selected={selected}
      aim={kind === ACTION_ATTACK ? "attack" : kind === ACTION_MOVE ? "move" : null}
      notice="Browser practice. The fixed-policy rival sealed from the public board before you chose. That lock is only inside this tab, not a Solana deadline and not a private opponent."
      log={<Log lines={match.log} />}
    >
      {match.phase === PHASE_FINISHED ? (
        <div className="verdict">
          <h3>{winnerLine(match.winner, true)}</h3>
          <button type="button" className="confirm" onClick={() => act(() => createPractice())}>
            Rematch
          </button>
        </div>
      ) : match.phase === PHASE_COMMIT ? (
        <ActionPad
          pos={match.posA}
          kind={kind}
          dir={dir}
          onKind={setKind}
          onDir={setDir}
          confirmLabel="Seal order"
          confirmHint="Locks in this browser only. Not a Solana transaction."
          onConfirm={() => {
            if (kind === null) return;
            act(() => {
              const next = sealHuman(match, { kind, dir: kind === ACTION_GUARD ? DIR_NONE : dir ?? DIR_NONE });
              play("seal");
              return next;
            });
          }}
        />
      ) : (
        <div className="reveal-box">
          <p>Both orders are sealed in this browser. Opening them runs the same resolution the program uses.</p>
          <ActionPad
            pos={match.posA}
            kind={kind}
            dir={dir}
            onKind={setKind}
            onDir={setDir}
            locked
            onLocked={() => setError("MOVE CHANGE REJECTED. You already sealed this turn. The order cannot be replaced.")}
            confirmLabel="Sealed"
            confirmHint="Locks in this browser only. Not a Solana transaction."
            onConfirm={() => setError("MOVE CHANGE REJECTED. You already sealed this turn. The order cannot be replaced.")}
          />
          <button type="button" className="confirm" onClick={() => act(() => revealPractice(match))}>
            Open seals
          </button>
        </div>
      )}
      {error ? <p className="error">{error}</p> : null}
      <div className="seals">
        <Seal who="You" value={match.commitA} state={match.phase === PHASE_FINISHED ? "Done" : sealState(match.phase, Boolean(match.commitA), match.revealedA)} />
        <Seal who="Rival" value={match.phase === PHASE_FINISHED ? null : match.commitB} state={match.phase === PHASE_FINISHED ? "Done" : match.commitB ? "Sealed" : "Choosing"} />
      </div>
      {match.phase !== PHASE_FINISHED ? (
        <button type="button" className="ghost-btn" disabled={left > 0} onClick={() => act(() => timeoutPractice(match))}>
          {left > 0 ? "Practice timeout waits for this clock" : "Enforce practice timeout"}
        </button>
      ) : null}
      <button type="button" className="text-btn" onClick={onLeave}>
        Leave lane
      </button>
    </PlayTable>
  );
}

function sealState(phase: number, sealed: boolean, revealed: boolean) {
  if (phase === PHASE_REVEAL && revealed) return "Revealed";
  if (sealed) return "Sealed";
  return "Choosing";
}

function Seal({ who, value, state }: { who: string; value: string | null; state: string }) {
  return (
    <div className="seal">
      <span>{who}</span>
      <strong>{state}</strong>
      <code>{value ? `${value.slice(0, 10)}…` : "—"}</code>
    </div>
  );
}

function Log({ lines }: { lines: { turn: number; text: string; tone: string }[] }) {
  return (
    <ol className="log">
      {[...lines].reverse().map((line, index) => (
        <li key={`${line.turn}-${index}`} className={line.tone}>
          {line.text}
        </li>
      ))}
    </ol>
  );
}
