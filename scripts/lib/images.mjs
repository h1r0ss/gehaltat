import { existsSync } from 'node:fs';

// Local copies of post images: data/images/<postId>-<n>.jpg (see scripts/fetch-images.mjs).
export const IMAGE_DIR = 'data/images';
export const MAX_IMAGES_PER_POST = Number(process.env.MAX_IMAGES_PER_POST ?? 4);

export function imagePath(postId, index) {
  return `${IMAGE_DIR}/${postId}-${index}.jpg`;
}

// Paths of this post's images that were downloaded successfully.
export function downloadedImages(post) {
  return (post.imageUrls ?? [])
    .slice(0, MAX_IMAGES_PER_POST)
    .map((_, index) => imagePath(post.id, index))
    .filter((path) => existsSync(path));
}
