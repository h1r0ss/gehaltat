// Downloads images attached to collected posts (mostly payslip screenshots) so extraction agents
// can look at them. Each image is stored as data/images/<postId>-<n>.jpg, converted and shrunk
// with macOS `sips` to at most 1568 px on the long edge (the size the model reads anyway).
// Images contain personal data: they stay local (gitignored) and are removed with
// `npm run purge-images` once extraction is done. Posts that already have an extraction result
// are skipped, so a re-run after a new collection only fetches the new posts' images.
// Usage: npm run images   Env: IMAGE_CONCURRENCY (6), MAX_IMAGES_PER_POST (4).
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { listFiles, readJsonl, readJsonlLoose, writeJson } from './lib/io.mjs';
import { IMAGE_DIR, MAX_IMAGES_PER_POST, imagePath } from './lib/images.mjs';
import { GONE_IMAGES_FILE, isEligible, loadGoneImages } from './lib/posts.mjs';

const CONCURRENCY = Number(process.env.IMAGE_CONCURRENCY ?? 6);
const MAX_EDGE = 1568;
const USER_AGENT = 'GehaltAT-Salary-Benchmark/1.0 (local research tool)';
const OUTPUT_DIR = 'data/extraction/output';
const run = promisify(execFile);

mkdirSync(IMAGE_DIR, { recursive: true });
const gone = loadGoneImages();
const extracted = new Set(
  listFiles(OUTPUT_DIR, '.jsonl').flatMap((file) => readJsonlLoose(file).rows.map(({ value }) => value.postId)),
);
const jobs = readJsonl('data/raw/posts.jsonl')
  .filter((post) => isEligible(post) && !extracted.has(post.id))
  .flatMap((post) =>
    (post.imageUrls ?? [])
      .slice(0, MAX_IMAGES_PER_POST)
      .map((url, index) => ({ url, file: imagePath(post.id, index) }))
      .filter((job) => !existsSync(job.file) && !gone.has(job.url)),
  );
console.log(`${jobs.length} images to download (${extracted.size} posts already extracted, ${gone.size} images known to be gone).`);

const failures = [];
let done = 0;
let goneNow = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (jobs.length) {
      const job = jobs.shift();
      try {
        await fetchImage(job);
      } catch (error) {
        if (error.gone) {
          gone.add(job.url);
          goneNow += 1;
        } else {
          failures.push({ url: job.url, error: String(error.message ?? error) });
        }
      }
      done += 1;
      if (done % 50 === 0) console.log(`  ${done} done, ${jobs.length} left`);
    }
  }),
);
writeJson(GONE_IMAGES_FILE, [...gone].sort());
console.log(`Downloaded ${done - failures.length - goneNow} images; ${goneNow} gone from Reddit (404/410); ${failures.length} failed.`);
failures.slice(0, 10).forEach((failure) => console.log(`  - ${failure.url}: ${failure.error}`));

async function fetchImage({ url, file }) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'image/*' },
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404 || response.status === 410) throw Object.assign(new Error(`HTTP ${response.status}`), { gone: true });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`not an image (${type || 'no content-type'})`);
  const original = `${file}.orig`;
  writeFileSync(original, Buffer.from(await response.arrayBuffer()));
  try {
    await toJpeg(original, file);
  } finally {
    rmSync(original, { force: true });
  }
}

// Converts to JPEG and shrinks (never enlarges) so the long edge is at most MAX_EDGE.
async function toJpeg(input, output) {
  const { stdout } = await run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', input]);
  const longEdge = Math.max(...[...stdout.matchAll(/pixel(?:Width|Height): (\d+)/g)].map((match) => Number(match[1])));
  const resize = longEdge > MAX_EDGE ? ['-Z', String(MAX_EDGE)] : [];
  await run('sips', ['-s', 'format', 'jpeg', ...resize, input, '--out', output]);
}
