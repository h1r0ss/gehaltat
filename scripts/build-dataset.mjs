// Builds public/data/salaries.json from raw posts, OCR text and agent extraction output.
// Usage: npm run build-data
import { existsSync, readFileSync } from 'node:fs';
import { listFiles, readJsonl, readJsonlLoose, writeJson } from './lib/io.mjs';
import { isEligible, loadGoneImages } from './lib/posts.mjs';
import { buildRecord } from './lib/records.mjs';
import { redactAgeGender } from './lib/redact.mjs';
import { netMonthly } from '../src/lib/net.ts';

const POSTS_FILE = 'data/raw/posts.jsonl';
const OCR_FILE = 'data/raw/ocr.jsonl';
const EXTRACTION_DIR = 'data/extraction/output';
const DATASET_FILE = 'public/data/salaries.json';
const REJECTED_FILE = 'data/processed/rejected.json';
const REPORT_FILE = 'data/processed/build-report.json';
// Curated grouping of similar job titles (e.g. Project Manager + Project Lead), see README.
const TAXONOMY_FILE = 'data/role-families.json';
const KV_FILE = 'data/collective-agreements.json';
// A stated net this far from the 2026 net of the stated gross reflects tax credits, tax-free
// allowances or deductions of that one month, so it is not comparable and not published.
// Same band as the net-plausibility check in qa-dataset.mjs.
const NET_BAND = { below: -0.12, above: 0.15 };
// Reposts: see dropReposts().
const REPOST_WINDOW_DAYS = 3;
const FIGURE_FIELDS = ['grossMonthly', 'grossAnnual', 'netMonthly', 'hourlyGross'];
// German translations of record notes, keyed by record id then English text, so a changed note is not mistranslated.
const NOTES_DE_FILE = 'data/translations/notes-de.json';

if (!existsSync(POSTS_FILE)) {
  console.error(`Missing ${POSTS_FILE}. Run the collector first (npm run collect).`);
  process.exit(1);
}

const allPosts = readJsonl(POSTS_FILE);
const goneImages = loadGoneImages();
const posts = new Map(allPosts.filter((post) => isEligible(post, goneImages)).map((post) => [post.id, post]));
const ocrTextsByPost = new Map();
for (const row of readJsonl(OCR_FILE)) {
  if (row.status !== 'ok' || !row.text) continue;
  ocrTextsByPost.set(row.postId, [...(ocrTextsByPost.get(row.postId) ?? []), row.text]);
}

const records = [];
const rejected = [];
const parseErrors = [];
const processedPosts = new Set();
let skipped = 0;

for (const file of listFiles(EXTRACTION_DIR, '.jsonl')) {
  const { rows, errors } = readJsonlLoose(file);
  parseErrors.push(...errors.map((error) => ({ file, ...error })));
  for (const { value: candidate, line } of rows) {
    const post = posts.get(candidate.postId);
    if (!post) {
      rejected.push({ file, line, postId: candidate.postId ?? null, reason: 'unknown, removed or pinned post' });
      continue;
    }
    processedPosts.add(post.id);
    if (candidate.skip) {
      skipped += 1;
      continue;
    }
    const result = buildRecord(candidate, post, {
      ocrTexts: ocrTextsByPost.get(post.id) ?? [],
      imageCount: post.imageUrls?.length ?? 0,
    });
    if (result.reason) rejected.push({ file, line, postId: post.id, reason: result.reason, candidate });
    else records.push(result.record);
  }
}

const perPostUnique = dedupe(records);
unifyTitleCasing(perPostUnique);
perPostUnique.sort((a, b) => b.postDate.localeCompare(a.postDate) || a.id.localeCompare(b.id));

const taxonomy = existsSync(TAXONOMY_FILE) ? JSON.parse(readFileSync(TAXONOMY_FILE, 'utf8')) : { families: [], titles: {} };
const familyIds = new Set(taxonomy.families.map((family) => family.id));
for (const record of perPostUnique) {
  const id = taxonomy.titles[record.standardizedTitle];
  record.roleFamily = familyIds.has(id) ? id : null;
}
const { kept: unique, reposts } = dropReposts(perPostUnique);
const unmappedTitles = [...new Set(unique.filter((record) => record.roleFamily === null).map((record) => record.standardizedTitle))];

const notesDe = existsSync(NOTES_DE_FILE) ? JSON.parse(readFileSync(NOTES_DE_FILE, 'utf8')) : {};
for (const record of unique) {
  const translation = notesDe[record.id];
  record.notesDe = translation && translation.en === record.notes ? translation.de : null;
}
const untranslatedNotes = unique.filter((record) => record.notes && record.notesDe === null).length;

const kvVariants = existsSync(KV_FILE) ? JSON.parse(readFileSync(KV_FILE, 'utf8')).variants : {};
const unmappedKv = new Set();
const netsDropped = [];

// Published copy only: the figures were already checked against the unredacted text above.
for (const record of unique) {
  // One name per Kollektivvertrag ("Handels-KV", "KV Handel" -> "Handel"), grade split off.
  if (record.collectiveAgreement !== null) {
    const mapped = kvVariants[record.collectiveAgreement];
    if (mapped) {
      record.collectiveAgreement = mapped.kv;
      record.collectiveAgreementGroup = mapped.group;
    } else {
      unmappedKv.add(record.collectiveAgreement);
    }
  }
  if (isOffModelNet(record)) {
    netsDropped.push({ id: record.id, net: record.netMonthly, expected: Math.round(netMonthly(record.grossMonthly)) });
    record.netMonthly = null;
  }
  record.postTitle = redactAgeGender(record.postTitle);
  record.jobTitle = redactAgeGender(record.jobTitle);
  record.notes = redactAgeGender(record.notes);
  record.notesDe = record.notesDe && redactAgeGender(record.notesDe);
  record.evidence = record.evidence.map(redactAgeGender);
  // The permalink's slug repeats the title (with its age/gender tag); Reddit redirects the short form.
  record.sourceUrl = `https://www.reddit.com/r/GehaltAT/comments/${record.postId}/`;
}

const recordDates = unique.map((record) => record.postDate).sort();
const dataset = {
  generatedAt: new Date().toISOString(),
  subreddit: 'GehaltAT',
  roleFamilies: taxonomy.families.filter((family) => unique.some((record) => record.roleFamily === family.id)),
  coverage: {
    postsCollected: posts.size,
    commentsCollected: [...posts.values()].reduce((sum, post) => sum + (post.comments?.length ?? 0), 0),
    postsWithSalary: new Set(unique.map((record) => record.postId)).size,
    records: unique.length,
    firstPostDate: recordDates[0] ?? null,
    lastPostDate: recordDates.at(-1) ?? null,
  },
  records: unique,
};

const rejectionReasons = countBy(rejected, (entry) => entry.reason.replace(/\s*\(.*\)$/, '').replace(/[\d.]+/g, 'N'));
const report = {
  generatedAt: dataset.generatedAt,
  postsCollected: allPosts.length,
  postsEligible: posts.size,
  postsProcessed: processedPosts.size,
  postsPending: posts.size - processedPosts.size,
  skipped,
  records: unique.length,
  duplicatesRemoved: records.length - perPostUnique.length,
  repostsRemoved: reposts,
  netsDropped,
  unmappedCollectiveAgreements: [...unmappedKv],
  rejected: rejected.length,
  rejectionReasons,
  parseErrors,
  derivedCounts: countBy(unique.flatMap((record) => record.derived), (field) => field),
  figuresVerified: countBy(unique, (record) => (record.figuresVerified ? 'verified' : 'image only')),
  roleFamilies: countBy(unique, (record) => record.roleFamily ?? 'unmapped'),
  unmappedTitles,
  untranslatedNotes,
  salarySources: countBy(unique, (record) => record.salarySource),
};

writeJson(DATASET_FILE, dataset);
writeJson(REJECTED_FILE, rejected);
writeJson(REPORT_FILE, report);

console.log(
  `Dataset: ${unique.length} records from ${dataset.coverage.postsWithSalary} posts ` +
    `(${posts.size} collected, ${processedPosts.size} processed, ${skipped} skipped, ${rejected.length} rejected).`,
);
if (parseErrors.length) console.log(`Parse errors: ${parseErrors.length} (see ${REPORT_FILE})`);
if (unmappedTitles.length) console.log(`Titles without a role family (add them to ${TAXONOMY_FILE}): ${unmappedTitles.join(', ')}`);
if (unmappedKv.size) console.log(`Collective agreements without a mapping (add them to ${KV_FILE}): ${[...unmappedKv].join(', ')}`);
if (netsDropped.length) console.log(`Nets not published (far from the net of the stated gross): ${netsDropped.length}`);
console.log(`Wrote ${DATASET_FILE}, ${REJECTED_FILE}, ${REPORT_FILE}`);

// One post may yield several records (e.g. current salary and an offer); identical ones are dropped
// and the rest get stable ids: postId, postId-2, ...
function dedupe(list) {
  const seen = new Set();
  const perPost = new Map();
  const result = [];
  for (const record of list) {
    const key = [record.postId, record.salaryKind, record.grossMonthly, record.netMonthly].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const index = (perPost.get(record.postId) ?? 0) + 1;
    perPost.set(record.postId, index);
    result.push({ ...record, id: index === 1 ? record.postId : `${record.postId}-${index}` });
  }
  return result;
}

function isOffModelNet(record) {
  const { grossMonthly: gross, netMonthly: net } = record;
  if (gross === null || net === null || record.derived.includes('grossMonthly') || record.employmentType !== 'employee') return false;
  if (gross < 1500 || gross > 12000 || (record.hoursPerWeek !== null && record.hoursPerWeek < 30)) return false;
  const deviation = net / netMonthly(gross) - 1;
  return deviation < NET_BAND.below || deviation > NET_BAND.above;
}

// The same salary posted twice, e.g. deleted and posted again or cross-posted: another post within
// three days with the same figures and either the same title or the same role and experience. The
// newest copy is kept (an older one is the likelier to have been deleted on Reddit).

function dropReposts(list) {
  // Reddit ids grow over time, so on the same day the larger id is the later post.
  const newestFirst = [...list].sort((a, b) => b.postDate.localeCompare(a.postDate) || b.postId.localeCompare(a.postId));
  const kept = [];
  const reposts = [];
  for (const record of newestFirst) {
    const twin = kept.find((other) => other.postId !== record.postId && isRepost(record, other));
    if (twin) reposts.push({ id: record.id, keptId: twin.id });
    else kept.push(record);
  }
  const dropped = new Set(reposts.map((repost) => repost.id));
  return { kept: list.filter((record) => !dropped.has(record.id)), reposts };
}

function isRepost(a, b) {
  const days = Math.abs(Date.parse(a.postDate) - Date.parse(b.postDate)) / 86_400_000;
  if (!(days <= REPOST_WINDOW_DAYS) || a.salaryKind !== b.salaryKind) return false;
  const shared = FIGURE_FIELDS.filter((field) => a[field] !== null && b[field] !== null);
  if (shared.length === 0 || shared.some((field) => a[field] !== b[field])) return false;
  // Equal titles, or one extends the other ("…, 9J in Firma" edited to "…, 9J in Firma, 12 YoE").
  const [ta, tb] = [a, b].map((record) => record.postTitle.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''));
  const shorter = Math.min(ta.length, tb.length);
  const sameTitle = (shorter >= 8 && ta === tb) || (shorter >= 20 && (ta.startsWith(tb) || tb.startsWith(ta)));
  return sameTitle || (a.roleFamily === b.roleFamily && a.roleFamily !== null && a.experienceYears === b.experienceYears);
}

// Agents spell the same title with different casing ("DevOps Engineer" / "Devops Engineer");
// use the most frequent spelling for each case-insensitive title.
function unifyTitleCasing(list) {
  const spellings = new Map();
  for (const { standardizedTitle } of list) {
    const key = standardizedTitle.toLowerCase();
    const counts = spellings.get(key) ?? new Map();
    counts.set(standardizedTitle, (counts.get(standardizedTitle) ?? 0) + 1);
    spellings.set(key, counts);
  }
  for (const record of list) {
    const counts = spellings.get(record.standardizedTitle.toLowerCase());
    record.standardizedTitle = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
}

function countBy(list, keyOf) {
  const counts = {};
  for (const item of list) {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}
