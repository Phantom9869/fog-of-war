"use client";

import { useEffect, useState } from "react";

let muted = true;
const listeners = new Set<(value: boolean) => void>();

export function play(name: "click" | "seal" | "hit" | "block" | "win") {
  if (muted || typeof Audio === "undefined") return;
  const audio = new Audio(`/assets/audio/${name}.wav`);
  audio.volume = 0.35;
  void audio.play().catch(() => undefined);
}

export function SoundToggle() {
  const [off, setOff] = useState(true);
  useEffect(() => {
    const sync = (value: boolean) => setOff(value);
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return (
    <button
      type="button"
      className="sound-btn"
      aria-pressed={!off}
      onClick={() => {
        muted = !muted;
        for (const listener of listeners) listener(muted);
        if (!muted) play("click");
      }}
    >
      {off ? "Sound off" : "Sound on"}
    </button>
  );
}
