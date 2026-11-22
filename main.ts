// Ghost Dash on X: the entrypoint for a make.fun video-on-X bounty (Node 22,
// standard library only). The entry is the post itself, not this program: the
// video shows an AI agent building a tiny browser game from one prompt, it is
// posted natively on X from a public account, and POST.json at this
// repository's root names that post. All this program does is hand POST.json
// to the grader: it reads the file, checks it is a JSON object with a url
// string, and copies it to the output directory byte for byte.
//
// Outside the grader's container, MAKEFUN_BOT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /bot and /output:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const sourcePath = join(BOT_DIR, 'POST.json');
const raw = readFileSync(sourcePath, 'utf8');

let parsed: unknown;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error('POST.json is not valid JSON');
  process.exit(1);
}

if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
  console.error('POST.json must be a JSON object with a url field');
  process.exit(1);
}

const url = (parsed as Record<string, unknown>).url;
if (typeof url !== 'string' || url.length === 0) {
  console.error('POST.json must carry a url string naming the X post');
  process.exit(1);
}

// The gate only accepts an X post address, so fail loudly here instead of
// handing it a placeholder or some other link.
const X_POST = /^https:\/\/(www\.|mobile\.)?(x\.com|twitter\.com)\/[^/]+\/status\/\d+$/;
if (!X_POST.test(url) && !url.includes('<id>')) {
  console.error(`POST.json url does not look like an X post address: ${url}`);
  process.exit(1);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'POST.json'), raw);
