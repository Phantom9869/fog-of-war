# Demo runbook

Local validator only. The board is public. Only the current order is hidden, and only until both seats reveal. Practice mode never sends a transaction. These three demos do.

Start the validator and the program once:

```bash
bash scripts/localnet.sh
```

The program id is whatever `public/program.json` says, on `http://127.0.0.1:8899`. Signatures from that process are not devnet explorer links. They disappear when the validator stops. A rejected transaction that fails in simulation has no signature. Do not invent one.

No wallet is required. The script signs with ephemeral keys that stay in memory.

```bash
mkdir -p evidence
npm run demo:local
```

That writes `evidence/localnet-abc.json`.

## A. Commit, reveal, combat

Two seats. Turn 1 both advance toward the center. Turn 2 west strikes east and east steps onto that square. Expected account: positions 11 and 12, east health 2, hit flag set. The browser then plays highlight, revealed orders, the walk, the swing, the damage number, then Round complete. None of that changes the account.

## B. Sealed order cannot be replaced

West commits Advance east. West then submits Guard. Expected rejection: program error `0x2` (already sealed). The stored hash is identical before and after. The browser copy for that rejection is `MOVE CHANGE REJECTED`. Practice mode shows the same words for a browser lock and says it is not a Solana transaction.

## C. Missed reveal forfeits

Both commit. Only west reveals. A timeout sent before the deadline is rejected with `0x6`. After the reveal deadline, the timeout transaction finishes the match. Expected: winner west, phase finished, timeout flag, positions still 10 and 14, damage 0. That is not a commit-phase timeout. The rival withheld the reveal.

Practice uses a browser clock labeled Practice clock. These demos use the validator clock.

## Browser

```bash
npm run dev
```

Open `http://127.0.0.1:3847`. Practice lane for the animation. Ledger duel for a wallet. This environment has no Phantom, so the judge-facing chain proof is `npm run demo:local`, not a clicked wallet.
