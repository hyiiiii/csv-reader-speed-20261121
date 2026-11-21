// Fair local benchmark: alternate fresh processes of this entry and the
// official csv-reader 1.0.0 oracle over the same six practice cases, with the
// same V8 flags, and compare CPU time and answer hashes. Local evidence only,
// not the official repeated heat or its 95% confidence result.
//
//   ORACLE_PATH=/path/to/oracle.js ROUNDS=7 node tests/benchmark.mjs

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const impls = {
  entry: resolve(root, 'solve.js'),
  oracle: process.env.ORACLE_PATH ?? '/reference/program/generator/oracle.js',
};
const rounds = Number(process.env.ROUNDS ?? 7);
const casesPath = process.env.CASES ?? '/reference/practice/input/cases.json';

function one(name) {
  const out = execFileSync(process.execPath, [resolve(here, 'bench-one.mjs')], {
    env: { ...process.env, IMPL: impls[name], CASES: casesPath },
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').at(-1));
}

const results = { entry: [], oracle: [] };
for (let r = 0; r < rounds; r++) {
  const order = r % 2 === 0 ? ['entry', 'oracle'] : ['oracle', 'entry'];
  for (const name of order) results[name].push(one(name));
}

const hashes = new Set([...results.entry, ...results.oracle].map((r) => r.hash));
const cpu = (arr) => arr.map((r) => r.cpuMicros).sort((a, b) => a - b);
const median = (arr) => {
  const s = cpu(arr);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ms = (us) => `${(us / 1000).toFixed(1)} ms`;

for (const name of ['entry', 'oracle']) {
  const arr = results[name];
  const s = cpu(arr);
  console.log(`${name}: cpu median ${ms(median(arr))}, min ${ms(s[0])}, max ${ms(s.at(-1))}, runs=${arr.length}`);
}
const e = median(results.entry);
const o = median(results.oracle);
console.log(`median CPU speedup entry/oracle: ${(o / e).toFixed(2)}x (${ms(e)} vs ${ms(o)})`);
console.log(`answer hashes identical: ${hashes.size === 1} (${[...hashes][0]})`);
if (hashes.size !== 1) process.exit(1);
