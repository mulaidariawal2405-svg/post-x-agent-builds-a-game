// render.mjs — renders the Ghost Dash gameplay frames for the video.
//
// It replays the same game game.html plays (same spawn cadence, same speeds,
// same seeded random), with a simple auto-player steering the ghost, and
// draws every frame into a raw RGB buffer that is encoded as PNG with the
// standard library's zlib. No dependencies, no network, deterministic: the
// same seed writes the same frames.
//
// Usage: node video/render.mjs <out-dir> <frames>  (defaults: /tmp/game-frames, 540)

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 540;
const H = 960;
const FPS = 30;
const OUT = process.argv[2] ?? '/tmp/game-frames';
const FRAMES = Number(process.argv[3] ?? 540);
const GHOST_Y = 820;
const GHOST_R = 34;
const STAR_R = 20;
const COIN_R = 16;

// Deterministic random, so the footage is reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261122);

// ---- tiny 5x7 bitmap font: digits and the letters the HUD needs ----
const GLYPHS = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

// ---- pixel buffer helpers ----
const buf = Buffer.alloc(W * H * 3);

function rgb(r, g, b) { return [r, g, b]; }

function setPx(x, y, c) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}

function fillRect(x0, y0, w, h, c) {
  const xa = Math.max(0, Math.floor(x0));
  const xb = Math.min(W, Math.ceil(x0 + w));
  const ya = Math.max(0, Math.floor(y0));
  const yb = Math.min(H, Math.ceil(y0 + h));
  for (let y = ya; y < yb; y++) {
    let i = (y * W + xa) * 3;
    for (let x = xa; x < xb; x++, i += 3) {
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    }
  }
}

function fillCircle(cx, cy, r, c) {
  const xa = Math.max(0, Math.floor(cx - r));
  const xb = Math.min(W - 1, Math.ceil(cx + r));
  const ya = Math.max(0, Math.floor(cy - r));
  const yb = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPx(x, y, c);
    }
  }
}

function fillEllipse(cx, cy, rx, ry, c) {
  const xa = Math.max(0, Math.floor(cx - rx));
  const xb = Math.min(W - 1, Math.ceil(cx + rx));
  const ya = Math.max(0, Math.floor(cy - ry));
  const yb = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPx(x, y, c);
    }
  }
}

// Point-in-polygon fill over a shape's bounding box.
function fillPoly(points, c) {
  let minX = W, maxX = 0, minY = H, maxY = 0;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const xa = Math.max(0, Math.floor(minX));
  const xb = Math.min(W - 1, Math.ceil(maxX));
  const ya = Math.max(0, Math.floor(minY));
  const yb = Math.min(H - 1, Math.ceil(maxY));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      if (inside) setPx(x, y, c);
    }
  }
}

function starPoints(cx, cy, r, rot) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = (i * Math.PI) / 5 - Math.PI / 2 + rot;
    const rad = i % 2 === 0 ? r : r * 0.45;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  return pts;
}

function drawText(text, x, y, scale, c) {
  let cx = x;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) {
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (g[row][col] === '1') fillRect(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
  return cx;
}

function textWidth(text, scale) {
  return text.length * 6 * scale - scale;
}

function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Background gradient, one colour per row, computed once.
const ROW_COLORS = [];
for (let y = 0; y < H; y++) {
  const t = y / H;
  let c;
  if (t < 0.6) c = lerpColor([28, 17, 64], [18, 11, 40], t / 0.6);
  else c = lerpColor([18, 11, 40], [13, 10, 26], (t - 0.6) / 0.4);
  ROW_COLORS.push(c);
}

const BG_STARS = [];
for (let i = 0; i < 70; i++) {
  BG_STARS.push({ x: rnd() * W, y: rnd() * H, r: 1 + rnd() * 2, tw: rnd() * Math.PI * 2 });
}

const WHITE = rgb(255, 255, 255);
const INK = rgb(25, 20, 25);
const GOLD = rgb(255, 217, 74);
const GOLD_DARK = rgb(184, 134, 11);
const AMBER = rgb(255, 176, 46);
const RED = rgb(255, 93, 115);
const GREEN = rgb(126, 231, 135);
const LILAC = rgb(207, 196, 245);

// ---- game state (mirrors game.html) ----
const state = {
  mode: 'playing',
  score: 0,
  lives: 3,
  ghostX: W / 2,
  stars: [],
  coins: [],
  sparks: [],
  frame: 0,
  flash: 0,
};

function spawnStar() {
  state.stars.push({
    x: 30 + rnd() * (W - 60),
    y: -30,
    vy: 3.2 + rnd() * 2.4 + state.frame / 6000,
    spin: rnd() * Math.PI * 2,
    vspin: (rnd() - 0.5) * 0.06,
  });
}

function spawnCoin() {
  state.coins.push({
    x: 30 + rnd() * (W - 60),
    y: -30,
    vy: 4.6 + rnd() * 1.6,
    phase: rnd() * Math.PI * 2,
  });
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const sp = 1 + rnd() * 4;
    state.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 24, color });
  }
}

// Auto-player: dodge only a star that is actually on a collision course,
// otherwise chase the nearest coin that is still falling toward us.
function autoPlay() {
  const clampX = (x) => Math.max(GHOST_R, Math.min(W - GHOST_R, x));
  for (const s of state.stars) {
    const dy = GHOST_Y - s.y;
    if (dy > 0 && dy < 140 && Math.abs(s.x - state.ghostX) < 60) {
      const away = s.x < state.ghostX ? 1 : -1;
      state.ghostX = clampX(state.ghostX + away * 9);
      return;
    }
  }
  let target = state.ghostX;
  let best = Infinity;
  for (const c of state.coins) {
    if (c.y < GHOST_Y - 20) {
      const d = Math.abs(c.x - state.ghostX) + (GHOST_Y - c.y) * 0.05;
      if (d < best) { best = d; target = c.x; }
    }
  }
  const dx = target - state.ghostX;
  state.ghostX = clampX(state.ghostX + Math.max(-9, Math.min(9, dx * 0.3)));
}

function update() {
  if (state.mode !== 'playing') return;
  state.frame++;
  autoPlay();

  if (state.frame % 34 === 0) spawnStar();
  if (state.frame % 35 === 0) spawnCoin();

  for (const s of state.stars) { s.y += s.vy; s.spin += s.vspin; }
  for (const c of state.coins) { c.y += c.vy; c.phase += 0.12; }
  for (const p of state.sparks) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; }
  state.sparks = state.sparks.filter((p) => p.life > 0);
  state.stars = state.stars.filter((s) => s.y < H + 40);
  state.coins = state.coins.filter((c) => c.y < H + 40);

  for (let i = state.coins.length - 1; i >= 0; i--) {
    const c = state.coins[i];
    const d = Math.hypot(c.x - state.ghostX, c.y - GHOST_Y);
    if (d < COIN_R + GHOST_R - 6) {
      state.coins.splice(i, 1);
      state.score += 10;
      burst(c.x, c.y, GOLD, 10);
    }
  }

  for (let i = state.stars.length - 1; i >= 0; i--) {
    const s = state.stars[i];
    const d = Math.hypot(s.x - state.ghostX, s.y - GHOST_Y);
    if (d < STAR_R + GHOST_R - 10) {
      state.stars.splice(i, 1);
      state.lives--;
      state.flash = 12;
      burst(state.ghostX, GHOST_Y, RED, 16);
      if (state.lives <= 0) state.mode = 'over';
    }
  }
  if (state.flash > 0) state.flash--;
}

function drawGhost(x, y, frame) {
  const yy = y + Math.sin(frame * 0.08) * 5;
  fillCircle(x, yy - 6, GHOST_R, WHITE);
  fillRect(x - GHOST_R, yy - 6, GHOST_R * 2, 26, WHITE);
  // Wavy hem: three small bites out of the bottom edge.
  for (let i = 0; i < 3; i++) {
    const cx = x - GHOST_R + (i + 0.5) * ((GHOST_R * 2) / 3);
    fillCircle(cx, yy + 20, GHOST_R / 3, ROW_COLORS[Math.min(H - 1, Math.floor(yy + 20))]);
  }
  fillCircle(x - 12, yy - 10, 6, INK);
  fillCircle(x + 12, yy - 10, 6, INK);
  fillEllipse(x, yy + 6, 6, 8, INK);
}

function drawHeart(x, y, s, filled) {
  const c = filled ? RED : rgb(255, 255, 255);
  fillCircle(x - 5 * s, y - 3 * s, 6 * s, c);
  fillCircle(x + 5 * s, y - 3 * s, 6 * s, c);
  fillPoly([[x - 11 * s, y - 2 * s], [x + 11 * s, y - 2 * s], [x, y + 10 * s]], c);
  if (!filled) {
    // Hollow it back out so an empty heart reads as an outline.
    fillCircle(x - 5 * s, y - 3 * s, 4 * s, rgb(28, 17, 64));
    fillCircle(x + 5 * s, y - 3 * s, 4 * s, rgb(28, 17, 64));
    fillPoly([[x - 8 * s, y - 2 * s], [x + 8 * s, y - 2 * s], [x, y + 7 * s]], rgb(28, 17, 64));
  }
}

function drawFrame(frame) {
  // Background gradient, one row at a time.
  for (let y = 0; y < H; y++) {
    const c = ROW_COLORS[y];
    let i = y * W * 3;
    for (let x = 0; x < W; x++, i += 3) {
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    }
  }

  for (const b of BG_STARS) {
    const a = 0.35 + 0.4 * Math.abs(Math.sin(frame * 0.02 + b.tw));
    if (a > 0.5) fillCircle(b.x, b.y, b.r, rgb(255, 255, 255));
  }

  for (const c of state.coins) {
    const wob = Math.cos(c.phase) * 0.4 + 0.6;
    fillEllipse(c.x, c.y, COIN_R * (0.5 + 0.5 * wob), COIN_R, GOLD);
    fillEllipse(c.x, c.y, COIN_R * 0.35 * wob + 2, COIN_R * 0.55, GOLD_DARK);
  }

  for (const s of state.stars) fillPoly(starPoints(s.x, s.y, STAR_R, s.spin), AMBER);

  for (const p of state.sparks) {
    if (p.life > 0) fillRect(p.x - 2, p.y - 2, 4, 4, p.color);
  }

  drawGhost(state.ghostX, GHOST_Y, frame);

  // HUD.
  drawText('SCORE ' + state.score, 20, 28, 4, WHITE);
  for (let i = 0; i < 3; i++) drawHeart(W - 30 - i * 40, 42, 1.2, i < state.lives);

  if (state.mode === 'over') {
    // Dim the scene toward dark, keeping the game visible behind the text.
    for (let i = 0; i < W * H * 3; i += 3) {
      buf[i] = Math.round(buf[i] * 0.22 + 13 * 0.78);
      buf[i + 1] = Math.round(buf[i + 1] * 0.22 + 10 * 0.78);
      buf[i + 2] = Math.round(buf[i + 2] * 0.22 + 26 * 0.78);
    }
    const title = 'GAME OVER';
    const tw = textWidth(title, 8);
    drawText(title, (W - tw) / 2, 360, 8, RED);
    const sc = 'SCORE ' + state.score;
    drawText(sc, (W - textWidth(sc, 5)) / 2, 470, 5, WHITE);
    const again = 'CLICK TO PLAY AGAIN';
    drawText(again, (W - textWidth(again, 3)) / 2, 560, 3, GREEN);
  }

  if (state.flash > 0) {
    const a = state.flash / 40;
    for (let i = 0; i < W * H * 3; i += 3) {
      buf[i] = Math.round(buf[i] * (1 - a) + 255 * a);
      buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + 93 * a);
      buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + 115 * a);
    }
  }
}

function encodePNG() {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    buf.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const idat = deflateSync(raw, { level: 6 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  // CRC-32 (IEEE) table, built once; no dependency beyond the standard library.
  const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    return table;
  })();
  function crc32(data) {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 8 + data.length);
    return out;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const timeline = [];
let overAt = -1;
for (let f = 0; f < FRAMES; f++) {
  update();
  if (state.mode === 'over' && overAt < 0) overAt = f;
  drawFrame(f);
  const png = encodePNG();
  writeFileSync(join(OUT, 'frame-' + String(f).padStart(4, '0') + '.png'), png);
  timeline.push({ frame: f, t: +(f / FPS).toFixed(2), score: state.score, lives: state.lives, mode: state.mode });
  if (f % 60 === 0) console.log('frame ' + f + ' score=' + state.score + ' lives=' + state.lives + ' mode=' + state.mode);
}
writeFileSync(join(OUT, 'timeline.json'), JSON.stringify({ frames: FRAMES, fps: FPS, overAt, timeline }, null, 1));
console.log('done: ' + FRAMES + ' frames, final score=' + state.score + ', lives=' + state.lives + ', game over at frame ' + overAt);
