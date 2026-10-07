// =============================================================================
//  Uploaded pictures, kept in R2
//  ---------------------------------------------------------------------------
//  Ported from the old Docker edition. Files used to live under
//  /data/uploads. They now live in the R2 bucket bound as UPLOADS, under the
//  same paths, and are served at the same /uploads/... addresses. So a stored
//  path like "repairs/<id>/x.jpg" means the same thing in both editions, which
//  is what lets a backup move between them.
// =============================================================================
import { bindings, env } from '../env.js';
import { EXTENSION_FOR, MIME_FOR, imageSize, sniffImage, stripJpegMetadata, type ImageKind } from '../lib/images.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface SavedImage {
  /** Key in the bucket, kept for parity with the old Docker edition's disk path. */
  filePath: string;
  /** Path under uploads/. */
  relativePath: string;
  /** /uploads/... */
  url: string;
  size: number;
  mimeType: string;
}

export class InvalidImageError extends Error {}

/**
 * Check an uploaded picture and keep it.
 *
 * `maxLongestEdge` is the size the browser was asked to shrink it to. A file
 * much larger than that did not come through the browser's shrinking step, so
 * it is refused rather than stored at full size.
 */
export async function saveValidatedImage(
  buffer: Uint8Array,
  declaredMime: string,
  subdir: string,
  options: { maxLongestEdge?: number; quality?: number; keepTransparency?: boolean } = {},
): Promise<SavedImage> {
  if (!ALLOWED_MIME.has(declaredMime)) {
    throw new InvalidImageError(`Unsupported image type: ${declaredMime}`);
  }
  if (buffer.length > env.MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
    throw new InvalidImageError('Image is too large');
  }
  const kind: ImageKind | null = sniffImage(buffer);
  if (!kind) throw new InvalidImageError('Image content does not match declared type');
  const size = imageSize(buffer, kind);
  if (!size || size.width < 1 || size.height < 1) throw new InvalidImageError('Image has no size');
  // Generous, so a photo shrunk by an older browser is not refused, but small
  // enough that nobody can fill the bucket with full-size camera files.
  const maxEdge = options.maxLongestEdge ?? 2000;
  if (Math.max(size.width, size.height) > Math.max(maxEdge * 2, 4096)) {
    throw new InvalidImageError('Image is larger than expected. Please try again from the website.');
  }

  const bytes = kind === 'jpeg' ? stripJpegMetadata(buffer) : buffer;
  const relativePath = `${subdir.replace(/^\/+|\/+$/g, '')}/${crypto.randomUUID()}.${EXTENSION_FOR[kind]}`;
  await bindings().UPLOADS.put(relativePath, bytes, {
    httpMetadata: { contentType: MIME_FOR[kind], cacheControl: 'public, max-age=86400' },
  });
  return {
    filePath: relativePath,
    relativePath,
    url: `/uploads/${relativePath}`,
    size: bytes.length,
    mimeType: MIME_FOR[kind],
  };
}

/** Store bytes the hub made itself (QR codes, sharing pictures, icons). */
export async function putUpload(relativePath: string, bytes: Uint8Array | ArrayBuffer | string, contentType: string): Promise<void> {
  await bindings().UPLOADS.put(relativePath.replace(/^\/+/, ''), bytes, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=86400' },
  });
}

/**
 * Turn a stored image path into a browser URL.
 *
 * Older tables store the path under uploads/ ("repairs/<id>/x.jpg") while
 * newer ones store the full URL ("/uploads/repairs/<id>/x.jpg"). Both reach
 * the same file, so read paths through here and stop caring which is which.
 */
export function uploadUrl(storedPath: string): string {
  if (!storedPath) return '';
  if (storedPath.startsWith('/uploads/') || /^https?:\/\//.test(storedPath)) return storedPath;
  return `/uploads/${storedPath.replace(/^\/+/, '')}`;
}

/** The bucket key for a stored path or /uploads/ URL, or null if it is not ours. */
export function uploadKey(storedPath: string | null | undefined): string | null {
  const value = (storedPath ?? '').trim();
  if (!value || /^https?:\/\//i.test(value)) return null;
  const key = value.replace(/^\/?uploads\//, '').replace(/^\/+/, '');
  if (!key || key.split('/').some((part) => part === '..' || part === '.')) return null;
  return key;
}

export async function deleteImage(relativePath: string): Promise<void> {
  const key = uploadKey(relativePath);
  if (!key) return;
  await bindings()
    .UPLOADS.delete(key)
    .catch(() => {
      /* swallow */
    });
}

/** The bytes of an upload, or null if it is missing. */
export async function readUpload(storedPath: string | null | undefined): Promise<Uint8Array | null> {
  const key = uploadKey(storedPath);
  if (!key) return null;
  const object = await bindings().UPLOADS.get(key);
  if (!object) return null;
  return new Uint8Array(await object.arrayBuffer());
}

/**
 * GET /uploads/* — the same addresses the old Docker edition served from disk.
 */
export async function serveUpload(request: Request, key: string): Promise<Response> {
  const safe = uploadKey(key);
  if (!safe) return Response.json({ error: 'Not found', code: 'not_found' }, { status: 404 });
  const object = await bindings().UPLOADS.get(safe, {
    onlyIf: request.headers,
    range: request.headers,
  });
  if (!object) return Response.json({ error: 'Not found', code: 'not_found' }, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  // An uploaded file is only ever a picture to look at. This stops one that
  // is really a page or an SVG with a script in it from running anything if
  // somebody opens it directly.
  headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/octet-stream');

  // A conditional request that matched: the browser already has this file.
  if (!('body' in object) || !(object as R2ObjectBody).body) {
    return new Response(null, { status: 304, headers });
  }
  const body = (object as R2ObjectBody).body;
  // R2 describes a range on every answer, so only treat it as partial when
  // the browser actually asked for part of the file.
  if (request.headers.has('range') && object.range && 'offset' in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    return new Response(request.method === 'HEAD' ? null : body, { status: 206, headers });
  }
  return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
}
