// Collects every r/GehaltAT post and comment into data/raw/posts.jsonl.
// Source: the Arctic Shift Reddit archive API (reddit.com itself rejects server-side requests).
// Each run re-fetches the whole subreddit (small: ~1-2k posts), so scores and comments stay current.
// Author names are used in memory only to mark the original poster's comments; they are never stored.
// Usage: npm run collect   Env: SUBREDDIT (GehaltAT), REQUEST_DELAY_MS (400).
import { readJsonl, writeJson, writeJsonl } from './lib/io.mjs';

const API = 'https://arctic-shift.photon-reddit.com/api';
const SUBREDDIT = process.env.SUBREDDIT ?? 'GehaltAT';
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS ?? 400);
const USER_AGENT = 'GehaltAT-Salary-Benchmark/1.0 (local research tool)';
const POSTS_FILE = 'data/raw/posts.jsonl';
const LOG_FILE = 'data/raw/collection-log.json';
const START = Math.floor(Date.UTC(2015, 0, 1) / 1000);
const COMMENT_FIELDS = 'id,link_id,parent_id,body,score,created_utc,author';

let requests = 0;
const startedAt = new Date();

const rawPosts = await fetchAll('posts', {});
console.log(`Fetched ${rawPosts.length} posts.`);
// Fixed small pages: large comment queries hit the archive's server-side timeout.
const rawComments = await fetchAll('comments', { fields: COMMENT_FIELDS, limit: '100' });
console.log(`Fetched ${rawComments.length} comments.`);

const commentsByPost = new Map();
for (const comment of rawComments) {
  const postId = String(comment.link_id ?? '').replace(/^t3_/, '');
  commentsByPost.set(postId, [...(commentsByPost.get(postId) ?? []), comment]);
}

const collectedAt = new Date().toISOString();
const posts = rawPosts
  .map((post) => toRecord(post, commentsByPost.get(post.id) ?? [], collectedAt))
  .sort((a, b) => b.createdUtc - a.createdUtc);
const previous = readJsonl(POSTS_FILE).length;
writeJsonl(POSTS_FILE, posts);

const dates = posts.map((post) => post.createdUtc).sort((a, b) => a - b);
const log = {
  source: `${API} (r/${SUBREDDIT})`,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  requests,
  posts: posts.length,
  previousPosts: previous,
  comments: posts.reduce((sum, post) => sum + post.comments.length, 0),
  postsWithComments: posts.filter((post) => post.comments.length).length,
  postsWithImages: posts.filter((post) => post.imageUrls.length).length,
  images: posts.reduce((sum, post) => sum + post.imageUrls.length, 0),
  firstPost: dates.length ? new Date(dates[0] * 1000).toISOString() : null,
  lastPost: dates.length ? new Date(dates.at(-1) * 1000).toISOString() : null,
};
writeJson(LOG_FILE, log);
console.log(`Wrote ${POSTS_FILE}: ${log.posts} posts, ${log.comments} comments, ${log.images} images (${requests} requests).`);

// Pages through /api/<kind>/search in ascending time order until a page brings nothing new.
async function fetchAll(kind, extraParams) {
  const byId = new Map();
  let after = START;
  for (;;) {
    const params = new URLSearchParams({ subreddit: SUBREDDIT, limit: 'auto', sort: 'asc', after: String(after), ...extraParams });
    const page = await getJson(`${API}/${kind}/search?${params}`);
    const fresh = page.filter((item) => !byId.has(item.id));
    fresh.forEach((item) => byId.set(item.id, item));
    if (fresh.length === 0) return [...byId.values()];
    // Step back one second so items sharing the boundary timestamp are not skipped; duplicates are ignored.
    after = Math.max(...page.map((item) => item.created_utc)) - 1;
    process.stdout.write(`  ${kind}: ${byId.size}\r`);
  }
}

async function getJson(url, attempt = 1) {
  await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  requests += 1;
  let response;
  try {
    response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(90000) });
  } catch (error) {
    if (attempt >= 5) throw error;
    return getJson(url, attempt + 1);
  }
  const body = await response.json().catch(() => ({}));
  // 429 = rate limit, 5xx = server trouble, 422 "Timeout" = the archive's query timed out.
  const retryable = response.status === 429 || response.status >= 500 || (response.status === 422 && /timeout/i.test(body.error ?? ''));
  if (retryable && attempt < 6) {
    const waitSeconds = Number(response.headers.get('x-ratelimit-reset')) || 10 * attempt;
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    return getJson(url, attempt + 1);
  }
  if (!response.ok || body.error) throw new Error(`HTTP ${response.status} for ${url}: ${body.error ?? ''}`);
  return body.data ?? [];
}

function toRecord(post, comments, collectedAt) {
  const selftext = post.selftext ?? '';
  return {
    id: post.id,
    permalink: `https://www.reddit.com${post.permalink}`,
    title: post.title ?? '',
    selftext,
    flair: post.link_flair_text || null,
    createdUtc: post.created_utc,
    score: post.score ?? 0,
    upvoteRatio: post.upvote_ratio ?? null,
    numComments: post.num_comments ?? comments.length,
    url: post.url ?? null,
    imageUrls: imageUrls(post),
    removed: Boolean(post.removed_by_category) || selftext === '[removed]' || selftext === '[deleted]',
    stickied: Boolean(post.stickied),
    comments: flattenComments(post, comments),
    commentsOmitted: 0,
    collectedAt,
  };
}

// Direct image link, gallery/inline images from media_metadata (in gallery order), or the preview image.
function imageUrls(post) {
  const urls = [];
  if (/^https:\/\/(i\.redd\.it|i\.imgur\.com)\//.test(post.url ?? '') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(post.url ?? '')) {
    urls.push(post.url);
  }
  const metadata = post.media_metadata ?? {};
  const order = post.gallery_data?.items?.map((item) => item.media_id) ?? Object.keys(metadata);
  for (const mediaId of order) {
    const media = metadata[mediaId];
    if (!media || media.status !== 'valid' || !String(media.m ?? '').startsWith('image/')) continue;
    const extension = media.m.split('/')[1].replace('jpeg', 'jpg');
    urls.push(`https://i.redd.it/${mediaId}.${extension}`);
  }
  if (urls.length === 0 && post.preview?.images?.[0]?.source?.url) {
    urls.push(post.preview.images[0].source.url.replaceAll('&amp;', '&'));
  }
  return [...new Set(urls)];
}

// Depth-first comment tree (highest score first among siblings). Deleted/removed bodies are
// dropped but their replies are kept; replies whose parent is missing are appended at depth 1.
function flattenComments(post, comments) {
  const children = new Map();
  for (const comment of comments) {
    const parent = String(comment.parent_id ?? '').replace(/^t[13]_/, '');
    children.set(parent, [...(children.get(parent) ?? []), comment]);
  }
  const ids = new Set(comments.map((comment) => comment.id));
  const opAuthor = post.author && post.author !== '[deleted]' ? post.author : null;
  const flat = [];
  const visit = (parentId, depth) => {
    for (const comment of (children.get(parentId) ?? []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) {
      const body = comment.body ?? '';
      if (body && body !== '[deleted]' && body !== '[removed]') {
        flat.push({
          id: comment.id,
          parentId,
          depth,
          isOp: opAuthor !== null && comment.author === opAuthor,
          score: comment.score ?? 0,
          createdUtc: comment.created_utc,
          body,
        });
      }
      visit(comment.id, depth + 1);
    }
  };
  visit(post.id, 0);
  for (const [parentId, orphans] of children) {
    if (parentId !== post.id && !ids.has(parentId)) {
      for (const orphan of orphans) {
        if (!flat.some((comment) => comment.id === orphan.id) && orphan.body && orphan.body !== '[deleted]' && orphan.body !== '[removed]') {
          flat.push({ id: orphan.id, parentId, depth: 1, isOp: opAuthor !== null && orphan.author === opAuthor, score: orphan.score ?? 0, createdUtc: orphan.created_utc, body: orphan.body });
        }
        visit(orphan.id, 2);
      }
    }
  }
  return flat;
}
