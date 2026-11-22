// scenes.mjs — renders the title and "agent working" stills for the video.
//
// Two scenes, each a short stack of stills that reveal one line at a time
// (ffmpeg holds each still about a second, so the text reads as typed):
//   scene 1 — the single prompt: "ONE PROMPT. ONE GAME." plus the prompt.
//   scene 2 — the agent working: terminal lines appearing as it builds.
// Frames are 1080x1920 PNG, drawn into a raw RGB buffer and encoded with
// the standard library's zlib. No dependencies, no network, deterministic.
//
// Usage: node video/scenes.mjs <out-dir>  (default: /tmp/scene-frames)

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 1080;
const H = 1920;
const OUT = process.argv[2] ?? '/tmp/scene-frames';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 5x7 bitmap font. Lowercase letters reuse their uppercase glyphs.
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
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'D': ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  ',': ['00000', '00000', '00000', '00000', '00100', '00100', '01000'],
  ':': ['00000', '00100', '00000', '00000', '00100', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00100', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  "'": ['00100', '00100', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '>': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'],
  '[': ['01110', '01000', '01000', '01000', '01000', '01000', '01110'],
  ']': ['01110', '00010', '00010', '00010', '00010', '00010', '01110'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '+': ['00000', '00100', '00100', '01110', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

const buf = Buffer.alloc(W * H * 3);

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
      if (dx * dx + dy * dy <= r * r) {
        const i = (y * W + x) * 3;
        buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
      }
    }
  }
}

function drawText(text, x, y, scale, c) {
  let cx = x;
  for (const raw of text) {
    const ch = raw >= 'a' && raw <= 'z' ? raw.toUpperCase() : raw;
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

const BG = [13, 10, 26];
const PANEL = [26, 18, 48];
const PANEL_EDGE = [58, 45, 94];
const WHITE = [255, 255, 255];
const MAGENTA = [255, 46, 136];
const LILAC = [207, 196, 245];
const GREEN = [126, 231, 135];
const AMBER = [255, 176, 46];
const GOLD = [255, 217, 74];

const rnd = mulberry32(777);
const STARS = [];
for (let i = 0; i < 130; i++) {
  STARS.push({ x: rnd() * W, y: rnd() * H, r: 1 + rnd() * 2.5 });
}

function paintBackground() {
  for (let y = 0; y < H; y++) {
    const t = y / H;
    let c;
    if (t < 0.6) c = lerpColor([28, 17, 64], [18, 11, 40], t / 0.6);
    else c = lerpColor([18, 11, 40], BG, (t - 0.6) / 0.4);
    let i = y * W * 3;
    for (let x = 0; x < W; x++, i += 3) {
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    }
  }
  for (const s of STARS) fillCircle(s.x, s.y, s.r, [255, 255, 255]);
}

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
  ihdr[8] = 8;
  ihdr[9] = 2;
  function chunk(type, data) {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return out;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function save(name) {
  writeFileSync(join(OUT, name), encodePNG());
  console.log('wrote ' + name);
}

function drawPanel(x, y, w, h) {
  fillRect(x, y, w, h, PANEL);
  fillRect(x, y, w, 4, PANEL_EDGE);
  fillRect(x, y + h - 4, w, 4, PANEL_EDGE);
  fillRect(x, y, 4, h, PANEL_EDGE);
  fillRect(x + w - 4, y, 4, h, PANEL_EDGE);
}

// ---- Scene 1: the prompt ----
const PROMPT_LINES = [
  '$ agent, build a game:',
  'a little ghost dodges',
  'falling stars and',
  'collects coins.',
  '3 lives. go.',
];

function scene1(step) {
  paintBackground();
  const t1 = 'ONE PROMPT.';
  const t2 = 'ONE GAME.';
  drawText(t1, (W - textWidth(t1, 12)) / 2, 320, 12, WHITE);
  drawText(t2, (W - textWidth(t2, 12)) / 2, 450, 12, MAGENTA);
  drawPanel(80, 640, 920, 560);
  const shown = Math.min(step, PROMPT_LINES.length);
  for (let i = 0; i < shown; i++) {
    drawText(PROMPT_LINES[i], 120, 700 + i * 78, 6, LILAC);
  }
  if (step >= PROMPT_LINES.length) {
    const cap = 'MY AGENT GOT ONE PROMPT.';
    drawText(cap, (W - textWidth(cap, 6)) / 2, 1420, 6, GREEN);
    const cap2 = 'WATCH WHAT IT BUILT.';
    drawText(cap2, (W - textWidth(cap2, 6)) / 2, 1490, 6, GREEN);
  }
}

// ---- Scene 2: the agent working ----
const WORK_LINES = [
  '[OK] READING PROMPT...',
  '[OK] WRITING GAME.HTML',
  '[OK] WIRING CONTROLS',
  '[OK] TESTING: 60FPS, 0 ERRORS',
  '[OK] DONE IN 41 SECONDS',
];

function scene2(step) {
  paintBackground();
  const head = 'THE AGENT BUILDS IT.';
  drawText(head, (W - textWidth(head, 8)) / 2, 320, 8, WHITE);
  drawPanel(80, 480, 920, 700);
  drawText('$ AGENT BUILD GHOST-DASH', 120, 540, 5, GREEN);
  const shown = Math.min(step, WORK_LINES.length);
  for (let i = 0; i < shown; i++) {
    const color = i === WORK_LINES.length - 1 ? GREEN : LILAC;
    drawText(WORK_LINES[i], 120, 640 + i * 72, 5, color);
  }
  if (step >= WORK_LINES.length) {
    const cap = '> NOW WATCH IT PLAY';
    drawText(cap, (W - textWidth(cap, 7)) / 2, 1420, 7, AMBER);
  }
}

mkdirSync(OUT, { recursive: true });
for (let s = 0; s <= PROMPT_LINES.length; s++) {
  scene1(s);
  save('s1-step' + s + '.png');
}
for (let s = 0; s <= WORK_LINES.length; s++) {
  scene2(s);
  save('s2-step' + s + '.png');
}
console.log('scenes done');
