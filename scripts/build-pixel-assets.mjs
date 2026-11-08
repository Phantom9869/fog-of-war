/**
 * Original pixel assets for Fog of War.
 * No third-party sprites. Palette and silhouettes are authored here.
 * Run: node scripts/build-pixel-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const root = path.resolve("public/assets");

const C = {
  none: null,
  ink: [8, 10, 16, 255],
  shadow: [0, 0, 0, 110],
  stoneD: [32, 36, 52, 255],
  stone: [78, 86, 108, 255],
  stoneL: [142, 152, 172, 255],
  stoneH: [206, 214, 224, 255],
  moss: [46, 78, 58, 255],
  mossL: [78, 120, 72, 255],
  wood: [62, 40, 28, 255],
  woodL: [110, 72, 42, 255],
  gold: [168, 118, 48, 255],
  goldL: [236, 196, 104, 255],
  cyanD: [8, 42, 52, 255],
  cyan: [18, 120, 132, 255],
  cyanL: [90, 230, 214, 255],
  cyanH: [214, 255, 248, 255],
  vioD: [36, 16, 48, 255],
  vio: [92, 48, 140, 255],
  vioL: [186, 150, 230, 255],
  vioH: [236, 220, 255, 255],
  crim: [120, 36, 48, 255],
  crimL: [210, 80, 78, 255],
  skin: [196, 150, 112, 255],
  flame: [255, 236, 170, 255],
  flameM: [232, 140, 48, 255],
  flameD: [160, 48, 28, 255],
  night: [18, 22, 48, 255],
  nightL: [42, 48, 88, 255],
  fog: [170, 180, 210, 90],
  green: [48, 120, 78, 255],
  greenL: [120, 200, 130, 255],
};

function canvas(w, h) {
  const png = new PNG({ width: w, height: h });
  return {
    w,
    h,
    png,
    set(x, y, c) {
      x = Math.round(x);
      y = Math.round(y);
      if (!c || x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) << 2;
      png.data[i] = c[0];
      png.data[i + 1] = c[1];
      png.data[i + 2] = c[2];
      png.data[i + 3] = c[3] ?? 255;
    },
    get(x, y) {
      const i = (y * w + x) << 2;
      return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
    },
    rect(x, y, rw, rh, c) {
      for (let yy = 0; yy < rh; yy += 1) for (let xx = 0; xx < rw; xx += 1) this.set(x + xx, y + yy, c);
    },
    plate(x, y, rw, rh, mid, light, dark) {
      this.rect(x, y, rw, rh, mid);
      this.rect(x, y, rw, 1, light);
      this.rect(x, y, 1, rh, light);
      this.rect(x, y + rh - 1, rw, 1, dark);
      this.rect(x + rw - 1, y, 1, rh, dark);
    },
    outline(x, y, rw, rh, c) {
      this.rect(x, y, rw, 1, c);
      this.rect(x, y + rh - 1, rw, 1, c);
      this.rect(x, y, 1, rh, c);
      this.rect(x + rw - 1, y, 1, rh, c);
    },
  };
}

function save(img, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(img.png));
}

function blit(dst, src, dx, dy, flip = false) {
  for (let y = 0; y < src.h; y += 1) {
    for (let x = 0; x < src.w; x += 1) {
      const sx = flip ? src.w - 1 - x : x;
      const c = src.get(sx, y);
      if (!c[3]) continue;
      dst.set(dx + x, dy + y, c);
    }
  }
}

function stamp(p, rows, paint, ox, oy) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const color = paint[row[x]];
      if (color) p.set(ox + x, oy + y, color);
    }
  });
}

function palette(team) {
  const wraith = team === "wraith";
  return {
    wraith,
    skin: wraith ? [214, 204, 228, 255] : [224, 176, 136, 255],
    skinD: wraith ? [132, 112, 160, 255] : [168, 114, 82, 255],
    helm: wraith ? [62, 40, 92, 255] : [64, 76, 94, 255],
    helmL: wraith ? [138, 108, 176, 255] : [158, 172, 188, 255],
    helmD: wraith ? [28, 14, 44, 255] : [30, 36, 46, 255],
    cloth: wraith ? [48, 18, 68, 255] : [14, 54, 70, 255],
    clothD: wraith ? [22, 8, 34, 255] : [8, 30, 42, 255],
    plate: wraith ? [84, 52, 118, 255] : [90, 102, 120, 255],
    plateL: wraith ? [156, 120, 196, 255] : [172, 186, 200, 255],
    accent: wraith ? [176, 90, 230, 255] : [36, 188, 198, 255],
    accentH: wraith ? [236, 200, 255, 255] : [168, 255, 244, 255],
    blade: wraith ? [198, 146, 255, 255] : [214, 228, 234, 255],
    bladeH: wraith ? [255, 228, 255, 255] : [110, 240, 230, 255],
    boot: wraith ? [32, 14, 44, 255] : [52, 34, 28, 255],
    gold: [214, 176, 92, 255],
  };
}

function legPair(p, colors, x, y, liftL, liftR, side) {
  const leg = (lx, lift) => {
    const ly = y - lift;
    p.rect(lx, ly, 4, 9, colors.plate);
    p.rect(lx, ly, 1, 9, colors.plateL);
    p.rect(lx, ly + 7, 5, 3, colors.boot);
    p.set(lx + 1, ly + 9, colors.helmD);
  };
  if (side) {
    leg(x + 3, liftL);
    leg(x + 6, liftR);
  } else {
    leg(x, liftL);
    leg(x + 7, liftR);
  }
}

function bladeStamp(p, colors, x, y, kind) {
  if (kind === "down") {
    p.rect(x, y, 2, 14, colors.helmD);
    p.rect(x, y, 1, 12, colors.blade);
    p.set(x, y, colors.bladeH);
    p.rect(x - 2, y + 11, 6, 2, colors.gold);
    p.rect(x, y + 13, 2, 3, colors.boot);
  } else if (kind === "back") {
    p.rect(x, y, 2, 12, colors.helmD);
    p.rect(x, y + 1, 1, 9, colors.blade);
    p.set(x, y, colors.bladeH);
    p.rect(x - 1, y + 10, 5, 2, colors.gold);
  } else if (kind === "out") {
    p.rect(x, y, 16, 2, colors.helmD);
    p.rect(x + 1, y, 14, 1, colors.blade);
    p.set(x + 15, y, colors.bladeH);
    p.rect(x - 1, y - 1, 3, 4, colors.gold);
  } else if (kind === "up") {
    p.rect(x, y, 2, 16, colors.helmD);
    p.rect(x, y, 1, 14, colors.blade);
    p.set(x, y, colors.bladeH);
    p.rect(x - 2, y + 13, 6, 2, colors.gold);
  } else if (kind === "guard") {
    p.rect(x, y, 8, 12, colors.plate);
    p.rect(x, y, 8, 1, colors.plateL);
    p.rect(x + 3, y + 2, 2, 8, colors.accent);
    p.outline(x, y, 8, 12, colors.helmD);
    p.rect(x + 9, y + 2, 2, 10, colors.blade);
    p.set(x + 9, y + 2, colors.bladeH);
  }
}

function drawHero(team, anim) {
  const p = canvas(32, 48);
  const colors = palette(team);
  const y = 2 + (anim.bob ?? 0);
  const dx = anim.hurt ? 2 : 0;
  const face = anim.face ?? "front";
  p.rect(9, 44, 14, 2, [0, 0, 0, 80]);
  if (anim.kneel) {
    p.rect(6 + dx, 22, 18, 10, colors.clothD);
    p.rect(8 + dx, 18, 12, 8, colors.plate);
    p.rect(10 + dx, 12, 8, 7, colors.helm);
    p.rect(12 + dx, 14, 4, 3, colors.skin);
    p.set(13 + dx, 15, colors.wraith ? colors.accentH : C.ink);
    p.rect(6, 30, 8, 4, colors.boot);
    p.rect(16, 32, 8, 3, colors.boot);
    bladeStamp(p, colors, 2, 28, "down");
    return p;
  }
  const liftL = (anim.leg ?? 0) < 0 ? 3 : 0;
  const liftR = (anim.leg ?? 0) > 0 ? 3 : 0;
  p.rect(8 + dx, y + 18, 16, 14, colors.clothD);
  p.rect(6 + dx, y + 20, 3, 14, colors.cloth);
  p.rect(23 + dx, y + 21, 3, 12, colors.cloth);
  p.set(5 + dx, y + 30, colors.clothD);
  p.set(26 + dx, y + 28, colors.cloth);
  if (colors.wraith) {
    p.set(4 + dx, y + 24, colors.cloth);
    p.set(27 + dx, y + 32, colors.clothD);
    p.set(7 + dx, y + 33, colors.cloth);
  }
  legPair(p, colors, 11 + dx, y + 32, liftL, liftR, face === "side");
  p.rect(12 + dx, y + 18, 8, 13, colors.plate);
  p.rect(12 + dx, y + 18, 1, 13, colors.plateL);
  p.rect(19 + dx, y + 18, 1, 13, colors.helmD);
  p.rect(14 + dx, y + 21, 4, 6, colors.accent);
  p.set(15 + dx, y + 22, colors.accentH);
  p.rect(12 + dx, y + 29, 8, 2, colors.boot);
  p.set(15 + dx, y + 29, colors.gold);
  p.rect(9 + dx, y + 17, 4, 3, colors.plate);
  p.rect(19 + dx, y + 17, 4, 3, colors.plate);
  p.rect(9 + dx, y + 17, 4, 1, colors.plateL);
  p.rect(8 + dx, y + 20, 3, 8, colors.plate);
  p.rect(8 + dx, y + 20, 1, 8, colors.plateL);
  p.rect(21 + dx, y + 20, 3, 7, colors.plate);
  p.set(22 + dx, y + 26, colors.skin);
  if (face === "back") {
    p.rect(12 + dx, y + 4, 8, 12, colors.clothD);
    p.rect(13 + dx, y + 6, 6, 8, colors.helm);
    p.rect(14 + dx, y + 2, 4, 4, colors.cloth);
  } else if (face === "side") {
    p.rect(14 + dx, y + 4, 8, 5, colors.helm);
    p.rect(15 + dx, y + 3, 6, 2, colors.helmL);
    p.rect(13 + dx, y + 8, 10, 7, colors.helm);
    p.rect(18 + dx, y + 9, 4, 4, colors.skin);
    p.set(20 + dx, y + 10, colors.wraith ? colors.accentH : C.ink);
    p.rect(21 + dx, y + 11, 2, 1, colors.skinD);
    p.set(22 + dx, y + 10, colors.skin);
    if (colors.wraith) p.rect(14 + dx, y + 2, 6, 3, colors.clothD);
    else p.rect(16 + dx, y + 2, 2, 3, colors.accent);
  } else {
    p.rect(12 + dx, y + 3, 8, 4, colors.helm);
    p.rect(13 + dx, y + 2, 6, 2, colors.helmL);
    p.rect(11 + dx, y + 6, 10, 9, colors.helm);
    p.rect(13 + dx, y + 8, 6, 5, colors.skin);
    p.set(14 + dx, y + 9, colors.wraith ? colors.accentH : C.ink);
    p.set(17 + dx, y + 9, colors.wraith ? colors.accentH : C.ink);
    p.rect(14 + dx, y + 11, 4, 1, colors.skinD);
    p.rect(15 + dx, y + 7, 2, 2, colors.helmD);
    if (colors.wraith) {
      p.rect(12 + dx, y + 1, 8, 3, colors.clothD);
      p.set(13 + dx, y + 3, colors.cloth);
      p.set(18 + dx, y + 3, colors.cloth);
    } else {
      p.rect(15 + dx, y + 1, 2, 3, colors.accent);
    }
  }
  const weapon = anim.weapon ?? "down";
  const sway = anim.sway ?? 0;
  if (weapon === "down") bladeStamp(p, colors, 22 + dx + sway, y + 8, "down");
  else if (weapon === "back") bladeStamp(p, colors, 6 + dx, y + 2, "back");
  else if (weapon === "out") bladeStamp(p, colors, 16 + dx, y + 14, "out");
  else if (weapon === "up") bladeStamp(p, colors, 15 + dx, y, "up");
  else if (weapon === "guard") bladeStamp(p, colors, 6 + dx, y + 14, "guard");
  return p;
}

const FW = 32;
const FH = 48;
const COLS = 4;
const ROWS = 10;

function sheetFor(team) {
  const sheet = canvas(FW * COLS, FH * ROWS);
  const place = (col, row, anim, flip = false) => {
    blit(sheet, drawHero(team, anim), col * FW, row * FH, flip);
  };
  const idleSway = [0, 1, 0, -1];
  const idleBob = [0, 1, 2, 1];
  for (let i = 0; i < 4; i += 1) place(i, 0, { bob: idleBob[i], sway: idleSway[i], face: "front", weapon: "down" });
  for (let i = 0; i < 4; i += 1) place(i, 1, { bob: i % 2, leg: i % 2 ? 1 : -1, face: "front", weapon: "down" });
  for (let i = 0; i < 4; i += 1) place(i, 2, { bob: i % 2, leg: i % 2 ? 1 : -1, face: "back", weapon: "down" });
  for (let i = 0; i < 4; i += 1) place(i, 3, { bob: i % 2, leg: i % 2 ? 1 : -1, face: "side", weapon: "down" });
  for (let i = 0; i < 4; i += 1) place(i, 4, { bob: i % 2, leg: i % 2 ? 1 : -1, face: "side", weapon: "down" }, true);
  ["back", "out", "out", "down"].forEach((weapon, i) => place(i, 5, { face: "front", weapon, bob: 0 }));
  for (let i = 0; i < 4; i += 1) place(i, 6, { face: "front", weapon: "guard", bob: i % 2 });
  for (let i = 0; i < 4; i += 1) place(i, 7, { face: "front", weapon: "down", hurt: true, bob: 0, leg: i % 2 ? 1 : 0 });
  for (let i = 0; i < 4; i += 1) place(i, 8, { face: "front", weapon: "up", bob: i % 2 });
  for (let i = 0; i < 4; i += 1) place(i, 9, { kneel: true, face: "front" });
  return sheet;
}

function floorTile(kind) {
  const p = canvas(32, 32);
  p.rect(0, 0, 32, 32, C.stone);
  for (let y = 0; y < 31; y += 1) {
    for (let x = 0; x < 31; x += 1) {
      if ((x * 5 + y * 9) % 23 === 0) p.set(x, y, C.stoneL);
      else if ((x * 3 + y) % 29 === 0) p.set(x, y, C.stoneD);
    }
  }
  p.rect(0, 31, 32, 1, C.stoneD);
  p.rect(31, 0, 1, 32, C.stoneD);
  if (kind === "cracked") {
    const crack = [[7, 16], [8, 16], [9, 17], [10, 17], [11, 18], [12, 18], [13, 19], [17, 15], [18, 14], [19, 14], [20, 13]];
    for (const [x, y] of crack) p.set(x, y, [42, 40, 48, 255]);
  }
  if (kind === "damaged") {
    p.rect(18, 18, 7, 6, C.stoneD);
    p.set(20, 20, C.gold);
    p.set(22, 22, C.stoneL);
  }
  if (kind === "moss") {
    const moss = [[5, 22], [6, 22], [6, 23], [7, 23], [7, 24], [8, 22], [20, 6], [21, 6], [21, 7], [22, 7]];
    moss.forEach(([x, y], i) => p.set(x, y, i % 2 ? C.mossL : C.moss));
  }
  return p;
}

function wallTile() {
  const p = canvas(32, 32);
  p.rect(0, 0, 32, 32, [18, 14, 16, 255]);
  for (let row = 0; row < 4; row += 1) {
    const y = row * 8;
    const shift = row % 2 ? 8 : 0;
    for (let col = -1; col < 3; col += 1) {
      const x = col * 16 + shift;
      const mid = (row + col) % 3 === 0 ? C.stoneD : C.stone;
      p.plate(x + 1, y + 1, 14, 6, mid, C.stoneL, C.ink);
      if ((row + col) % 5 === 0) p.set(x + 4, y + 3, C.moss);
    }
  }
  p.set(9, 14, C.mossL);
  p.set(24, 22, C.gold);
  return p;
}

function pillarTile() {
  const p = canvas(32, 32);
  p.plate(8, 24, 16, 4, C.stoneD, C.stone, C.ink);
  p.plate(11, 8, 10, 16, C.stone, C.stoneL, C.stoneD);
  p.rect(12, 9, 2, 14, C.stoneH);
  p.rect(18, 9, 2, 14, C.stoneD);
  p.plate(9, 5, 14, 4, C.stoneL, C.stoneH, C.ink);
  p.rect(13, 14, 6, 2, C.gold);
  p.set(15, 14, C.goldL);
  p.set(14, 18, C.moss);
  return p;
}

function torchFrame(frame) {
  const p = canvas(16, 24);
  const flick = frame % 2;
  p.rect(7, 14, 2, 8, C.wood);
  p.rect(5, 20, 6, 3, C.ink);
  p.rect(6, 10 - flick, 4, 6, C.flameD);
  p.rect(7, 8 - flick, 2, 5, C.flameM);
  p.rect(7, 7 - (frame === 2 ? 1 : 0), 2, 2, C.flame);
  p.set(8, 6 - flick, C.flame);
  return p;
}

function crystal(color, light) {
  const p = canvas(16, 16);
  const rows = ["..oo..", ".oHHo.", "oHHHHo", "oHHHHo", "oHCCHo", ".oCCo.", "..oo.."];
  stamp(p, rows, { o: C.ink, H: light, C: color }, 4, 3);
  return p;
}

function iconBoot() {
  const p = canvas(32, 32);
  stamp(
    p,
    [
      ".......oooo.........",
      "......oLLLLo........",
      "......oLHHLo........",
      "......oLLLLo........",
      ".....oLLLLLLo.......",
      "....oLLLLLLLLo......",
      "...oLHHHHLLLLLo.....",
      "...oLLLLLLLLLLo.....",
      "...oLLLLLLLLLDo.....",
      "....oooooooooo......",
      "....DDDDDDDDDD......",
    ],
    { o: C.ink, L: C.cyan, H: C.cyanH, D: C.cyanD },
    2,
    6,
  );
  return p;
}

function iconSword() {
  const p = canvas(32, 32);
  stamp(
    p,
    [
      "........E.........",
      ".......oWo........",
      ".......oWo........",
      ".......oWo........",
      ".......oWo........",
      ".......oWo........",
      ".......oWo........",
      ".......oWo........",
      ".......oWo........",
      "......ggggg.......",
      ".......oDo........",
      ".......oDo........",
      ".......ooo........",
    ],
    { o: C.ink, W: C.vioL, E: C.crimL, g: C.goldL, D: C.vioD },
    4,
    2,
  );
  return p;
}

function iconShield() {
  const p = canvas(32, 32);
  stamp(
    p,
    [
      "...oooooooooo...",
      "..oLLLLLLLLLLo..",
      ".oLLLLLLLLLLLLo.",
      "oLLLLLggggLLLLLo",
      "oLLLLLgGGgLLLLLo",
      "oLLLLLggggLLLLLo",
      "oLLLLLLLLLLLLLLo",
      ".oLLLLLLLLLLLLo.",
      "..oLLLLLLLLLLo..",
      "...oLLLLLLLLo...",
      "....oLLLLLLo....",
      ".....oooooo.....",
    ],
    { o: C.ink, L: C.green, g: C.gold, G: C.goldL },
    6,
    2,
  );
  return p;
}

function frame9() {
  const p = canvas(24, 24);
  p.rect(0, 0, 24, 24, C.gold);
  p.rect(2, 2, 20, 20, C.ink);
  p.rect(4, 4, 16, 16, [0, 0, 0, 0]);
  p.set(1, 1, C.goldL);
  p.set(22, 1, C.goldL);
  p.set(1, 22, C.wood);
  p.set(22, 22, C.wood);
  return p;
}

function backdrop() {
  const p = canvas(160, 48);
  p.rect(0, 0, 160, 30, [8, 10, 28, 255]);
  p.rect(0, 30, 160, 18, [16, 18, 34, 255]);
  for (let i = 0; i < 26; i += 1) p.set((i * 19 + 4) % 156, (i * 3) % 14, i % 4 === 0 ? C.goldL : C.cyanH);
  p.outline(118, 3, 11, 11, C.goldL);
  p.rect(121, 6, 5, 5, C.gold);
  const tower = (x, top, h, wins) => {
    p.rect(x, top, 14, h, C.stoneD);
    p.rect(x + 1, top, 3, h, C.stoneL);
    p.rect(x - 1, top - 3, 16, 3, C.stone);
    p.rect(x + 5, top - 7, 4, 4, C.ink);
    p.set(x + 6, top - 8, C.flame);
    for (const wy of wins) {
      p.rect(x + 4, wy, 3, 3, C.gold);
      p.set(x + 5, wy + 1, C.flame);
    }
  };
  tower(4, 22, 18, [26, 34]);
  tower(28, 26, 14, [30]);
  tower(52, 20, 20, [24, 32]);
  tower(78, 24, 16, [28]);
  tower(104, 18, 22, [22, 30]);
  tower(136, 22, 18, [26, 34]);
  p.rect(0, 40, 160, 8, C.stoneD);
  for (let x = 0; x < 160; x += 8) p.rect(x, 40, 6, 4, x % 16 ? C.stone : C.stoneL);
  for (let x = 1; x < 160; x += 5) p.set(x, 46, C.fog);
  p.rect(46, 42, 5, 4, C.vio);
  p.set(47, 43, C.vioH);
  p.rect(96, 43, 5, 4, C.cyan);
  p.set(97, 44, C.cyanH);
  return p;
}

function highlight(color) {
  const p = canvas(32, 32);
  p.outline(0, 0, 32, 32, color);
  return p;
}

function platformArt() {
  const p = canvas(192, 192);
  const slate = [58, 64, 88, 255];
  const slateL = [102, 110, 138, 255];
  const slateD = [28, 32, 48, 255];
  const seam = [40, 44, 62, 255];
  for (let y = 0; y < 192; y += 1) {
    for (let x = 0; x < 192; x += 1) {
      const nx = (x - 96) / 92;
      const ny = (y - 98) / 86;
      const jag = ((x * 13 + y * 7) % 19) / 190;
      if (nx * nx + ny * ny + jag > 1.02) continue;
      const play = x >= 16 && x < 176 && y >= 16 && y < 176;
      const onSeam = play && ((x - 16) % 32 === 31 || (y - 16) % 32 === 31);
      const rim = nx * nx + ny * ny > 0.84;
      let color = onSeam ? seam : rim ? slateD : (x * 3 + y * 5) % 17 === 0 ? slateL : slate;
      if (!play && (x + y * 2) % 41 === 0) color = C.moss;
      p.set(x, y, color);
    }
  }
  for (let step = 0; step < 3; step += 1) {
    const w = 34 - step * 8;
    p.rect(96 - Math.floor(w / 2), 170 + step * 6, w, 6, step % 2 ? slateD : slate);
    p.rect(96 - Math.floor(w / 2), 170 + step * 6, w, 1, slateL);
  }
  p.rect(6, 118, 8, 16, slateD);
  p.set(9, 116, C.flame);
  p.set(8, 117, C.flameM);
  p.rect(176, 128, 8, 14, slateD);
  p.set(179, 126, C.vioH);
  p.rect(28, 150, 6, 3, C.moss);
  p.rect(154, 48, 5, 3, C.mossL);
  return p;
}

function nightSky() {
  const w = 360;
  const h = 200;
  const p = canvas(w, h);
  for (let y = 0; y < h; y += 1) {
    const band = y < 70 ? [7, 8, 22, 255] : y < 120 ? [12, 14, 36, 255] : y < 160 ? [18, 16, 40, 255] : [10, 10, 24, 255];
    p.rect(0, y, w, 1, band);
  }
  for (let i = 0; i < 70; i += 1) {
    const x = (i * 47 + 13) % (w - 4);
    const y = (i * 19) % 78;
    p.set(x, y, i % 5 === 0 ? C.goldL : C.cyanH);
  }
  p.outline(286, 16, 22, 22, C.goldL);
  p.rect(292, 22, 10, 10, C.gold);
  p.set(296, 25, C.goldL);
  const hill = (y0, color) => {
    for (let x = 0; x < w; x += 1) {
      const y = y0 + ((x * 3) % 7) - 3;
      p.rect(x, y, 1, h - y, color);
    }
  };
  hill(128, [16, 18, 40, 255]);
  hill(146, [10, 12, 28, 255]);
  const tower = (x, top, bh, wins) => {
    p.rect(x, top, 18, bh, [28, 32, 58, 255]);
    p.rect(x + 1, top, 4, bh, [48, 54, 88, 255]);
    p.rect(x - 2, top - 6, 22, 6, [36, 40, 70, 255]);
    p.rect(x + 6, top - 18, 6, 12, [20, 22, 44, 255]);
    p.set(x + 8, top - 20, C.flame);
    for (const wy of wins) {
      p.rect(x + 4, wy, 3, 4, C.gold);
      p.set(x + 5, wy + 1, C.flame);
    }
  };
  tower(150, 78, 70, [90, 108, 124]);
  tower(40, 96, 52, [108, 122]);
  tower(300, 90, 58, [104, 120]);
  p.rect(168, 88, 28, 60, [32, 36, 64, 255]);
  p.rect(176, 70, 12, 18, [22, 24, 48, 255]);
  p.rect(178, 58, 8, 12, C.ink);
  p.set(181, 54, C.goldL);
  for (let x = 20; x < 340; x += 14) {
    const th = 10 + (x % 5);
    p.rect(x, 150 - th, 3, th, [8, 14, 22, 255]);
    p.set(x, 148 - th, C.moss);
  }
  for (let y = 168; y < h; y += 1) {
    for (let x = (y % 2) * 4; x < w; x += 8) p.set(x, y, [90, 70, 140, y > 184 ? 40 : 90]);
  }
  p.rect(70, 176, 6, 8, C.vio);
  p.set(72, 177, C.vioH);
  p.rect(250, 180, 6, 7, C.cyan);
  p.set(252, 181, C.cyanH);
  return p;
}

function shadowBlob() {
  const p = canvas(32, 8);
  p.rect(10, 3, 12, 2, [0, 0, 0, 120]);
  p.rect(8, 4, 16, 2, [0, 0, 0, 80]);
  return p;
}

function layerStars() {
  const p = canvas(128, 64);
  for (let i = 0; i < 22; i += 1) {
    const x = 2 + ((i * 17) % 124);
    const y = 2 + ((i * 11) % 58);
    p.set(x, y, i % 6 === 0 ? C.goldL : C.cyanH);
    if (i % 4 === 0) p.set(x + 1, y, [180, 190, 220, 180]);
  }
  return p;
}

function layerRidges() {
  const p = canvas(128, 48);
  for (let x = 0; x < 128; x += 1) {
    const wave = Math.round(8 * Math.sin((x / 128) * Math.PI * 2) + 4 * Math.sin((x / 128) * Math.PI * 4));
    const top = 18 + wave;
    for (let y = top; y < 48; y += 1) {
      const far = y < top + 6;
      p.set(x, y, far ? [22, 26, 52, 255] : [12, 14, 32, 255]);
    }
    if (x % 9 === 0 && top > 8) {
      p.set(x, top - 4, [8, 16, 18, 255]);
      p.set(x, top - 3, C.moss);
    }
  }
  return p;
}

function layerCastle() {
  const p = canvas(180, 100);
  p.outline(78, 8, 28, 28, [230, 220, 170, 255]);
  p.rect(84, 14, 16, 16, [214, 206, 160, 255]);
  const pine = (x, top, h) => {
    for (let i = 0; i < h; i += 1) {
      const w = 1 + Math.floor(i / 2);
      p.rect(x - w, top + i, w * 2 + 1, 1, [8, 16, 20, 255]);
    }
  };
  pine(18, 28, 36);
  pine(34, 20, 44);
  pine(148, 24, 40);
  pine(164, 32, 32);
  const tower = (x, top, h) => {
    p.rect(x, top, 16, h, [24, 28, 52, 255]);
    p.rect(x + 1, top, 3, h, [40, 46, 78, 255]);
    p.rect(x - 2, top - 4, 20, 4, [32, 36, 64, 255]);
    p.rect(x + 6, top - 12, 4, 8, [16, 18, 36, 255]);
    p.set(x + 7, top - 14, C.flame);
    for (let y = top + 6; y < top + h - 8; y += 10) {
      p.rect(x + 6, y, 3, 4, C.gold);
      p.set(x + 7, y + 1, C.flame);
    }
  };
  tower(70, 36, 52);
  tower(96, 28, 60);
  tower(122, 40, 48);
  p.rect(86, 58, 28, 30, [28, 32, 58, 255]);
  p.rect(96, 70, 8, 12, [12, 10, 18, 255]);
  for (let x = 48; x < 140; x += 1) {
    const y = 78 + (x % 3);
    p.rect(x, y, 1, 100 - y, [14, 28, 24, 255]);
  }
  return p;
}

function layerMist() {
  const p = canvas(128, 16);
  for (let y = 4; y < 12; y += 1) {
    for (let x = (y % 2) * 3; x < 128; x += 6) p.set(x, y, [120, 90, 170, y === 7 ? 70 : 36]);
  }
  return p;
}

function slash() {
  const p = canvas(32, 32);
  for (let i = 0; i < 10; i += 1) {
    p.set(6 + i * 2, 22 - i * 2, i % 2 ? C.goldL : C.cyanH);
    p.set(7 + i * 2, 22 - i * 2, C.flame);
  }
  return p;
}

const atlas = canvas(32 * 4, 32);
["plain", "cracked", "damaged", "moss"].forEach((kind, i) => blit(atlas, floorTile(kind), i * 32, 0));
save(atlas, path.join(root, "tiles/floor.png"));
save(platformArt(), path.join(root, "environment/platform.png"));
save(pillarTile(), path.join(root, "tiles/pillar.png"));
save(wallTile(), path.join(root, "tiles/wall.png"));

const torches = canvas(16 * 4, 24);
for (let i = 0; i < 4; i += 1) blit(torches, torchFrame(i), i * 16, 0);
save(torches, path.join(root, "environment/torch.png"));
save(crystal(C.cyan, C.cyanH), path.join(root, "environment/crystal-cyan.png"));
save(crystal(C.vio, C.vioH), path.join(root, "environment/crystal-violet.png"));
save(backdrop(), path.join(root, "environment/ruins.png"));
save(nightSky(), path.join(root, "environment/sky.png"));
save(layerStars(), path.join(root, "environment/layer-stars.png"));
save(layerRidges(), path.join(root, "environment/layer-ridges.png"));
save(layerCastle(), path.join(root, "environment/layer-castle.png"));
save(layerMist(), path.join(root, "environment/layer-mist.png"));
save(shadowBlob(), path.join(root, "effects/shadow.png"));

save(sheetFor("warden"), path.join(root, "characters/warden.png"));
save(sheetFor("wraith"), path.join(root, "characters/wraith.png"));

function iconLock() {
  const p = canvas(32, 32);
  p.rect(10, 6, 12, 8, C.gold);
  p.rect(13, 4, 6, 6, C.ink);
  p.rect(14, 5, 4, 4, C.goldL);
  p.plate(8, 12, 16, 12, C.gold, C.goldL, C.ink);
  p.rect(15, 16, 2, 4, C.ink);
  return p;
}

save(iconLock(), path.join(root, "ui/lock.png"));
save(iconBoot(), path.join(root, "ui/advance.png"));
save(iconSword(), path.join(root, "ui/strike.png"));
save(iconShield(), path.join(root, "ui/guard.png"));
save(frame9(), path.join(root, "ui/frame.png"));
save(highlight(C.cyanL), path.join(root, "effects/legal.png"));
save(highlight(C.goldL), path.join(root, "effects/selected.png"));
save(highlight(C.crimL), path.join(root, "effects/attack.png"));
save(slash(), path.join(root, "effects/slash.png"));

function tone(freq, ms, vol = 0.18) {
  const rate = 22050;
  const n = Math.floor((rate * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    const env = Math.min(1, i / 80) * Math.max(0, 1 - i / n);
    const s = Math.sin(2 * Math.PI * freq * t) * 0.6 + (Math.sin(2 * Math.PI * freq * 2 * t) > 0 ? 0.2 : -0.2);
    out[i] = s * vol * env;
  }
  return out;
}

function writeWav(file, samples) {
  const rate = 22050;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

const mix = (...parts) => {
  const n = Math.max(...parts.map((p) => p.length));
  const out = new Float32Array(n);
  for (const part of parts) for (let i = 0; i < part.length; i += 1) out[i] += part[i];
  return out;
};
writeWav(path.join(root, "audio/click.wav"), tone(520, 70, 0.12));
writeWav(path.join(root, "audio/seal.wav"), mix(tone(330, 90, 0.14), tone(494, 140, 0.1)));
writeWav(path.join(root, "audio/hit.wav"), mix(tone(180, 80, 0.2), tone(90, 120, 0.12)));
writeWav(path.join(root, "audio/block.wav"), tone(740, 90, 0.12));
writeWav(path.join(root, "audio/win.wav"), mix(tone(523, 120, 0.12), tone(659, 160, 0.1), tone(784, 220, 0.08)));

const preview = canvas(FW * COLS, FH * 2);
blit(preview, sheetFor("warden"), 0, 0);
const wraith = sheetFor("wraith");
for (let y = 0; y < FH; y += 1) {
  for (let x = 0; x < preview.w; x += 1) preview.set(x, FH + y, wraith.get(x, y));
}
save(preview, path.join(root, "characters/preview-idle-row.png"));

console.log("pixel assets written under public/assets");
