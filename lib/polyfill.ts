import { Buffer } from "buffer";

const g = globalThis as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;
