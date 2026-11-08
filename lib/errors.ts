export const FOG_ERRORS: Record<number, string> = {
  0: "That signer is not in this match.",
  1: "That action is not legal in the current phase.",
  2: "This turn is already sealed.",
  3: "This turn is already revealed.",
  4: "Reveal does not match the sealed commitment.",
  5: "That action is illegal on this board.",
  6: "The deadline has not passed.",
  7: "The match is already over.",
  8: "The action encoding is malformed.",
  9: "The two players must be different.",
  10: "Turn window must be between 15 and 180 seconds.",
  11: "The account is not a Fog of War match.",
  12: "The deadline has passed. Enforce the timeout instead.",
};

export function explainProgramError(error: unknown): string {
  const text = error instanceof Error ? `${error.message}\n${"logs" in error ? String((error as { logs?: unknown }).logs) : ""}` : String(error);
  const hex = text.match(/custom program error: 0x([0-9a-f]+)/i);
  if (hex) {
    const code = Number.parseInt(hex[1], 16);
    return FOG_ERRORS[code] ?? `The program rejected the transaction (code ${code}).`;
  }
  const dec = text.match(/Custom\((\d+)\)/);
  if (dec) {
    const code = Number(dec[1]);
    return FOG_ERRORS[code] ?? `The program rejected the transaction (code ${code}).`;
  }
  if (/User rejected|rejected the request/i.test(text)) return "The wallet declined the signature.";
  if (/failed to fetch|NetworkError|ECONNREFUSED|429/i.test(text)) return "The RPC endpoint did not answer.";
  const line = text.split("\n").map((l) => l.trim()).find(Boolean);
  return line?.slice(0, 280) || "The transaction failed.";
}
