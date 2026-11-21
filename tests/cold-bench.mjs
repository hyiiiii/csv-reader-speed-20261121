// Cold end-to-end benchmark: every run is a fresh Node process that reads
// /input/cases.json (JSON parse), runs the whole entry, and writes
// /output/answers.json. It measures the entire process CPU with bash's
// TIMEFORMAT (%U user + %S system + %R real); /usr/bin/time is not installed
// here, so this documented equivalent is used instead.
//
// Entry and reference drivers alternate, with the same V8 flags and data.
// Hashes of the written answer files must match each other and the published
// practice expected answers. Local evidence only, not the official heat.
//
//   ROUNDS=5 node tests/cold-bench.mjs

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const inputDir = process.env.CASES_DIR ?? '/reference/practice/input';
const expectedPath = process.env.EXPECTED_PATH ?? '/reference/practice/reference/expected.json';
const outRoot = process.env.BENCH_OUT_DIR ?? '/output/cold-bench';
const rounds = Number(process.env.ROUNDS ?? 5);
const warmups = Number(process.env.WARMUPS ?? 1);
const pinCpu = process.env.PIN_CPU ?? '';
if (pinCpu !== '' && !/^\d+(,\d+)*$/.test(pinCpu)) throw new Error(`PIN_CPU must be a CPU list, got ${pinCpu}`);

const mains = {
  entry: resolve(root, 'main.ts'),
  oracle: '/reference/baselines/csv-reader/main.ts',
};

const quote = (s) => `'${String(s).replaceAll("'", "'\\''")}'`;

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function run(name) {
  const outDir = resolve(outRoot, name);
  mkdirSync(outDir, { recursive: true });
  const pin = pinCpu === '' ? '' : `taskset -c ${quote(pinCpu)} `;
  const command = `TIMEFORMAT='%3U %3S %3R'; { time ${pin}${quote(process.execPath)} ${quote(mains[name])}; } 2>&1`;
  const output = execFileSync('/bin/bash', ['-c', command], {
    env: { ...process.env, MAKEFUN_INPUT_DIR: inputDir, MAKEFUN_OUTPUT_DIR: outDir },
    encoding: 'utf8',
    maxBuffer: 1 << 20,
  });
  const lines = output.trim().split('\n').filter(Boolean);
  const m = /^(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)$/.exec(lines.at(-1) ?? '');
  if (!m) throw new Error(`${name} run produced no TIMEFORMAT line; output: ${output.slice(0, 500)}`);
  return {
    userSeconds: Number(m[1]),
    systemSeconds: Number(m[2]),
    realSeconds: Number(m[3]),
    hash: hashFile(resolve(outDir, 'answers.json')),
  };
}

let expectedHash = null;
try {
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8')).cases.map((c) => c.output);
  expectedHash = createHash('sha256').update(JSON.stringify(expected)).digest('hex');
} catch {
  expectedHash = null;
}

for (let i = 0; i < warmups; i++) {
  run('entry');
  run('oracle');
}

const results = { entry: [], oracle: [] };
for (let r = 0; r < rounds; r++) {
  const order = r % 2 === 0 ? ['entry', 'oracle'] : ['oracle', 'entry'];
  for (const name of order) results[name].push(run(name));
}

const cpu = (r) => (r.userSeconds + r.systemSeconds) * 1000;
const sorted = (arr) => arr.map(cpu).sort((a, b) => a - b);
const median = (arr) => {
  const s = sorted(arr);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const wallMedian = (arr) => {
  const s = arr.map((r) => r.realSeconds * 1000).sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ms = (v) => `${v.toFixed(1)} ms`;

console.log(`mode: fresh process, ${pinCpu === '' ? 'all CPUs' : `pinned to CPU ${pinCpu}`}, ${warmups} warm-up pair(s), ${rounds} measured rounds`);
for (const name of ['entry', 'oracle']) {
  const arr = results[name];
  const s = sorted(arr);
  console.log(`${name}: process CPU median ${ms(median(arr))}, min ${ms(s[0])}, max ${ms(s.at(-1))}, wall median ${ms(wallMedian(arr))}, runs=${arr.length}`);
}
const e = median(results.entry);
const o = median(results.oracle);
console.log(`cold end-to-end median CPU speedup entry/oracle: ${(o / e).toFixed(2)}x (${ms(e)} vs ${ms(o)})`);

const entryHashes = new Set(results.entry.map((r) => r.hash));
const allHashes = new Set([...results.entry, ...results.oracle].map((r) => r.hash));
console.log(`entry outputs byte-identical: ${entryHashes.size === 1} (${[...entryHashes][0]})`);
console.log(`entry/reference output hash equal: ${allHashes.size === 1}`);
if (expectedHash !== null) console.log(`matches published expected hash: ${entryHashes.size === 1 && entryHashes.has(expectedHash)}`);
if (entryHashes.size !== 1 || allHashes.size !== 1 || (expectedHash !== null && !entryHashes.has(expectedHash))) process.exit(1);
