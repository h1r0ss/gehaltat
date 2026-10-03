// Runs local tesseract over the downloaded images (see fetch-images.mjs). The OCR text is never shown
// to extraction agents; build-dataset uses it only to cross-check figures the agents read from images.
// IBAN and social-security-number patterns are redacted; data/raw/ocr.jsonl stays local (gitignored).
// Usage: npm run ocr   Env: TESSERACT_PATH, OCR_LANG (default eng), OCR_CONCURRENCY (4).
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { readJsonl, writeJsonl } from './lib/io.mjs';
import { downloadedImages } from './lib/images.mjs';

const OCR_FILE = 'data/raw/ocr.jsonl';
const TESSERACT = process.env.TESSERACT_PATH ?? 'tesseract';
const LANG = process.env.OCR_LANG ?? 'eng';
const CONCURRENCY = Number(process.env.OCR_CONCURRENCY ?? 4);

const done = new Set(readJsonl(OCR_FILE).filter((row) => row.status === 'ok').map((row) => row.image));
const jobs = readJsonl('data/raw/posts.jsonl').flatMap((post) =>
  downloadedImages(post)
    .filter((image) => !done.has(image))
    .map((image) => ({ postId: post.id, image })),
);
console.log(`${jobs.length} images to OCR (${done.size} already done).`);

let finished = 0;
let failed = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (jobs.length) {
      const job = jobs.shift();
      let row;
      try {
        row = { ...job, status: 'ok', text: redact(await tesseract(job.image)) };
      } catch (error) {
        failed += 1;
        row = { ...job, status: 'error', error: String(error.message ?? error) };
      }
      appendFileSync(OCR_FILE, `${JSON.stringify(row)}\n`);
      finished += 1;
      if (finished % 50 === 0) console.log(`  ${finished} done, ${jobs.length} left`);
    }
  }),
);

// Compact the append-only log: one line per image, latest attempt wins.
writeJsonl(OCR_FILE, [...new Map(readJsonl(OCR_FILE).map((row) => [row.image, row])).values()]);
console.log(`OCR finished: ${finished - failed} ok, ${failed} failed. Wrote ${OCR_FILE}`);

function tesseract(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(TESSERACT, [file, 'stdout', '-l', LANG, '--psm', '6'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), 90000);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`tesseract exit ${code}: ${stderr.trim().split('\n').at(-1) ?? ''}`));
    });
  });
}

// Payslips carry bank and social-security numbers; strip them before anything is stored.
function redact(text) {
  return text
    .replace(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g, '[IBAN]')
    .replace(/\b\d{4} ?\d{6}\b/g, '[SVNR]');
}
