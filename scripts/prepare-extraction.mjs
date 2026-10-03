// Writes compact, agent-readable shards for posts that are neither extracted nor already in a shard,
// so it can run again while agents work on earlier shards. Each shard lists the post text, the
// relevant comments and the local image files the agent must view. One agent processes a shard
// following docs/extraction-guide.md and writes data/extraction/output/<same name>.jsonl.
// Usage: npm run prepare-extraction
// Env: SHARD_POSTS (20), SHARD_IMAGES (20), SHARD_CHARS (50000) cap each shard.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { MAX_IMAGES_PER_POST, downloadedImages } from './lib/images.mjs';
import { listFiles, readJsonl, readJsonlLoose, writeJson } from './lib/io.mjs';
import { isEligible, loadGoneImages } from './lib/posts.mjs';

const POSTS_FILE = 'data/raw/posts.jsonl';
const INPUT_DIR = 'data/extraction/input';
const OUTPUT_DIR = 'data/extraction/output';
const SHARD_POSTS = Number(process.env.SHARD_POSTS ?? 20);
const SHARD_IMAGES = Number(process.env.SHARD_IMAGES ?? 20);
const SHARD_CHARS = Number(process.env.SHARD_CHARS ?? 50000);
const AUTO_SKIP_FILE = `${OUTPUT_DIR}/auto-skip.jsonl`;
// Money-like figures in context. Posts without images and without any of these are skipped
// without an agent: they are questions or discussions, or their content was only in lost media.
const SALARY_SIGNALS = [
  /\d[\d.,]*\s?(?:€|eur\b|euro)/i,
  /(?:€|eur)\s?\d/i,
  /\b\d+(?:[.,]\d+)?\s?k\b/i,
  /(?:brutto|netto|gehalt|lohn|verdien\w*|bezahl\w*|einstieg\w*|auszahl\w*)\D{0,25}\d{3,}/i,
  /\d{3,}\D{0,15}(?:brutto|netto)/i,
  /\b\d{1,3}\.\d{3}\b/,
];

const posts = readJsonl(POSTS_FILE);
const ocrByImage = new Map(readJsonl('data/raw/ocr.jsonl').filter((row) => row.status === 'ok').map((row) => [row.image, row.text]));
const OCR_KEYWORDS =
  /brutto|netto|net\b|gross|auszahl|payment|gehalt|lohn|salary|bezug|bezüge|gesamt|summe|berst|zulage|pr[äa]mie|provision|commission|sonder|urlaub|weihnacht|remuneration|nachtrag|stunden|grund|monat/i;
const processed = new Set(
  listFiles(OUTPUT_DIR, '.jsonl').flatMap((file) => readJsonlLoose(file).rows.map(({ value }) => value.postId)),
);
const assigned = new Set(listFiles(INPUT_DIR, '.md').flatMap((file) => shardPostIds(readFileSync(file, 'utf8'))));
const goneImages = loadGoneImages();
const pending = posts
  .filter((post) => isEligible(post, goneImages) && !processed.has(post.id) && !assigned.has(post.id))
  .sort((a, b) => b.createdUtc - a.createdUtc);

const autoSkips = [];
const withImages = [];
const textOnly = [];
for (const post of pending) {
  const images = downloadedImages(post);
  if (images.length) withImages.push({ post, images });
  else if (hasSalarySignal(post)) textOnly.push({ post, images });
  else autoSkips.push({ postId: post.id, skip: true, reason: 'no image and no salary figure in title, body or OP comments (automatic)' });
}

// Image and text-only posts go to separate shards (name suffix -img / -txt) so text-only
// shards can be given to a cheaper model.
mkdirSync(INPUT_DIR, { recursive: true });
mkdirSync(OUTPUT_DIR, { recursive: true });
if (autoSkips.length) appendFileSync(AUTO_SKIP_FILE, `${autoSkips.map((row) => JSON.stringify(row)).join('\n')}\n`);
const batch = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
const shards = [...toShards(withImages, 'img'), ...toShards(textOnly, 'txt')];
shards.forEach(({ blocks, kind }, i) => {
  writeFileSync(`${INPUT_DIR}/${batch}-${String(i + 1).padStart(3, '0')}-${kind}.md`, `${blocks.join('\n\n')}\n`);
});

function toShards(items, kind) {
  const result = [];
  let shard = { blocks: [], images: 0, chars: 0, kind };
  for (const { post, images } of items) {
    const block = renderPost(post, images);
    const full =
      shard.blocks.length >= SHARD_POSTS ||
      shard.images + images.length > SHARD_IMAGES ||
      shard.chars + block.length > SHARD_CHARS;
    if (shard.blocks.length && full) {
      result.push(shard);
      shard = { blocks: [], images: 0, chars: 0, kind };
    }
    shard.blocks.push(block);
    shard.images += images.length;
    shard.chars += block.length + 2;
  }
  if (shard.blocks.length) result.push(shard);
  return result;
}

function hasSalarySignal(post) {
  const text = [post.title, post.selftext, ...(post.comments ?? []).filter((comment) => comment.isOp).map((comment) => comment.body)].join('\n');
  return SALARY_SIGNALS.some((pattern) => pattern.test(text));
}

// Index of every shard on disk; `done` means its output file exists.
const index = listFiles(INPUT_DIR, '.md').map((input) => {
  const content = readFileSync(input, 'utf8');
  const name = basename(input, '.md');
  const output = `${OUTPUT_DIR}/${name}.jsonl`;
  return {
    name,
    input,
    output,
    posts: shardPostIds(content).length,
    images: [...content.matchAll(/\| images: (\d+)/g)].reduce((sum, match) => sum + Number(match[1]), 0),
    done: existsSync(output),
  };
});
writeJson(`${INPUT_DIR}/index.json`, index);

console.log(
  `${posts.length} posts collected, ${processed.size} extracted, ${assigned.size} already in shards, ${pending.length} new: ` +
    `${autoSkips.length} skipped automatically, ${withImages.length} with images, ${textOnly.length} text-only -> ` +
    `${shards.length} new shards (${index.filter((entry) => !entry.done).length} open in ${INPUT_DIR}/index.json).`,
);

function shardPostIds(content) {
  return [...content.matchAll(/^=== POST (\S+) \|/gm)].map((match) => match[1]);
}

function renderPost(post, images) {
  const header = [
    `=== POST ${post.id}`,
    new Date(post.createdUtc * 1000).toISOString().slice(0, 10),
    `score ${post.score ?? 0}`,
    `${post.numComments ?? 0} comments`,
    `images: ${images.length}`,
  ];
  if (post.flair) header.push(`flair: ${oneLine(post.flair)}`);

  const lines = [header.join(' | '), `TITLE: ${oneLine(post.title)}`];
  const body = (post.selftext ?? '').replace(/\n{3,}/g, '\n\n').trim();
  if (body && body !== '[removed]' && body !== '[deleted]') lines.push(`BODY: ${clip(body, 2500)}`);

  const transcript = images
    .map((image) => filterOcr(ocrByImage.get(image) ?? ''))
    .filter(Boolean)
    .join('\n---\n');
  if (transcript) lines.push('IMAGE TRANSCRIPT (automatic OCR of the attached image, may contain recognition errors):', clip(transcript, 2500));
  if (images.length) lines.push(`IMAGES (open with the Read tool only if the transcript is unclear): ${images.join(' ')}`);
  const missing = Math.min(post.imageUrls?.length ?? 0, MAX_IMAGES_PER_POST) - images.length;
  if (missing > 0) lines.push(`(${missing} attached image(s) could not be downloaded)`);

  const comments = selectComments(post.comments ?? []);
  if (comments.length) {
    lines.push('COMMENTS ([OP] = original poster, number = score):');
    for (const comment of comments) {
      const indent = '  '.repeat(Math.min(comment.depth ?? 0, 3));
      const limit = comment.isOp ? 600 : 200;
      lines.push(`${indent}- [${comment.isOp ? 'OP ' : ''}${comment.score ?? 0}] ${clip(oneLine(comment.body), limit)}`);
    }
  }
  return lines.join('\n');
}

// All OP comments plus the comments they reply to, and the highest-scored other comments that contain numbers.
function selectComments(comments) {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const keep = new Set();
  for (const comment of comments) {
    if (!comment.isOp) continue;
    keep.add(comment.id);
    if (byId.has(comment.parentId)) keep.add(comment.parentId);
  }
  comments
    .filter((comment) => !keep.has(comment.id) && /\d/.test(comment.body ?? ''))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8)
    .forEach((comment) => keep.add(comment.id));
  return comments.filter((comment) => keep.has(comment.id) && comment.body).slice(0, 30);
}

// Payslip lines that matter: anything with a figure or a salary keyword. Drops name/address lines.
function filterOcr(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 2 && (/\d/.test(line) || OCR_KEYWORDS.test(line)))
    .join('\n');
}

function oneLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clip(value, limit) {
  return value.length > limit ? `${value.slice(0, limit)} …[truncated]` : value;
}
