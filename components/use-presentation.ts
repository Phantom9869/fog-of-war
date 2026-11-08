"use client";

import { useEffect, useRef, useState } from "react";
import { cueBetween, snapKey, type Cue, type Snap } from "@/lib/cues";
import { beatsForCue, claimCue, placesForBeat, type Beat } from "@/lib/timeline";

export type Presentation = {
  a: number;
  b: number;
  cue: Cue | null;
  beat: Beat | null;
};

export function usePresentation(snap: Snap): Presentation {
  const key = snapKey(snap);
  const snapRef = useRef(snap);
  const prev = useRef<Snap | null>(null);
  const seen = useRef(new Set<string>());
  const [view, setView] = useState<Presentation>({
    a: snap.posA,
    b: snap.posB,
    cue: null,
    beat: null,
  });

  useEffect(() => {
    snapRef.current = snap;
  });

  useEffect(() => {
    const next = snapRef.current;
    const before = prev.current;
    prev.current = next;
    const timers: number[] = [];
    let cancelled = false;
    const apply = (value: Presentation) => {
      if (!cancelled) setView(value);
    };
    const settle = () => apply({ a: next.posA, b: next.posB, cue: null, beat: null });
    if (!before) {
      queueMicrotask(settle);
      return () => {
        cancelled = true;
      };
    }
    const cue = cueBetween(before, next);
    if (!cue || !claimCue(seen.current, cue.id)) {
      queueMicrotask(settle);
      return () => {
        cancelled = true;
      };
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const steps = beatsForCue(cue, reduced);
    for (const step of steps) {
      timers.push(
        window.setTimeout(() => {
          const place = placesForBeat(cue, step.beat);
          apply({ a: place.a, b: place.b, cue, beat: step.beat });
        }, step.ms),
      );
    }
    const doneAt = (steps[steps.length - 1]?.ms ?? 0) + (reduced ? 200 : 900);
    timers.push(window.setTimeout(settle, doneAt));
    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [key]);

  return view;
}
