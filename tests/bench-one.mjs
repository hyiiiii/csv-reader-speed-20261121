// One fresh process, one implementation, one timed pass. Prints a single JSON
// line with CPU/wall time and an answer hash. IMPL selects the module.
//
//   IMPL=../solve.js node tests/bench-one.mjs
//   IMPL=/reference/program/generator/oracle.js node tests/bench-one.mjs

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

const impl = process.env.IMPL;
const casesPath = process.env.CASES ?? '/reference/practice/input/cases.json';
const { run } = await import(pathToFileURL(impl).href);

const cases = JSON.parse(readFileSync(casesPath, 'utf8'));

function pass() {
  const answers = new Array(cases.length);
  for (let i = 0; i < cases.length; i++) answers[i] = run(cases[i].input);
  return answers;
}

pass();

const cpu0 = process.cpuUsage();
const wall0 = performance.now();
const answers = pass();
const wall = performance.now() - wall0;
const cpu = process.cpuUsage(cpu0);

const hash = createHash('sha256').update(JSON.stringify(answers)).digest('hex');
console.log(JSON.stringify({
  impl,
  cpuMicros: cpu.user + cpu.system,
  userMicros: cpu.user,
  systemMicros: cpu.system,
  wallMillis: Number(wall.toFixed(3)),
  hash,
  rows: answers.map((a) => a.rows.length),
  errors: answers.map((a) => a.errors.length),
}));
