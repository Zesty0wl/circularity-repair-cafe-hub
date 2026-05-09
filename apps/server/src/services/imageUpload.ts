import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { env } from '../env.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface SavedImage {
  filePath: string; // path on disk
  relativePath: string; // path under uploads/
  url: string; // /uploads/...
  size: number;
  mimeType: string;
}

export async function saveValidatedImage(
  buffer: Buffer,
  declaredMime: string,
  subdir: string,
  options: { maxLongestEdge?: number; quality?: number } = {}
): Promise<SavedImage> {
  if (!ALLOWED_MIME.has(declaredMime)) {
    throw new Error(`Unsupported image type: ${declaredMime}`);
  }
  // Validate via sharp metadata (rejects non-images)
  const meta = await sharp(buffer, { failOnError: true }).metadata();
  if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) {
    throw new Error('Image content does not match declared type');
  }
  const maxEdge = options.maxLongestEdge ?? 2000;
  const quality = options.quality ?? 0.82;

  const processed = await sharp(buffer)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: Math.round(quality * 100), mozjpeg: true })
    .toBuffer();

  const dir = path.join(env.UPLOADS_DIR, subdir);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${crypto.randomUUID()}.jpg`;
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, processed);

  const relativePath = path.posix.join(subdir, filename);
  return {
    filePath: fullPath,
    relativePath,
    url: `/uploads/${relativePath}`,
    size: processed.length,
    mimeType: 'image/jpeg',
  };
}

export async function deleteImage(relativePath: string): Promise<void> {
  if (!relativePath) return;
  const safe = relativePath.replace(/^\/+/, '').replace(/\.\./g, '');
  const fullPath = path.join(env.UPLOADS_DIR, safe);
  await fs.unlink(fullPath).catch(() => {
    /* swallow */
  });
}
