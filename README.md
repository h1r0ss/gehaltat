# GehaltAT Salary Benchmark

Benchmarks Austrian salaries from self-reported public posts in the subreddit r/GehaltAT.
Filter by role, industry, region, experience and hours, and get medians and percentile ranges for gross or net pay.
Every record links to its source post.

The data is self-reported, unverified and not representative. Use it for orientation only.

## Quick start

```bash
npm install
npm run dev          # UI at http://localhost:5173 (reads public/data/salaries.json)
npm test             # unit tests (pipeline + UI logic)
npm run build        # type-check and production build to dist/
```

## Data pipeline

| Step | Command | Output |
|---|---|---|
| 1. Collect all posts and full comment threads | `npm run collect` | `data/raw/posts.jsonl`, `data/raw/collection-log.json` |
| 2. Download attached images (payslips), shrunk to ≤1568 px | `npm run images` | `data/images/*.jpg` (local only) |
| 3. OCR the images with local tesseract (cross-check only) | `npm run ocr` | `data/raw/ocr.jsonl` (local only) |
| 4. Write compact shards for extraction | `npm run prepare-extraction` | `data/extraction/input/*.md` |
| 5. Agents read each post: text, comments and images (see `docs/extraction-guide.md`) | agent writes output, then `npm run check-extraction -- <shard.md>` | `data/extraction/output/*.jsonl` |
| 6. Validate, derive and publish | `npm run build-data` | `public/data/salaries.json`, `data/processed/*.json` |
| 7. Delete the downloaded images | `npm run purge-images` | none |
| 8. Quality check (flags records for review; changes nothing) | `npm run qa` | `data/processed/qa-report.json` |

Steps 1–5 are incremental: re-runs skip posts, images and shards that were already processed.

- **Collection** (`scripts/collect.mjs`) reads the [Arctic Shift](https://github.com/ArthurHeitmann/arctic_shift) Reddit archive API, because reddit.com rejects server-side requests. Each run re-fetches the whole subreddit (it was created on 5 February 2026, so this is only a few thousand items). Requests are sequential and back off on rate limits. Completeness check on 30 September 2026: every one of the 1,185 r/GehaltAT posts known to the independent [PullPush](https://pullpush.io) archive was in the collection (1,271 posts); reddit.com itself could not be queried to compare.
- **Extraction** is done by LLM agents following `docs/extraction-guide.md`. They read the post text, the relevant comments and an OCR transcript of each payslip, and open the image itself when the transcript is unclear. Agents may only report figures stated in the post or printed on the payslip, never computed ones. Figures read from the image itself need an `[image] …` evidence line. Posts without images and without any figure-like text are skipped automatically (`data/extraction/output/auto-skip.jsonl`).
- **Validation** (`scripts/lib/records.mjs`) checks every figure against the post text, the comments and the local OCR text. It also checks plausible ranges and net/gross and annual/monthly ratios. Image figures that OCR cannot confirm are kept with `figuresVerified: false` and confidence capped at 0.8. Other unconfirmed figures are dropped, and records without a usable figure are rejected (`data/processed/rejected.json`).
- **Derived values**: missing annual gross = monthly × payments per year; missing monthly = annual ÷ payments, or hourly × hours × 4.33. Payments per year default to 14 (the Austrian norm) unless stated. Derived fields are listed in each record's `derived` array and marked in the UI. Seniority follows stated experience (junior < 2, mid 2–5, senior 6+ years), except for leads.
- **Quality check** (`npm run qa`) checks the contract and the gross/net labels. It flags nets that don't fit an approximate Austrian gross-to-net calculation, duplicates, figures that belong to another post, outliers within a job title, inconsistent fields, and personal details in notes. Corrections go into the extraction output lines, marked with a `qa` note or a skip reason starting "removed in QA review".

## Publishing

`npm run build` writes a static site to `dist/` (the dataset is `dist/data/salaries.json`). Host it on any static host (Netlify, Cloudflare Pages, GitHub Pages, S3) with gzip or brotli enabled. To refresh the data, run steps 1–7 above, then build again. Removals and deletions on Reddit are only picked up by a fresh `npm run collect`.

**GitHub Pages (free):** the build uses relative paths (`base: './'` in `vite.config.ts`), so it works under `https://<user>.github.io/<repo>/`. `.github/workflows/deploy.yml` tests, builds and deploys on every push to `main`; enable it once under Settings → Pages → Source: "GitHub Actions". Only `public/data/salaries.json` (redacted) is committed; the raw posts, extraction files, reports and note translations stay local (see `.gitignore`), so the data is refreshed by running the pipeline locally and pushing the new `public/data/salaries.json`.

## Data handling

- No usernames or author fields are stored. The only author signal is whether a comment is by the original poster.
- The published dataset drops age and gender markers ("M27", "(w, 31)", "age 35", "27-jähriger Mann") and family details ("Familienbonus", "Karenz") from post titles, job titles, notes in both languages and evidence (`scripts/lib/redact.mjs`), links to posts without the title slug, and counts a salary posted twice (repost or cross-post within three days) only once. `npm run qa` flags family, health, age or gender details left in any of these fields.
- Images (payslips) are downloaded only for extraction and deleted afterwards (`npm run purge-images`). IBAN and social-security-number patterns are redacted from OCR text. `data/images/` and `data/raw/ocr.jsonl` stay local (gitignored).
- The published dataset contains extracted figures, job context and short numeric evidence snippets only.
- Before any public deployment, check Reddit's data/API terms and GDPR obligations (e.g. a lawful basis for processing the posts, and handling of removal requests).

## Layout

```
scripts/     collection, images, OCR, shard preparation, extraction checks, dataset build (lib/ = tested logic)
docs/        extraction guide for the agents
data/        raw posts, OCR text, extraction shards and outputs, build reports
public/data/ published dataset read by the UI
src/         React UI; src/types.ts is the data contract shared with the pipeline
tests/       node:test unit tests
```
