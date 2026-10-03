import { existsSync, readFileSync } from 'node:fs';

// Image URLs that Reddit answered with 404/410 (written by scripts/fetch-images.mjs).
export const GONE_IMAGES_FILE = 'data/raw/gone-images.json';

export function loadGoneImages() {
  return new Set(existsSync(GONE_IMAGES_FILE) ? JSON.parse(readFileSync(GONE_IMAGES_FILE, 'utf8')) : []);
}

// Posts that feed the published index. Excluded out of respect for deletions:
// - removed posts (deleted by the author or removed by moderators, often spam or rule violations),
// - posts whose images are all gone from Reddit, which happens when the author deletes the post
//   after the archive captured it,
// - pinned (stickied) subreddit meta posts.
export function isEligible(post, goneImages = new Set()) {
  if (post.removed || post.stickied) return false;
  const images = post.imageUrls ?? [];
  return !(images.length > 0 && images.every((url) => goneImages.has(url)));
}
