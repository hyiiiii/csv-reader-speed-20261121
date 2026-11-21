// Local README branding structure validation, stdlib only.
//
// It checks the planned repository identity's three linked make.fun badge
// images, the explicit make.fun / Bounty links, and rejects placeholders,
// referral/marketing query parameters, non-make.fun link hosts and unexpected
// images. Fenced code, indented code blocks, HTML comments and inline code are
// ignored. This says nothing about actual GitHub rendering or GitHub About.
//
//   node tests/branding.mjs

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OWNER = 'hyiiiii';
const REPO = 'csv-reader-speed-20261121';
const SLUG = 'csv-reader-speed-01-run-20261121';
const BADGE = `https://make.fun/badge/${SLUG}`;
const BOUNTY = `https://make.fun/bounty/${SLUG}`;

const BADGES = [
  {
    label: 'make.fun',
    src: `${BADGE}.svg`,
    dest: BOUNTY,
    markdown: `[![make.fun](${BADGE}.svg)](${BOUNTY})`,
  },
  {
    label: 'rank',
    src: `${BADGE}/${OWNER}/${REPO}/rank.svg`,
    dest: `${BOUNTY}/leaderboard`,
    markdown: `[![rank](${BADGE}/${OWNER}/${REPO}/rank.svg)](${BOUNTY}/leaderboard)`,
  },
  {
    label: 'reward',
    src: `${BADGE}/${OWNER}/${REPO}/reward.svg`,
    dest: BOUNTY,
    markdown: `[![reward](${BADGE}/${OWNER}/${REPO}/reward.svg)](${BOUNTY})`,
  },
];

const REQUIRED_LINKS = [
  '[make.fun](https://make.fun/)',
  `[Bounty](${BOUNTY})`,
];

function stripIgnored(markdown) {
  let text = markdown.replace(/<!--[\s\S]*?-->/g, '');
  const lines = text.split('\n');
  const kept = [];
  let fenceChar = '';
  let fenceLen = 0;
  for (const line of lines) {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceChar) {
      if (fence && fence[1][0] === fenceChar && fence[1].length >= fenceLen) {
        fenceChar = '';
        fenceLen = 0;
      }
      continue;
    }
    if (fence) {
      fenceChar = fence[1][0];
      fenceLen = fence[1].length;
      continue;
    }
    if (/^(?: {4,}|\t)/.test(line)) continue;
    kept.push(line);
  }
  text = kept.join('\n');
  return text.replace(/(`+)([\s\S]*?)\1/g, ' ');
}

function imageSources(text) {
  const sources = [];
  const re = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g;
  for (let m; (m = re.exec(text)); ) sources.push(m[1]);
  return sources;
}

function externalUrls(text) {
  const urls = [];
  const re = /https?:\/\/[^\s<>()\[\]]+/g;
  for (let m; (m = re.exec(text)); ) urls.push(m[0].replace(/[.,;:]+$/, ''));
  return urls;
}

export function validateReadme(markdown) {
  const text = stripIgnored(markdown);
  const errors = [];

  for (const badge of BADGES) {
    const count = text.split(badge.markdown).length - 1;
    if (count !== 1) errors.push(`badge ${badge.label}: expected exactly one linked-image Markdown occurrence, got ${count}`);
  }

  for (const link of REQUIRED_LINKS) {
    if (!text.includes(link)) errors.push(`missing explicit link: ${link}`);
  }

  const expectedSources = BADGES.map((b) => b.src).sort();
  const actualSources = imageSources(text).sort();
  if (JSON.stringify(actualSources) !== JSON.stringify(expectedSources)) {
    errors.push(`image sources must be exactly the three make.fun badges; got ${JSON.stringify(actualSources)}`);
  }

  const placeholderPatterns = [
    [/\bOWNER\b/, 'OWNER placeholder'],
    [/\bREPO\b/, 'REPO placeholder'],
    [/\{\s*(?:owner|repo)\s*\}/i, 'brace placeholder'],
    [/<(?:owner|repo)>/i, 'angle placeholder'],
    [/\byour[-_ ]?(?:org|user|repo)\b/i, 'generic repository placeholder'],
  ];
  for (const [re, name] of placeholderPatterns) {
    if (re.test(text)) errors.push(`forbidden ${name}`);
  }

  if (/[?&](?:ref|referral|aff|affiliate|utm_[a-z0-9_]+|promo|campaign|source)=/i.test(text)) {
    errors.push('forbidden referral/marketing query parameter');
  }

  for (const raw of externalUrls(text)) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      errors.push(`invalid URL: ${raw}`);
      continue;
    }
    if (url.protocol !== 'https:' || url.hostname !== 'make.fun') {
      errors.push(`forbidden external link host: ${raw}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function selfTests() {
  const links = `${REQUIRED_LINKS[0]} and ${REQUIRED_LINKS[1]}`;
  const badgeLines = BADGES.map((b) => b.markdown).join('\n');
  const valid = `# test\n\n${badgeLines}\n\n${links}\n`;
  const wrong = valid.replace(`${BADGE}/${OWNER}/${REPO}/rank.svg`, `${BADGE}/someone/other-repo/rank.svg`);
  const cases = [
    ['valid linked-image badges', valid, true],
    ['badges only in fenced code', `# test\n\n\`\`\`\n${badgeLines}\n\`\`\`\n\n${links}\n`, false],
    ['badges only in HTML comment', `# test\n\n<!--\n${badgeLines}\n-->\n\n${links}\n`, false],
    ['badges only in indented code', `# test\n\n${badgeLines.split('\n').map((l) => `    ${l}`).join('\n')}\n\n${links}\n`, false],
    ['badges only as bare URLs', `# test\n\n${BADGES.map((b) => b.src).join('\n')}\n\n${links}\n`, false],
    ['wrong owner/repo', wrong, false],
    ['referral query parameter', `${valid}\n[ref](${BOUNTY}?ref=abc)\n`, false],
    ['marketing image', `${valid}\n![x](https://img.shields.io/badge/x.svg)\n`, false],
    ['non-make.fun link', `${valid}\n[x](https://example.com/)\n`, false],
  ];
  let failed = 0;
  for (const [name, md, expected] of cases) {
    const got = validateReadme(md).ok;
    const pass = got === expected;
    console.log(`${pass ? 'PASS' : 'FAIL'} self-test: ${name} (expected ${expected}, got ${got})`);
    if (!pass) failed++;
  }
  return { failed, total: cases.length };
}

const tests = selfTests();
const readmePath = process.env.README_PATH ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', 'README.md');
const result = validateReadme(readFileSync(readmePath, 'utf8'));
if (!result.ok) {
  console.error(`README branding structure: FAIL (${readmePath})`);
  for (const error of result.errors) console.error(`- ${error}`);
} else {
  console.log(`README branding structure: PASS (${readmePath})`);
}
console.log('note: this validates Markdown structure only, not GitHub rendering or GitHub About.');
if (tests.failed !== 0) console.error(`self-tests failed: ${tests.failed}/${tests.total}`);
process.exit(tests.failed === 0 && result.ok ? 0 : 1);
