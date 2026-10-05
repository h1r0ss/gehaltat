// Checks an agent's output file against its input shard before the dataset is built.
// Usage: npm run check-extraction -- data/extraction/input/<name>.md
// Reads data/extraction/output/<name>.jsonl. Exit code 1 when anything must be fixed.
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  EMPLOYMENT_TYPES,
  INDUSTRIES,
  REGIONS,
  SALARY_KINDS,
  SALARY_SOURCES,
  SENIORITIES,
} from '../src/types.ts';
import { readJsonlLoose } from './lib/io.mjs';
import { extractAmounts, hasAmount } from './lib/numbers.mjs';
import { IMAGE_EVIDENCE_PREFIX, normalizeForMatch } from './lib/records.mjs';

const inputPath = process.argv[2];
if (!inputPath || !existsSync(inputPath)) {
  console.error('Usage: npm run check-extraction -- data/extraction/input/<name>.md');
  process.exit(1);
}
const outputPath = `data/extraction/output/${basename(inputPath, '.md')}.jsonl`;
if (!existsSync(outputPath)) {
  console.error(`Missing output file ${outputPath}`);
  process.exit(1);
}

const blocks = new Map();
const shard = readFileSync(inputPath, 'utf8');
const headers = [...shard.matchAll(/^=== POST (\S+) \|/gm)];
headers.forEach((match, i) => blocks.set(match[1], shard.slice(match.index, headers[i + 1]?.index ?? shard.length)));

const ENUMS = {
  industry: [INDUSTRIES, false],
  region: [REGIONS, true],
  seniority: [SENIORITIES, true],
  employmentType: [EMPLOYMENT_TYPES, false],
  salaryKind: [SALARY_KINDS, false],
  salarySource: [SALARY_SOURCES, false],
};
const NUMBERS = ['experienceYears', 'hoursPerWeek', 'paymentsPerYear', 'grossMonthly', 'grossAnnual', 'netMonthly', 'hourlyGross', 'bonusAnnual'];
const FIGURES = ['grossMonthly', 'grossAnnual', 'netMonthly', 'hourlyGross', 'bonusAnnual'];
const STRINGS = ['jobTitle', 'standardizedTitle', 'notes'];

const problems = [];
const { rows, errors } = readJsonlLoose(outputPath);
errors.forEach((error) => problems.push(`line ${error.line}: invalid JSON (${error.message})`));

const seen = new Map();
let records = 0;
let skips = 0;
for (const { value: row, line } of rows) {
  const at = `line ${line} (${row.postId ?? 'no postId'})`;
  const block = blocks.get(row.postId);
  if (!block) {
    problems.push(`${at}: postId not in this shard`);
    continue;
  }
  seen.set(row.postId, (seen.get(row.postId) ?? 0) + 1);
  if (row.skip === true) {
    skips += 1;
    if (typeof row.reason !== 'string' || !row.reason) problems.push(`${at}: skip needs a reason`);
    continue;
  }
  records += 1;
  if (typeof row.inAustria !== 'boolean') problems.push(`${at}: inAustria must be true or false`);
  if (row.allIn !== null && typeof row.allIn !== 'boolean') problems.push(`${at}: allIn must be boolean or null`);
  if (row.collectiveAgreement !== null && typeof row.collectiveAgreement !== 'string') problems.push(`${at}: collectiveAgreement must be string or null`);
  for (const field of STRINGS) if (typeof row[field] !== 'string') problems.push(`${at}: ${field} must be a string`);
  for (const [field, [allowed, nullable]] of Object.entries(ENUMS)) {
    if (!(allowed.includes(row[field]) || (nullable && row[field] === null))) problems.push(`${at}: ${field} "${row[field]}" not allowed`);
  }
  for (const field of NUMBERS) {
    if (row[field] !== null && typeof row[field] !== 'number') problems.push(`${at}: ${field} must be a number or null`);
  }
  if (row.paymentsPerYear !== null && row.paymentsPerYear !== 12 && row.paymentsPerYear !== 14) problems.push(`${at}: paymentsPerYear must be 12, 14 or null`);
  if (typeof row.confidence !== 'number' || row.confidence < 0 || row.confidence > 1) problems.push(`${at}: confidence must be 0..1`);
  else if (row.confidence < 0.5) problems.push(`${at}: confidence ${row.confidence} is below 0.5; write a skip line instead`);
  if (!FIGURES.slice(0, 4).some((field) => typeof row[field] === 'number')) problems.push(`${at}: no salary figure; use a skip line instead`);

  const imageCount = Number(block.match(/\| images: (\d+)/)?.[1] ?? 0);
  const evidence = Array.isArray(row.evidence) ? row.evidence.filter((snippet) => typeof snippet === 'string') : [];
  const imageSnippets = evidence.filter((snippet) => snippet.startsWith(IMAGE_EVIDENCE_PREFIX));
  const textAmounts = extractAmounts(postText(block));
  const imageAmounts = extractAmounts(imageSnippets.join('\n'));
  for (const field of FIGURES) {
    const value = row[field];
    if (typeof value !== 'number' || hasAmount(textAmounts, value)) continue;
    if (imageCount === 0) problems.push(`${at}: ${field} ${value} does not appear in the post text (copy stated figures only, never compute)`);
    else if (!hasAmount(imageAmounts, value)) problems.push(`${at}: ${field} ${value} is neither in the post text nor in an "${IMAGE_EVIDENCE_PREFIX} ..." evidence line`);
  }

  const haystack = normalizeForMatch(postText(block));
  if (evidence.length === 0 || evidence.length !== row.evidence.length) problems.push(`${at}: evidence must list 1-3 snippets (strings)`);
  for (const snippet of evidence) {
    if (snippet.startsWith(IMAGE_EVIDENCE_PREFIX)) {
      if (imageCount === 0) problems.push(`${at}: "${IMAGE_EVIDENCE_PREFIX}" evidence but the post has no downloaded image`);
      else if (!/\d/.test(snippet)) problems.push(`${at}: image evidence "${snippet.slice(0, 60)}" must contain the figure`);
    } else if (!haystack.includes(normalizeForMatch(snippet))) {
      problems.push(`${at}: evidence "${snippet.slice(0, 60)}" is not a verbatim substring of the post (prefix "${IMAGE_EVIDENCE_PREFIX} " if read from the image)`);
    }
  }
}

// Post text without the shard's own markup (header line, image paths, comment score markers).
function postText(block) {
  return block
    .split('\n')
    .filter((line) => !line.startsWith('=== POST ') && !line.startsWith('IMAGES ('))
    .map((line) => line.replace(/^\s*- \[(?:OP )?\d+\] /, '').replace(/^(TITLE|BODY): /, ''))
    .join('\n');
}

for (const id of blocks.keys()) {
  if (!seen.has(id)) problems.push(`post ${id}: missing from output`);
  else if (seen.get(id) > 2) problems.push(`post ${id}: more than 2 records`);
}

console.log(`${basename(outputPath)}: ${blocks.size} posts in shard, ${records} records, ${skips} skips, ${problems.length} problems`);
problems.slice(0, 60).forEach((problem) => console.log(`- ${problem}`));
if (problems.length > 60) console.log(`- ... ${problems.length - 60} more`);
process.exit(problems.length ? 1 : 0);
