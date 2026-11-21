// Realistic unseen local differential cases from the approved official
// generator, one file at a time, without shipping or retaining the cases.
//
// The RNG is this repository's own implementation of the generator's
// xoshiro128** contract (rng.ts): u32/int/float/pick/chance and
// streamFor(seed, label, index) = sha256(domain, seed, label, index).
// Each file gets a distinct seed and a fresh stream; the generator index still
// controls the header mode (index % 3 !== 2). These seeds are local only, not
// final scored seeds.
//
//   GENERATOR_PATH=/reference/program/generator/subject/csv-cases.mjs \
//   ORACLE_PATH=/reference/program/generator/oracle.js \
//   node tests/generated-differential.mjs

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { run } from '../solve.js';

const generatorPath = process.env.GENERATOR_PATH ?? '/reference/program/generator/subject/csv-cases.mjs';
const oraclePath = process.env.ORACLE_PATH ?? '/reference/program/generator/oracle.js';
const count = Number(process.env.GENERATED_CASES ?? 12);
const { generate } = await import(pathToFileURL(generatorPath).href);
const oracle = (await import(pathToFileURL(oraclePath).href)).run;

const DOMAIN = 'makefun/speed-home/rng/v1';
const rotl = (x, k) => (x << k) | (x >>> (32 - k));

class Rng {
  constructor(key) {
    const v = new DataView(key.buffer, key.byteOffset, 16);
    this.a = v.getUint32(0) | 0;
    this.b = v.getUint32(4) | 0;
    this.c = v.getUint32(8) | 0;
    this.d = v.getUint32(12) | 0;
    if ((this.a | this.b | this.c | this.d) === 0) throw new RangeError('zero xoshiro state');
  }

  u32() {
    const a = this.a;
    const b = this.b;
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    let c = this.c ^ a;
    let d = this.d ^ b;
    const nb = b ^ c;
    const na = a ^ d;
    c ^= t;
    d = rotl(d, 11);
    this.a = na;
    this.b = nb;
    this.c = c;
    this.d = d;
    return result;
  }

  int(lo, hi) {
    const span = hi - lo + 1;
    if (span === 2 ** 32) return lo + this.u32();
    const limit = Math.floor(2 ** 32 / span) * span;
    let x = this.u32();
    while (x >= limit) x = this.u32();
    return lo + (x % span);
  }

  float() {
    return this.u32() / 2 ** 32;
  }

  pick(xs) {
    return xs[this.int(0, xs.length - 1)];
  }

  chance(p) {
    return this.float() < p;
  }
}

function streamFor(seed, label, index) {
  const key = createHash('sha256').update(`${DOMAIN}\n${seed}\n${label}\n${index}`).digest();
  return new Rng(key);
}

const master = 'makefun-mon3-phase2-local-seeds-v1';
let mismatches = 0;
let totalRows = 0;
let totalErrors = 0;
let headers = 0;

for (let k = 0; k < count; k++) {
  const seed = createHash('sha256').update(`${master}\n${k}`).digest('hex');
  const input = generate(streamFor(seed, 'case', k), k);
  const got = run(input);
  const want = oracle(input);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) mismatches++;
  if (input.header) headers++;
  totalRows += got.rows.length;
  totalErrors += got.errors.length;
  console.log(
    `local-${String(k).padStart(2, '0')}: header=${input.header} chars=${input.text.length} ` +
    `columns=${got.columns === null ? 'null' : got.columns.length} rows=${got.rows.length} ` +
    `errors=${got.errors.length} match=${ok}`,
  );
}

console.log(`generated=${count} headerTrue=${headers} headerFalse=${count - headers} rows=${totalRows} errors=${totalErrors} mismatches=${mismatches}`);
process.exit(mismatches === 0 ? 0 : 1);
