"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect } from "react";
import { ACTION_ATTACK, ACTION_GUARD, ACTION_MOVE, DIR_NONE } from "@/lib/constants";
import { step, validateAction } from "@/lib/rules";

const CARDS = [
  {
    kind: ACTION_MOVE,
    name: "Advance",
    text: "Move one square.",
    icon: "/assets/ui/advance.png",
  },
  {
    kind: ACTION_ATTACK,
    name: "Strike",
    text: "Hit the next square.",
    icon: "/assets/ui/strike.png",
  },
  {
    kind: ACTION_GUARD,
    name: "Guard",
    text: "Defend against incoming hits.",
    icon: "/assets/ui/guard.png",
  },
];

const DIRS = [
  { dir: 0, label: "North", short: "N", style: { gridColumn: 2, gridRow: 1 } },
  { dir: 3, label: "West", short: "W", style: { gridColumn: 1, gridRow: 2 } },
  { dir: 1, label: "East", short: "E", style: { gridColumn: 3, gridRow: 2 } },
  { dir: 2, label: "South", short: "S", style: { gridColumn: 2, gridRow: 3 } },
];

export function ActionPad({
  pos,
  kind,
  dir,
  onKind,
  onDir,
  disabled,
  locked,
  onLocked,
  confirmLabel,
  confirmHint,
  onConfirm,
  busy,
}: {
  pos: number;
  kind: number | null;
  dir: number | null;
  onKind: (kind: number) => void;
  onDir: (dir: number) => void;
  disabled?: boolean;
  locked?: boolean;
  onLocked?: () => void;
  confirmLabel: string;
  confirmHint: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const legal = (nextKind: number, nextDir: number) => {
    try {
      validateAction(pos, { kind: nextKind, dir: nextDir });
      return true;
    } catch {
      return false;
    }
  };
  const ready = !locked && (kind === ACTION_GUARD || (kind !== null && dir !== null && dir !== DIR_NONE));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select")) return;
      if (disabled || locked || kind === null || kind === ACTION_GUARD) return;
      const map: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
      const next = map[event.key];
      if (next === undefined) return;
      try {
        validateAction(pos, { kind, dir: next });
      } catch {
        return;
      }
      event.preventDefault();
      onDir(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, locked, kind, onDir, pos]);
  const pick = (nextKind: number) => {
    if (locked) {
      onLocked?.();
      return;
    }
    onKind(nextKind);
    if (nextKind === ACTION_GUARD) onDir(DIR_NONE);
  };
  return (
    <div className="pad">
      <div className="kinds" role="group" aria-label="Orders">
        {CARDS.map((card) => (
          <button
            key={card.kind}
            type="button"
            className={`ability${kind === card.kind ? " on" : ""}`}
            aria-pressed={kind === card.kind}
            disabled={disabled}
            onClick={() => pick(card.kind)}
          >
            <img src={card.icon} alt="" width={32} height={32} />
            <span className="ability-copy">
              <strong>{card.name}</strong>
              <span>{card.text}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="cross" role="group" aria-label="Direction">
        {DIRS.map((item) => {
          const allowed = !locked && kind !== null && kind !== ACTION_GUARD && legal(kind, item.dir);
          return (
            <button
              key={item.dir}
              type="button"
              style={item.style}
              className={dir === item.dir ? "on" : ""}
              aria-label={item.label}
              aria-pressed={dir === item.dir}
              disabled={disabled || !allowed}
              onClick={() => onDir(item.dir)}
            >
              {item.short}
            </button>
          );
        })}
        <span className="cross-core">{kind === ACTION_GUARD ? "Hold" : "Aim"}</span>
      </div>
      <button
        type="button"
        className="confirm seal"
        disabled={disabled || busy || (!locked && !ready)}
        onClick={() => (locked ? onLocked?.() : onConfirm())}
      >
        <img src="/assets/ui/lock.png" alt="" width={16} height={16} />
        {busy ? "Waiting on a signature…" : confirmLabel}
      </button>
      <p className="hint">{confirmHint}</p>
      {kind === ACTION_MOVE && dir !== null && dir <= 3 ? (
        <p className="hint">The gold square is only your aim. It stays off the record until you seal.</p>
      ) : null}
      {kind === ACTION_ATTACK && dir !== null && dir <= 3 ? (
        <p className="hint">Strike lights {step(pos, dir) ?? "that square"}. It hits only if they are still there after movement.</p>
      ) : null}
    </div>
  );
}

export function legalCells(pos: number, kind: number | null): number[] {
  if (kind !== ACTION_MOVE && kind !== ACTION_ATTACK) return [];
  const cells: number[] = [];
  for (const dir of [0, 1, 2, 3]) {
    try {
      validateAction(pos, { kind, dir });
      const dest = step(pos, dir);
      if (dest !== null) cells.push(dest);
    } catch {
      /* illegal directions stay dark */
    }
  }
  return cells;
}
