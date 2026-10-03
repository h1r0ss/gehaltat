// Quality check of the published dataset (public/data/salaries.json) against its sources.
// Flags records for human review; changes nothing. Usage: npm run qa
// Writes data/processed/qa-report.json and prints a summary.
import { EMPLOYMENT_TYPES, INDUSTRIES, REGIONS, SALARY_KINDS, SALARY_SOURCES, SENIORITIES } from '../src/types.ts';
import { existsSync, readFileSync } from 'node:fs';
import { readJsonl, writeJson } from './lib/io.mjs';
import { extractAmounts, hasAmount } from './lib/numbers.mjs';
import { normalizeText } from '../src/lib/filters.ts';

const dataset = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync('public/data/salaries.json', 'utf8')));
const posts = new Map(readJsonl('data/raw/posts.jsonl').map((post) => [post.id, post]));
const ocrByPost = new Map();
for (const row of readJsonl('data/raw/ocr.jsonl')) {
  if (row.status === 'ok') ocrByPost.set(row.postId, [...(ocrByPost.get(row.postId) ?? []), row.text]);
}

const records = dataset.records;
// Flags already checked by hand against the source (data/qa-reviewed.json) are counted but not listed again.
const REVIEWED = existsSync('data/qa-reviewed.json') ? JSON.parse(readFileSync('data/qa-reviewed.json', 'utf8')).records : {};
const flags = [];
let reviewedFlags = 0;
const flag = (record, check, detail) => {
  if (REVIEWED[record.id]?.[check]) reviewedFlags += 1;
  else flags.push({ id: record.id, check, detail });
};

// 1. Contract: types, enums, ids, dates, URLs.
const ids = new Set();
for (const r of records) {
  if (ids.has(r.id)) flag(r, 'contract', 'duplicate id');
  ids.add(r.id);
  const enums = [
    ['industry', INDUSTRIES, false], ['region', REGIONS, true], ['seniority', SENIORITIES, true],
    ['employmentType', EMPLOYMENT_TYPES, false], ['salaryKind', SALARY_KINDS, false], ['salarySource', SALARY_SOURCES, false],
  ];
  for (const [field, allowed, nullable] of enums) {
    if (!(allowed.includes(r[field]) || (nullable && r[field] === null))) flag(r, 'contract', `${field}=${r[field]}`);
  }
  if (!/^https:\/\/www\.reddit\.com\/r\/GehaltAT\/comments\/[a-z0-9]+\//.test(r.sourceUrl)) flag(r, 'contract', 'sourceUrl');
  if (!/^2026-\d\d-\d\d$/.test(r.postDate)) flag(r, 'contract', `postDate=${r.postDate}`);
  if (r.grossMonthly === null && r.netMonthly === null) flag(r, 'contract', 'no monthly figure');
  if (!posts.has(r.postId)) flag(r, 'contract', 'post missing from raw data');
  if (r.roleFamily === null) flag(r, 'taxonomy', `title "${r.standardizedTitle}" has no role family (data/role-families.json)`);
}

// 2. Label context: a figure that only ever appears next to the opposite label (gross vs net).
const NET_WORDS = /netto|\bnet\b|auszahl|[üu]berweis|lohnzahlung|payment|payout/i;
const GROSS_WORDS = /brutto|gross|gehalt|\blohn\b|monatslohn|grundlohn|bez[üu]ge|salary/i;
for (const r of records) {
  const post = posts.get(r.postId);
  if (!post) continue;
  const texts = [post.title, post.selftext, ...(ocrByPost.get(r.postId) ?? []), ...post.comments.map((c) => c.body)].filter(Boolean);
  const check = (field, wrong, right) => {
    const value = r[field];
    if (value === null || r.derived.includes(field)) return;
    const contexts = occurrences(texts, value);
    if (contexts.length && contexts.every((c) => wrong.test(c) && !right.test(c))) {
      flag(r, 'label', `${field} ${value} only appears next to ${field === 'netMonthly' ? 'gross' : 'net'} labels: "${contexts[0].replace(/\s+/g, ' ').trim()}"`);
    }
  };
  check('grossMonthly', NET_WORDS, GROSS_WORDS);
  check('netMonthly', GROSS_WORDS, NET_WORDS);
}

// 3. Net plausibility against an approximate 2026 Austrian gross-to-net calculation (regular month,
// employee, no allowances). Family bonus or commuter allowance can raise net, so the band is asymmetric.
for (const r of records) {
  const { grossMonthly: gross, netMonthly: net } = r;
  if (gross === null || net === null || r.derived.includes('grossMonthly') || r.employmentType !== 'employee') continue;
  if (gross < 1500 || gross > 12000 || (r.hoursPerWeek !== null && r.hoursPerWeek < 30)) continue;
  const deviation = net / expectedNet(gross) - 1;
  if (deviation < -0.12 || deviation > 0.15) {
    flag(r, 'net-plausibility', `net ${net} vs ~${Math.round(expectedNet(gross))} expected for gross ${gross} (${(deviation * 100).toFixed(0)}%)`);
  }
}

// 4. Probable duplicates: identical gross AND net in different posts (reposts or mixed-up payslips).
// Gross alone is not enough: pay scales and round annual salaries repeat legitimately.
const byFigures = new Map();
for (const r of records) {
  if (r.grossMonthly === null || r.netMonthly === null) continue;
  const key = `${r.grossMonthly}|${r.netMonthly}`;
  byFigures.set(key, [...(byFigures.get(key) ?? []), r]);
}
for (const group of byFigures.values()) {
  if (new Set(group.map((r) => r.postId)).size < 2) continue;
  for (const r of group.slice(1)) flag(r, 'duplicate', `same gross and net as ${group[0].id} (${group[0].standardizedTitle})`);
}

// 4b. Mix-ups: a figure the build could not find in the record's own post, but another post contains it.
const amountsByPost = new Map(
  [...posts.values()].map((p) => [p.id, extractAmounts([p.title, p.selftext, ...(ocrByPost.get(p.id) ?? []), ...p.comments.map((c) => c.body)].join('\n'))]),
);
for (const r of records.filter((record) => !record.figuresVerified)) {
  for (const field of ['grossMonthly', 'netMonthly']) {
    const value = r[field];
    if (value === null || r.derived.includes(field) || Number.isInteger(value)) continue;
    // Exact match to the cent: values with cents are distinctive enough to identify a payslip.
    const others = [...amountsByPost].filter(([id, amounts]) => id !== r.postId && amounts.has(Math.round(value * 100) / 100)).map(([id]) => id);
    if (others.length) flag(r, 'mix-up', `${field} ${value} is not in this post but appears in post ${others.join(', ')}`);
  }
}

// 4c. Outliers within the same job title (n >= 5): likely a total with overtime or special payments.
const byTitle = new Map();
for (const r of records) if (r.grossMonthly !== null) byTitle.set(r.standardizedTitle, [...(byTitle.get(r.standardizedTitle) ?? []), r]);
for (const [title, group] of byTitle) {
  if (group.length < 5) continue;
  const sorted = group.map((r) => r.grossMonthly).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  for (const r of group) {
    if (r.grossMonthly > median * 1.8 || r.grossMonthly < median * 0.5) {
      flag(r, 'title-outlier', `gross ${r.grossMonthly} vs median ${median} for ${group.length} × ${title}`);
    }
  }
}

// 5. Internal consistency.
for (const r of records) {
  const years = r.experienceYears;
  if (r.seniority === 'junior' && years !== null && years >= 6) flag(r, 'consistency', `junior with ${years} years`);
  if ((r.seniority === 'senior' || r.seniority === 'lead') && years !== null && years < 2) flag(r, 'consistency', `${r.seniority} with ${years} years`);
  if (r.employmentType === 'apprentice' && (r.grossMonthly ?? 0) > 2300) flag(r, 'consistency', `apprentice earning ${r.grossMonthly} gross`);
  if (r.employmentType === 'intern' && (r.grossMonthly ?? 0) > 3000) flag(r, 'consistency', `intern earning ${r.grossMonthly} gross`);
  if (r.hoursPerWeek !== null && r.hoursPerWeek > 60) flag(r, 'consistency', `${r.hoursPerWeek} h/week`);
}

// 5b. Role group vs. the job title as posted: an exact known title of another group means the
// standardized title is wrong (e.g. "Juristin" filed as "Registered Nurse" under nursing).
const compact = (text) => normalizeText(text).replace(/[^a-z0-9]+/g, '');
const masculine = (word) => (word.endsWith('innen') && word.length >= 8 ? word.slice(0, -5) : word.endsWith('in') && word.length >= 6 ? word.slice(0, -2) : word);
const exactTitles = new Map();
for (const family of dataset.roleFamilies) {
  for (const title of [family.label, family.labelDe, ...family.aliases]) {
    const key = compact(title);
    if (key.length >= 4) exactTitles.set(key, [...(exactTitles.get(key) ?? []), family.id]);
  }
}
for (const r of records) {
  const key = compact(r.jobTitle);
  const owners = exactTitles.get(key) ?? exactTitles.get(masculine(key)) ?? [];
  if (owners.length > 0 && !owners.includes(r.roleFamily)) {
    flag(r, 'role-group', `job title "${r.jobTitle}" is a title of ${owners.join(', ')}, but the record is in ${r.roleFamily} ("${r.standardizedTitle}")`);
  }
}

// 6. Privacy: personal identifiers or special-category hints in published text fields.
const PII = [
  [/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,}/, 'IBAN-like'],
  [/\b\d{4} ?\d{6}\b/, 'social-security-number-like'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, 'email'],
  [/(?:\+43|\b0\d{3})[ /-]?\d{3,}/, 'phone-like'],
  [/\b(?:Herr|Frau|Hr\.|Fr\.)\s+[A-ZÄÖÜ][a-zäöüß]+/, 'personal name'],
  [/(?:straße|strasse|gasse|platz|weg)\s+\d+/i, 'street address'],
  [/krankenstand|krankheit|krank geschrieben|krankengeld|\bsick|illness|diagnos|schwanger|pregnan|mutterschutz|maternity/i, 'health-related'],
  [/familienbonus|\bfamily|familienplanung|\bkinder(?!garten)\w*|\bkids?\b|children|\bchild(?!hood)|parental|elternteilzeit|elternkarenz|\bkarenz|husband|\bwife\b|ehemann|ehefrau|spouse|verheiratet|married|divorc|geschieden|alleinerzieh/i, 'family circumstance'],
  [/\b(?:female|male|weiblich|männlich)\b|\b(?:age|alter)\s*~?\d{2}\b|\b[MWF]\s?\d{2}\b|\b\d{2}\s?[MWF]\b/, 'age or gender'],
];
for (const r of records) {
  const text = [r.notes, ...r.evidence].join(' | ');
  for (const [pattern, label] of PII) if (pattern.test(text)) flag(r, 'privacy', `${label}: "${text.match(pattern)[0]}"`);
}

// 7. Coverage and classification statistics.
const share = (predicate) => `${Math.round((records.filter(predicate).length / records.length) * 100)}%`;
const titles = countBy(records, (r) => r.standardizedTitle);
const titleVariants = new Map();
for (const title of Object.keys(titles)) {
  const key = title.toLowerCase().replace(/[^a-zäöüß]/g, '').replace(/(in|s)$/, '');
  titleVariants.set(key, [...(titleVariants.get(key) ?? []), title]);
}
const industryConflicts = Object.entries(titles)
  .filter(([, n]) => n >= 3)
  .map(([title]) => [title, countBy(records.filter((r) => r.standardizedTitle === title), (r) => r.industry)])
  .filter(([, industries]) => Object.keys(industries).length > 1);

const report = {
  generatedAt: new Date().toISOString(),
  records: records.length,
  coverage: {
    grossMonthly: share((r) => r.grossMonthly !== null),
    netMonthly: share((r) => r.netMonthly !== null),
    experienceYears: share((r) => r.experienceYears !== null),
    region: share((r) => r.region !== null),
    hoursPerWeek: share((r) => r.hoursPerWeek !== null),
    seniority: share((r) => r.seniority !== null),
    industryOther: share((r) => r.industry === 'Other'),
    figuresVerified: share((r) => r.figuresVerified),
    derivedGrossMonthly: share((r) => r.derived.includes('grossMonthly')),
    assumed14Payments: share((r) => r.derived.includes('paymentsPerYear')),
    confidenceBelow07: share((r) => r.confidence < 0.7),
  },
  distinctTitles: Object.keys(titles).length,
  singletonTitles: Object.values(titles).filter((n) => n === 1).length,
  titleSpellingVariants: [...titleVariants.values()].filter((v) => v.length > 1),
  industryConflicts: Object.fromEntries(industryConflicts),
  flagCounts: countBy(flags, (f) => f.check),
  flags,
};
writeJson('data/processed/qa-report.json', report);

console.log(`QA of ${records.length} records -> data/processed/qa-report.json`);
console.log('Coverage:', JSON.stringify(report.coverage));
console.log(`Titles: ${report.distinctTitles} distinct, ${report.singletonTitles} used once, ${report.titleSpellingVariants.length} spelling-variant groups, ${industryConflicts.length} titles in several industries`);
console.log('Flags:', JSON.stringify(report.flagCounts), reviewedFlags ? `(${reviewedFlags} reviewed by hand, see data/qa-reviewed.json)` : '');

// Approximate 2026 Austrian regular-month net: employee social insurance ~18.07% up to the
// contribution ceiling, annualised wage-tax brackets, minus the basic transport tax credit.
function expectedNet(gross) {
  const social = 0.1807 * Math.min(gross, 6930);
  const taxable = (gross - social) * 12;
  const brackets = [[13539, 0], [21992, 0.2], [36458, 0.3], [70365, 0.4], [104859, 0.48], [1e6, 0.5], [Infinity, 0.55]];
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of brackets) {
    if (taxable > lower) tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return gross - social - Math.max(0, tax - 496) / 12;
}

// Text around every occurrence of a value (any number format) across the source texts.
function occurrences(texts, value) {
  const contexts = [];
  for (const text of texts) {
    for (const match of text.matchAll(/\d[\d.,' ]*\d(?:\s?[kK]\b)?|\d/g)) {
      if (hasAmount(extractAmounts(match[0]), value)) {
        contexts.push(text.slice(Math.max(0, match.index - 45), match.index + match[0].length + 45));
      }
    }
  }
  return contexts;
}

function countBy(list, keyOf) {
  const counts = {};
  for (const item of list) counts[keyOf(item)] = (counts[keyOf(item)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}
