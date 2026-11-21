// Differential correctness tests: this entry's run() versus the official
// csv-reader 1.0.0 oracle. The oracle path is external and configurable:
//   ORACLE_PATH=/path/to/oracle.js node tests/differential.mjs
//
// Covers targeted malformed/Unicode inputs, every string up to length 5 over a
// small separator alphabet (both header settings), seeded random fuzz, and, if
// present, the six official practice cases. Prints summaries only.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { run } from '../solve.js';

const oraclePath = process.env.ORACLE_PATH ?? '/reference/program/generator/oracle.js';
const oracle = (await import(pathToFileURL(oraclePath).href)).run;

let checked = 0;
let failures = 0;

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function check(label, text, header) {
  checked++;
  const input = { text, header };
  const got = run(input);
  const want = oracle(input);
  if (same(got, want)) return;
  failures++;
  if (failures <= 10) {
    console.error(`MISMATCH ${label} header=${header} text=${JSON.stringify(text)}`);
    console.error(`  got  ${JSON.stringify(got)}`);
    console.error(`  want ${JSON.stringify(want)}`);
  }
}

function exhaustive(limit) {
  const alphabet = ['a', ',', '"', '\r', '\n', '\uFEFF', '\u00e9'];
  let count = 0;
  function walk(s, depth) {
    for (const header of [false, true]) check(`exhaustive:${JSON.stringify(s)}`, s, header);
    count += 2;
    if (depth === limit) return;
    for (const c of alphabet) walk(s + c, depth + 1);
  }
  walk('', 0);
  return count;
}

function targeted() {
  const samples = [
    '', '\uFEFF', '\uFEFF\uFEFF', 'a', '\uFEFFa', ',', ',,', ',,,',
    '\n', '\r', '\r\n', '\n\n', '\r\n\r\n', '\r\r', '\r\r\n', '\r\n\r',
    '\r\n\uFEFF', 'a\nb', 'a\r\nb', 'a\rb', 'a\r\r\nb', 'a\n\nb',
    '""', '"a"', '"a,b"', '"a""b"', '"a""""b"', '"a\nb"', '"a\r\nb"', '"a\rb"',
    '"a"b', '"a" b', '"a",b', '"a"\r\nb', '"a"\rb', '"a"\r', '"a"', '"""', '""""',
    '"', '"a', '"a\rb', '"a\nb', '"a"b,c', '"a"b\r\nc', '"a"b\rc',
    'a"b', 'a""b', 'a,b', 'a,b,', 'a,,b', 'a,b\nc', 'a,b\r\nc', 'a,b\rc',
    '\uFEFFa,b\nc,d', '\uFEFF\n\r\n"x"\r\n', '\u00e9,\u6771,\uD83D\uDE00',
    'a\u0000b,\u0000', '\uD800', '\uDC00', 'a\uD83D', '\uDE00b',
    'x\r,y\nz', '\r,\r\n', ',\r', '","', '",,",\n', '"a"junk\nb',
    '"a"\rjunk\nb', '"a"\r\rb', '"a",junk\rb', 'short\n1,2,3\n1\n1,2,3,4',
    '1,2\n1\n1,2,3\n"x"y,2', 'h1,h2\n1,2\n\n3,4\n',
  ];
  for (const s of samples) for (const h of [false, true]) check(`target:${JSON.stringify(s)}`, s, h);
  // Non-string text follows String(input.text), as the reference does.
  for (const t of [undefined, null, 0, 42, true, false, ['a', 'b']]) {
    for (const h of [false, true]) check(`coerce:${String(t)}`, t, h);
  }
  // Only header === true is a header; every other value behaves as false.
  const nonBooleanHeaders = [undefined, null, 0, 1, 'true', 'TRUE', 'yes', {}, [], NaN];
  for (const s of ['a,b\n1,2\n', 'a,b\r\n1\r\n', ',\n', '""\n', 'x', 'h\n1\n2\n']) {
    for (const h of nonBooleanHeaders) check(`header-value:${String(h)}`, s, h);
  }
  // Long malformed regressions: wide rows, long runs, deep quoted text and stray CRs.
  const longSamples = [
    `${'a'.repeat(50_000)},b\n1,2\n`,
    `"${'x'.repeat(50_000)}`,
    `"${'x\n'.repeat(2_000)}"`,
    `"${`${'a'.repeat(1_000)},`.repeat(50)}\n`,
    `${'x,'.repeat(500)}y\n1\n1,2\n`,
    `${Array.from({ length: 200 }, (_, i) => `"${i}"junk`).join(',')}\n`,
    `${'h,'.repeat(200)}h\r\n1\r\n`,
    `${'\r'.repeat(5_000)}\n`,
    `${'"a""b",'.repeat(1_000)}\n`,
  ];
  for (const s of longSamples) for (const h of [false, true]) check(`long:${s.length}`, s, h);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fuzz(seed, count) {
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[(rnd() * arr.length) | 0];
  const bits = ['a', 'b', 'x', ' ', '0', '9', ',', '"', '"', '\r', '\n', '\uFEFF', '\u00e9', '\u6771', '\uD83D\uDE00'];
  const chunks = ['""', '\r\n', ', ', '"a"', 'ab', ',"', '\n\n'];
  for (let n = 0; n < count; n++) {
    let s = '';
    const length = (rnd() * 260) | 0;
    while (s.length < length) {
      s += rnd() < 0.08 ? pick(chunks) : pick(bits);
    }
    check(`fuzz:${seed}:${n}`, s, rnd() < 0.5);
  }
}

function practice() {
  const dir = process.env.PRACTICE_DIR ?? '/reference/practice';
  const allowMissing = process.env.ALLOW_MISSING_PRACTICE === '1';
  const casesPath = `${dir}/input/cases.json`;
  const expectedPath = `${dir}/reference/expected.json`;

  let cases;
  try {
    cases = JSON.parse(readFileSync(casesPath, 'utf8'));
  } catch (e) {
    if (allowMissing) {
      console.log(`practice skipped: ${casesPath} unavailable (${e.code ?? e.message})`);
      return;
    }
    throw new Error(`practice input is required but unreadable at ${casesPath}: ${e.code ?? e.message}`);
  }
  if (!Array.isArray(cases) || cases.length !== 6) {
    throw new Error(`practice input must hold 6 cases, got ${Array.isArray(cases) ? cases.length : typeof cases}`);
  }

  let expected = null;
  try {
    const parsed = JSON.parse(readFileSync(expectedPath, 'utf8'));
    if (!Array.isArray(parsed.cases)) throw new Error('expected.json has no cases array');
    expected = parsed.cases;
  } catch (e) {
    if (allowMissing && e.code === 'ENOENT') {
      console.log(`practice expected.json unavailable; oracle comparison still runs (${e.code})`);
    } else {
      throw new Error(`practice expected answers are required but unreadable at ${expectedPath}: ${e.code ?? e.message}`);
    }
  }
  if (expected !== null) {
    if (expected.length !== cases.length) {
      throw new Error(`expected.json holds ${expected.length} cases, input holds ${cases.length}`);
    }
    for (let i = 0; i < expected.length; i++) {
      if (!expected[i] || typeof expected[i] !== 'object' || !('output' in expected[i])) {
        throw new Error(`expected.json case ${i} has no output`);
      }
    }
  }

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    checked++;
    const got = run(c.input);
    const want = oracle(c.input);
    if (!same(got, want)) {
      failures++;
      console.error(`MISMATCH practice oracle ${c.id}: rows ${got.rows.length}/${want.rows.length}, errors ${got.errors.length}/${want.errors.length}`);
    } else {
      const official = expected ? same(got, expected[i].output) : null;
      if (official === false) {
        failures++;
        console.error(`MISMATCH practice expected ${c.id}`);
      }
      console.log(`practice ${c.id}: ok rows=${got.rows.length} errors=${got.errors.length} columns=${got.columns === null ? 'null' : got.columns.length} expected=${official === null ? 'n/a' : official}`);
    }
  }
}

targeted();
const exhaustiveCount = exhaustive(5);
practice();
for (const seed of [1, 2, 3, 20261121]) fuzz(seed, 4000);

console.log(`checked=${checked} exhaustive=${exhaustiveCount} failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
