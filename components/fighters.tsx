import type { ReactElement } from "react";

const INK = "#10141c";
const BOOT = "#2a1c12";
const GOLD = "#e7b15a";
const STEEL = "#f4fff8";

const CYAN = { d: "#0c3a44", m: "#168a96", l: "#7af6ea", e: "#062028" };
const VIOLET = { d: "#2a1848", m: "#5a3ca8", l: "#d9ccff", e: "#efe7ff" };

function grid(rows: string[], palette: Record<string, string>) {
  const h = rows.length;
  const w = Math.max(...rows.map((row) => row.length));
  const rects: ReactElement[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const fill = palette[row[x]];
      if (!fill) continue;
      rects.push(<rect key={`${x}-${y}-${row[x]}`} x={x} y={y} width="1" height="1" fill={fill} />);
    }
  });
  return { w, h, rects };
}

function Sprite({
  rows,
  palette,
  className,
}: {
  rows: string[];
  palette: Record<string, string>;
  className?: string;
}) {
  const { w, h, rects } = grid(rows, palette);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`pixel ${className ?? ""}`} shapeRendering="crispEdges" aria-hidden>
      {rects}
    </svg>
  );
}

function warden(frame: "idle" | "idle2" | "walk" | "strike" | "guard" | "hit"): string[] {
  const bob = frame === "idle2" ? 1 : 0;
  const legs = frame === "walk" ? ["......b.d..d....", "......d..d.b...."] : ["......b.d..d.b..", "......d.d..d.d.."];
  if (frame === "strike") {
    return [
      "................",
      "......kkkk......",
      ".....kllllk.....",
      "....klcccclk....",
      "....kleeeelk....",
      "....kllllllk....",
      ".....kddddk.....",
      "....kddddddkwwww",
      "...kkdccdcdkgggw",
      "....kdccccdk..w.",
      "....kddddddk....",
      ...legs,
    ];
  }
  if (frame === "guard") {
    return [
      "................",
      "......kkkk......",
      ".....kllllk.....",
      "....klcccclk....",
      "....kleeeelk....",
      "....kllllllk....",
      ".....kddddkHHH..",
      "....kddddddHHHH.",
      "...kkdccdcdkHHH.",
      "....kdccccdk.H..",
      "....kddddddk....",
      ...legs,
    ];
  }
  if (frame === "hit") {
    return [
      "................",
      ".......kkkk.....",
      "......kllllk....",
      ".....klcccclk...",
      ".....klxexxlk...",
      ".....kllllllk...",
      "......kddddk....",
      ".....kddddddk...",
      "....kkdccdcdkk..",
      ".....kdccccdk...",
      ".....kddddddk...",
      "......bd..db....",
      "......d....d....",
    ];
  }
  return [
    bob ? "................" : "................",
    bob ? "......kllk......" : "......kkkk......",
    ".....kllllk.....",
    "....klcccclk....",
    "....kleeeelk....",
    "....kllllllk....",
    ".....kddddk.w...",
    "....kddddddkw...",
    "...kkdccdcdk.w..",
    "....kdccccdk....",
    "....kddddddk....",
    ...legs,
  ];
}

function wraith(frame: "idle" | "idle2" | "walk" | "strike" | "guard" | "hit"): string[] {
  const legs = frame === "walk" ? ["......b.d..d....", "......d..d.b...."] : ["......b.d..d.b..", "......d.d..d.d.."];
  if (frame === "strike") {
    return [
      "....n......n....",
      "......kkkk......",
      ".....kllllk.....",
      "....klmmmmlk....",
      "....kleeeelk....",
      "....kllllllk....",
      ".....kddddk.....",
      "....kddddddk.ccc",
      "...kkdmdmdkkccg.",
      "....kdmmmmmk.c..",
      "....kddddddk....",
      ...legs,
    ];
  }
  if (frame === "guard") {
    return [
      "....n......n....",
      "......kkkk......",
      ".....kllllk.....",
      "....klmmmmlk....",
      "....kleeeelk....",
      "....kllllllHHHH.",
      ".....kddddHHHH..",
      "....kddddddHHH..",
      "...kkdmdmdkHH...",
      "....kdmmmmmk....",
      "....kddddddk....",
      ...legs,
    ];
  }
  if (frame === "hit") {
    return [
      ".....n....n.....",
      ".......kkkk.....",
      "......kllllk....",
      ".....klmmmmlk...",
      ".....klxexxlk...",
      ".....kllllllk...",
      "......kddddk....",
      ".....kddddddk...",
      "....kkdmdmdkk...",
      ".....kdmmmmmk...",
      ".....kddddddk...",
      "......bd..db....",
      "......d....d....",
    ];
  }
  const horn = frame === "idle2" ? "....n.n..n.n...." : "....n......n....";
  return [
    horn,
    "......kkkk......",
    ".....kllllk.....",
    "....klmmmmlk....",
    "....kleeeelk....",
    "....kllllllk....",
    ".....kddddk.c...",
    "....kddddddkc...",
    "...kkdmdmdkk.c..",
    "....kdmmmmmk....",
    "....kddddddk....",
    ...legs,
  ];
}

const wardenPalette = {
  k: INK,
  l: CYAN.l,
  c: CYAN.m,
  d: CYAN.d,
  e: CYAN.e,
  w: STEEL,
  g: GOLD,
  b: BOOT,
  H: "#bffcf3",
  x: "#ff5d73",
};

const wraithPalette = {
  k: INK,
  l: VIOLET.l,
  m: VIOLET.m,
  d: VIOLET.d,
  e: VIOLET.e,
  c: "#efe7ff",
  g: GOLD,
  b: BOOT,
  n: VIOLET.l,
  H: "#efe7ff",
  x: "#ff5d73",
};

export type Pose = "idle" | "walk" | "strike" | "guard" | "hit";

export function Warden({ className = "", pose = "idle" }: { className?: string; pose?: Pose }) {
  const frame = pose === "idle" ? "idle" : pose;
  return (
    <span className={`pix-actor ${className}`}>
      <Sprite rows={warden(frame === "idle" ? "idle" : frame)} palette={wardenPalette} className="f1" />
      {pose === "idle" ? <Sprite rows={warden("idle2")} palette={wardenPalette} className="f2" /> : null}
    </span>
  );
}

export function Wraith({ className = "", pose = "idle" }: { className?: string; pose?: Pose }) {
  return (
    <span className={`pix-actor ${className}`}>
      <Sprite rows={wraith(pose === "idle" ? "idle" : pose)} palette={wraithPalette} className="f1" />
      {pose === "idle" ? <Sprite rows={wraith("idle2")} palette={wraithPalette} className="f2" /> : null}
    </span>
  );
}

function icon(rows: string[]) {
  return <Sprite rows={rows} palette={{ k: "currentColor", l: "currentColor", d: "currentColor" }} />;
}

export function AdvanceIcon() {
  return icon(["..ll..", ".llll.", "llllll", "..ll..", "..ll..", "..ll..", "..ll.."]);
}

export function StrikeIcon() {
  return icon(["l.....", ".l....", "..l...", "...l..", "....l.", "ll..l.", ".llll."]);
}

export function GuardIcon() {
  return icon([".llll.", "ll..ll", "ll..ll", "ll..ll", ".llll.", "..ll.."]);
}

export function TileArt({ variant = 0 }: { variant?: number }) {
  const crack = variant === 1 ? "......kk........" : variant === 2 ? "........kk......" : "................";
  return (
    <Sprite
      className="tile-art"
      palette={{ k: "#121826", d: "#243044", m: "#3c4c66", l: "#7d8da6", g: "#2f463c" }}
      rows={[
        "dddddddddddddddd",
        "dmlmmlmllmmlmmmd",
        "dmllmmllmmlllmmd",
        "dmmlllmmlllmlmmd",
        "dmllmmlmmlmllmmd",
        crack,
        "dmmlmlllmmlllmmd",
        "dmlllgmlllmllmmd",
        "dmlmmlllmmlmllmd",
        "dmmmmmmmmmmmmmmd",
        "dddddddddddddddd",
      ]}
    />
  );
}

export function PillarArt() {
  return (
    <Sprite
      className="pillar-art"
      palette={{ k: "#1a140f", d: "#3a2e24", m: "#6a5340", l: "#c4a27a", f: "#e7b15a" }}
      rows={[
        "....kkkkkk......",
        "...kmmmmmmk.....",
        "...kmlllmmlk....",
        "....kmmmmk......",
        "...kkddddkk.....",
        "..kmmmmmmmmk....",
        "..kmlfffllmk....",
        "..kmmmmmmmmk....",
        "...kddddddk.....",
        "..kmmmmmmmmk....",
        ".kmmmmmmmmmmk...",
        "kkkkkkkkkkkkkk..",
      ]}
    />
  );
}

export function Torch() {
  return (
    <Sprite
      className="torch"
      palette={{ k: "#2a1c12", f: "#fff6d0", a: "#e7b15a", r: "#c4553a", d: "#3a2a18" }}
      rows={["..ff..", ".faaf.", ".frrf.", "..kk..", "..kk..", ".dddd."]}
    />
  );
}

export function poseFor(
  team: "a" | "b",
  cue: { slashA: boolean; slashB: boolean; guardA: boolean; guardB: boolean; hitA: boolean; hitB: boolean; fromA: number; toA: number; fromB: number; toB: number } | null,
  hp: number,
): Pose {
  if (hp <= 0) return "hit";
  if (!cue) return "idle";
  const hit = team === "a" ? cue.hitA : cue.hitB;
  const slash = team === "a" ? cue.slashA : cue.slashB;
  const guard = team === "a" ? cue.guardA : cue.guardB;
  const from = team === "a" ? cue.fromA : cue.fromB;
  const to = team === "a" ? cue.toA : cue.toB;
  if (hit) return "hit";
  if (slash) return "strike";
  if (guard) return "guard";
  if (from !== to) return "walk";
  return "idle";
}
