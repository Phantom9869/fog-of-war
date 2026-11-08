import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { explainProgramError } from "./errors";

export type ClusterName = "localnet" | "devnet";

export const RPC_URL: Record<ClusterName, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
};

export type ProgramConfig = {
  programId: string;
  cluster?: string;
  rpc?: string;
};

export async function loadProgramConfig(): Promise<ProgramConfig | null> {
  try {
    const res = await fetch("/program.json", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as ProgramConfig;
    if (!json.programId) return null;
    return json;
  } catch {
    return null;
  }
}

export function connectionFor(cluster: ClusterName): Connection {
  return new Connection(RPC_URL[cluster], "confirmed");
}

export async function rpcSlot(cluster: ClusterName): Promise<number> {
  return connectionFor(cluster).getSlot("confirmed");
}

export async function programIsDeployed(cluster: ClusterName, programId: string): Promise<boolean> {
  const info = await connectionFor(cluster).getAccountInfo(new PublicKey(programId));
  return Boolean(info?.executable);
}

export type WalletSigner = {
  publicKey: PublicKey;
  sign: (tx: Transaction) => Promise<Transaction>;
};

export async function sendInstruction(
  cluster: ClusterName,
  signer: WalletSigner,
  instruction: TransactionInstruction,
): Promise<string> {
  const connection = connectionFor(cluster);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: signer.publicKey, recentBlockhash: blockhash }).add(instruction);
  let signed: Transaction;
  try {
    signed = await signer.sign(tx);
  } catch (error) {
    throw new Error(explainProgramError(error));
  }
  const raw = signed.serialize();
  let signature: string;
  try {
    signature = await connection.sendRawTransaction(raw, { skipPreflight: false });
  } catch (error) {
    throw new Error(explainProgramError(error));
  }
  const result = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) {
    throw new Error(`Transaction ${signature} failed on-chain: ${JSON.stringify(result.value.err)}`);
  }
  return signature;
}

export function ephemeralSigner(keypair: Keypair): WalletSigner {
  return {
    publicKey: keypair.publicKey,
    sign: async (tx) => {
      tx.sign(keypair);
      return tx;
    },
  };
}

export function explorerTx(signature: string, cluster: ClusterName): string | null {
  if (cluster !== "devnet") return null;
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export async function airdrop(cluster: ClusterName, pubkey: PublicKey, sol = 2): Promise<string> {
  if (cluster !== "localnet") {
    throw new Error("This app only requests airdrops from a local test validator.");
  }
  const connection = connectionFor(cluster);
  const sig = await connection.requestAirdrop(pubkey, sol * 1_000_000_000);
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string; toBytes(): Uint8Array };
  connect: () => Promise<{ publicKey: { toString(): string; toBytes(): Uint8Array } }>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
};

export function phantomAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.solana?.signTransaction);
}

export async function connectPhantom(): Promise<WalletSigner> {
  const provider = window.solana;
  if (!provider?.signTransaction) {
    throw new Error("No injected wallet on this page. Install Phantom, or use an ephemeral local key.");
  }
  const result = await provider.connect();
  const raw = result.publicKey.toBytes();
  const publicKey = new PublicKey(raw);
  return {
    publicKey,
    sign: (tx) => provider.signTransaction(tx),
  };
}
