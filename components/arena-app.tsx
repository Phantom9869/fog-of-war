"use client";

import "@/lib/polyfill";
import Link from "next/link";
import { useState } from "react";
import { ChainDuel } from "@/components/chain-duel";
import { PracticeView } from "@/components/practice-view";

type Screen = "gate" | "practice" | "chain";

export function ArenaApp() {
  const [screen, setScreen] = useState<Screen>("gate");
  if (screen === "practice") return <PracticeView onLeave={() => setScreen("gate")} />;
  if (screen === "chain") return <ChainDuel onLeave={() => setScreen("gate")} />;
  return (
    <main className="gate">
      <p className="kicker">Midnight arena</p>
      <h1>
        Fog of <span>War</span>
      </h1>
      <p className="lede">
        Seal one order. The rival seals another. Solana opens both. The stone board stays public. Only the current order is hidden.
      </p>
      <div className="choices">
        <button type="button" onClick={() => setScreen("practice")}>
          <span>01</span>
          <strong>Practice lane</strong>
          <em>No wallet. A fixed-policy rival seals first, inside this browser only.</em>
        </button>
        <button type="button" onClick={() => setScreen("chain")}>
          <span>02</span>
          <strong>Ledger duel</strong>
          <em>Local validator or devnet. Real signatures only. The fixed-policy rival is a separate process.</em>
        </button>
      </div>
      <ul className="rules inline">
        <li>Advance one square.</li>
        <li>Strike the next square if they are still there.</li>
        <li>Guard and cancel the hit.</li>
        <li>Same square or a swap: both hold.</li>
      </ul>
      <p className="foot">
        <Link href="/audit">Red-team the contract</Link>
        <span>Test validator and devnet only. No wagers.</span>
      </p>
    </main>
  );
}
