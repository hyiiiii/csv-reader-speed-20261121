# csv-reader 1.0.0 exact fast drop-in

An original, dependency-free ESM CSV reader for the
[make.fun](https://make.fun/) contest
[Bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
**Read broken CSV files faster, 21 November 2026**.

`solve.js` exports `run(input)`, returning exactly the `{columns, rows, errors}`
answer of make.fun's own `csv-reader` 1.0.0 for `{text, header}`. `main.ts` is the
harness driver: it reads every case from `/input/cases.json`, answers each in
order, and writes `/output/answers.json`. `MAKEFUN_INPUT_DIR` and
`MAKEFUN_OUTPUT_DIR` override those directories locally.

The reader scans UTF-16 code units once, left to right, copying unquoted and
quoted text in runs instead of joining one character at a time. It preserves the
reference policy exactly: leading BOM, empty records, stray CR, CRLF and lone-CR
folding inside quotes, doubled quotes, quote junk, unterminated-quote fallback,
short/long row padding and truncation, error order, line and row numbers, and
`header === true` handling. It uses no lookup tables, no case IDs, no clock, no
randomness and no network.

## Local results

All numbers below are local practice evidence, not the official heat.

- Official practice: **6 / 6 cases exactly equal** to the expected answers, and
  the committed test requires both the oracle and `expected.json` by default
  (`ALLOW_MISSING_PRACTICE=1` is the explicit opt-out).
- Differential suite: **55,462 checks, 0 failures**, which includes
  **39,216 exhaustive small-alphabet cases** (every string up to length 5 over
  `a , " CR LF BOM é`, both header settings), targeted malformed/Unicode and
  long-run regressions, non-boolean header values, and **16,000 seeded
  randomized fuzz cases** over four seeds.
- Generated unseen local cases: **12 files from 12 distinct local seeds**
  (8 header, 4 no-header), **127,947 rows**, **3,503 errors**, **0 mismatches**
  against the approved official generator and oracle. Cases were generated one
  at a time and neither retained nor shipped; these are not final scored seeds.
- Driver determinism: two separate `main.ts` runs wrote **byte-identical**
  `answers.json` (SHA-256
  `bb5b6cc5c523edf0b18a20cd1f577b0d461b3ae021fd3ab2c9b4e4a5f01002ed`), matching
  the official practice expected outputs.
- Parser-only benchmark, alternating fresh processes with a warm pass inside
  each process, same V8 flag (`--no-incremental-marking`): **3.28x median CPU**
  over 9 rounds (entry 130.6 ms vs reference 428.0 ms), with identical answer
  hashes. This excludes JSON parse/write and process startup.
- One substantive optimization (fused unquoted-record path) measured **1.14x**
  over the previous source in a 9-round alternating A/B run (142.9 ms to
  125.3 ms), same answer hash, then passed the full correctness suite.
- Cold end-to-end benchmark, fresh process including Node startup, JSON input
  parse, `run()` and output write, pinned to one CPU: **2.25x median CPU** over
  7 rounds (entry 441.0 ms vs reference 994.0 ms), with byte-identical outputs
  matching the published expected answers. `/usr/bin/time` is not installed, so
  bash `TIMEFORMAT` (`%U + %S`) is the documented equivalent. Unpinned 5-round
  runs ranged from 2.38x to 2.62x and were noisier.

These results are local only. They are not the official repeated timed heat, not
a 95%-confidence result, and not a claim of winning or of a paid place.

## Local make.fun check (worktree)

```sh
MAKEFUN_OFFLINE=1 node /reference/cli/makefun.mjs check \
  --kit /reference --repo /workspace/makefun-mon3-csv-20261121 \
  --worktree --json
```

Full report: `/output/check-final-worktree.json` (outside this repository).
Result: `ok: true`, `failed: []`, exit `0`.

- **PASS (5):** `competition_open`, `snapshot`, `license_osi`, `entrypoint`,
  `entry_size`. `license_osi` passes after adding the literal
  `SPDX-License-Identifier: MIT` line to `LICENSE`.
- **SKIP (15):** `strategy_note`, `committed_secret`, and every transcript /
  thinking check, including `transcripts_present`, `transcripts_recorded`,
  `thinking_*`, and `transcripts_run_record`. This bounty's live requirements
  and `competition.yaml:204` set `transcripts_required: false`; those checks
  have `applies: false`. **These skips are not passes.**
- **SUBMISSION (5):** `repo_public`, `repo_owner`, `repo_created_after_open`,
  `commit_in_repo`, `duplicate_snapshot`. These are server-only gates, not local
  failures.

The check examined the worktree, not a submitted commit; the site grades the
commit that is entered. It does **not** check README badge rendering or GitHub
About, so those remain publication gates. True native logs with time/usage are
still preserved for provenance; no private transcript or hidden instruction is
included.

## Commands

```sh
# Exact practice run, writing answers
MAKEFUN_INPUT_DIR=/reference/practice/input \
MAKEFUN_OUTPUT_DIR=/output/run1 \
node main.ts

# Differential tests against the official external oracle
ORACLE_PATH=/reference/program/generator/oracle.js node tests/differential.mjs

# Realistic unseen local cases from the approved generator (one at a time)
GENERATOR_PATH=/reference/program/generator/subject/csv-cases.mjs \
ORACLE_PATH=/reference/program/generator/oracle.js \
node tests/generated-differential.mjs

# Parser-only benchmark (warm pass inside each fresh process)
ORACLE_PATH=/reference/program/generator/oracle.js ROUNDS=9 node tests/benchmark.mjs

# Cold end-to-end benchmark (fresh process CPU, JSON parse/run/write)
PIN_CPU=2 ROUNDS=7 node tests/cold-bench.mjs
```

The reference stays external through `ORACLE_PATH`, `PRACTICE_DIR`, `CASES`,
`GENERATOR_PATH`, `EXPECTED_PATH` and `CASES_DIR`; production `solve.js` imports
nothing outside this repository.

## Files

- `solve.js` — the entry reader (`run(input)`).
- `main.ts` — harness driver for `/input/cases.json` -> `/output/answers.json`.
- `package.json` — ESM, no dependencies.
- `tests/differential.mjs` — targeted, exhaustive and seeded differential tests;
  practice data is required unless `ALLOW_MISSING_PRACTICE=1`.
- `tests/generated-differential.mjs` — own xoshiro128** stream contract, 12
  distinct local seeds, official generator/oracle, one case at a time.
- `tests/bench-one.mjs` — one fresh process, one timed implementation pass.
- `tests/benchmark.mjs` — alternating fresh-process entry/oracle parser benchmark.
- `tests/cold-bench.mjs` — fresh-process end-to-end CPU benchmark with hashes,
  optionally pinned to one CPU via `PIN_CPU`.
- `LICENSE` — MIT.

## Caveats

- The final scored set is drawn after entries close; this solution is general and
  never reads practice answers or `/reference` in production.
- Peak memory is not scored; only CPU time is ranked, and outputs must be
  byte-identical across two executions.
- The local host has 8 CPUs; the pinned cold benchmark is only a proxy for the
  official 1-CPU container. Official timing also uses fresh containers and nets
  out a do-nothing control, so local percentages are not official results.
- Generated local cases use local seeds from this phase, not the final drand
  seed. No generated case or answer file is kept in the repository.
- The official local make.fun check does **not** cover server-side README/About
  branding. Branding is not claimed as passed.

## PENDING publication checklist (not done yet)

No public repository or remote exists yet. Do not create a public repo, add a
remote, push, sign, log in, pay or submit as part of this phase. Public
publication and branding remain pending.

- [x] `LICENSE` carries the literal `SPDX-License-Identifier: MIT`; the local
      check's `license_osi` passes.
- [x] `.makefun/owner.json` contains only the already-confirmed public linked
      make.fun wallet marker; it is not a private key and required no signature.
- [ ] Decide the exact GitHub `OWNER/REPO` identity (pending; public repo not
      created).
- [ ] Replace the badge placeholders below with the three live linked Markdown
      **image** badges, using the real owner/repo. The eventual README must show:

      [![competition](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
      [![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/OWNER/REPO/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
      [![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/OWNER/REPO/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

- [ ] GitHub About homepage exactly:
      `https://make.fun/bounty/csv-reader-speed-01-run-20261121`
- [ ] GitHub About topic exactly: `makefun`
- [ ] Make the repository public, declare actual ownership later, and audit the
      full real native logs/private context.
- [ ] Run the official make.fun check on the commit to submit; the local worktree
      check passed, and the five `SUBMISSION` server gates remain.
- [ ] Obtain the user's own signature.
- [ ] Then submit; never claim winning, submission or branding before these.

## License

MIT. See `LICENSE`.
