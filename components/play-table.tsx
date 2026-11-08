"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Board } from "@/components/board";
import { Hero } from "@/components/sprites";
import { SoundToggle, play } from "@/components/sound";
import { PHASE_FINISHED, WIN_DRAW, WIN_NONE } from "@/lib/constants";
import { phaseLabel, type Snap } from "@/lib/cues";
import { shownHp } from "@/lib/timeline";
import { usePresentation } from "@/components/use-presentation";

export function PlayTable({
  mode,
  snap,
  youAreA,
  nameA,
  nameB,
  youSealed,
  rivalSealed,
  clock,
  legal,
  selected,
  aim,
  notice,
  children,
  log,
}: {
  mode: "browser" | "localnet" | "devnet";
  snap: Snap;
  youAreA: boolean | null;
  nameA: string;
  nameB: string;
  youSealed: boolean;
  rivalSealed: boolean;
  clock: { kind: "practice" | "chain"; leftMs: number; totalMs: number } | null;
  legal: number[];
  selected: number | null;
  aim?: "move" | "attack" | null;
  notice?: string | null;
  children: ReactNode;
  log: ReactNode;
}) {
  const view = usePresentation(snap);
  const heard = useRef<string | null>(null);
  useEffect(() => {
    if (!view.cue || view.beat !== "impact" || heard.current === view.cue.id) return;
    heard.current = view.cue.id;
    if (view.cue.hitA || view.cue.hitB) play("hit");
    else if (view.cue.blockedA || view.cue.blockedB) play("block");
  }, [view.cue, view.beat]);
  const finished = useRef(0);
  useEffect(() => {
    if (snap.winner !== 0 && finished.current !== snap.winner) {
      finished.current = snap.winner;
      play("win");
    }
  }, [snap.winner]);
  const hpA = shownHp(snap.hpA, view.cue?.dmgA ?? 0, view.beat);
  const hpB = shownHp(snap.hpB, view.cue?.dmgB ?? 0, view.beat);
  const winner = !view.beat || view.beat === "complete" ? snap.winner : 0;
  const beatCopy: Record<string, string> = {
    highlight: "Orders open",
    orders: "Orders revealed",
    move: "Moving",
    clash: "Clash",
    impact: "Impact",
    complete: "Round complete",
  };
  const label = view.beat
    ? beatCopy[view.beat]
    : phaseLabel({
        phase: snap.phase,
        youSealed,
        rivalSealed,
        resolving: false,
        winner: snap.winner,
      });
  const modeCopy =
    mode === "browser"
      ? "Browser practice"
      : mode === "localnet"
        ? "Local validator · account verified"
        : "Devnet";
  return (
    <section className="table">
      <header className="hud">
        <Portrait team="a" name={nameA} hp={hpA} you={youAreA === true} />
        <div className="hud-mid">
          <p className="kicker">Fog of War</p>
          <strong className="phase" aria-live="polite">{label}</strong>
          <span className="round">{modeCopy} · Round {snap.turn}</span>
        </div>
        <Portrait team="b" name={nameB} hp={hpB} you={youAreA === false} />
        {clock ? <ClockChip clock={clock} done={snap.phase === PHASE_FINISHED} /> : null}
        <SoundToggle />
      </header>
      <div className="stage">
        <Board
          posA={view.a}
          posB={view.b}
          hpA={hpA}
          hpB={hpB}
          labelA={nameA}
          labelB={nameB}
          winner={winner}
          legal={legal}
          selected={selected}
          aim={aim}
          cue={view.cue}
          beat={view.beat}
        />
        {view.beat === "orders" && view.cue && !view.cue.timeout ? (
          <p className="banner">{orderLine(nameA, snap.lastActionA)} · {orderLine(nameB, snap.lastActionB)}</p>
        ) : null}
        {view.cue?.timeout && view.beat ? <p className="banner">The deadline closed the round. No blow was invented.</p> : null}
        {snap.phase === PHASE_FINISHED && snap.winner !== WIN_NONE ? (
          <p className={`banner end w${snap.winner}`}>{snap.winner === WIN_DRAW ? "Draw" : "The arena is decided"}</p>
        ) : null}
      </div>
      <aside className="side">
        {children}
        <details className="log-fold">
          <summary>Battle log</summary>
          {notice ? <p className="trust">{notice}</p> : null}
          {log}
        </details>
      </aside>
    </section>
  );
}

function orderLine(name: string, action: number) {
  if (action === 0) return `${name} advances`;
  if (action === 1) return `${name} strikes`;
  if (action === 2) return `${name} guards`;
  return `${name} holds`;
}

function Portrait({ team, name, hp, you }: { team: "a" | "b"; name: string; hp: number; you: boolean }) {
  return (
    <div className={`portrait team-${team}`}>
      <Hero who={team === "a" ? "warden" : "wraith"} pose={hp <= 0 ? "defeat" : "idle"} />
      <div>
        <strong>{you ? "You" : name}</strong>
        <span className="hearts" aria-label={`${hp} of 3 health`}>
          {[0, 1, 2].map((pip) => (
            <i key={pip} className={pip < hp ? "full" : "empty"} />
          ))}
        </span>
      </div>
    </div>
  );
}

function ClockChip({
  clock,
  done,
}: {
  clock: { kind: "practice" | "chain"; leftMs: number; totalMs: number };
  done: boolean;
}) {
  const total = Math.max(1, clock.totalMs);
  const left = Math.max(0, clock.leftMs);
  const label = clock.kind === "practice" ? "Practice clock" : "Chain deadline";
  return (
    <div className={`timer${left === 0 ? " due" : ""}`} aria-label={label}>
      <span>{done ? "Closed" : formatClock(left)}</span>
      <small>{label}</small>
      <i style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
    </div>
  );
}

function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}
