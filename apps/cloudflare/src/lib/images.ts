// =============================================================================
//  Checking pictures without sharp
//  ---------------------------------------------------------------------------
//  The old Docker edition runs every upload through sharp, which proves it is a
//  real picture, turns it the right way up, shrinks it and saves it as a JPEG
//  with no camera metadata.
//
//  sharp cannot run on a Worker, so that work is split in two:
//    - the browser shrinks and re-encodes every photo before uploading it
//      (apps/web/src/lib/imagePrep.ts), which also turns it the right way up
//    - this file checks what arrives: it reads the first bytes to prove the
//      file is a JPEG, PNG or WebP whatever it claims to be, reads its size,
//      and takes the camera metadata out of JPEGs
//
//  Taking the metadata out matters. A phone photo can carry the exact place it
//  was taken, and these are photos of visitors' belongings, often at home.
//  Everything is removed except the one value that says which way up the
//  photo goes, so a photo that skipped the browser step still shows upright.
// =============================================================================

export type ImageKind = 'jpeg' | 'png' | 'webp';

export const MIME_FOR: Record<ImageKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const EXTENSION_FOR: Record<ImageKind, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

/** What the first bytes say the file is, or null if it is none of the three. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** Width and height from the file's header, without decoding the picture. */
export function imageSize(bytes: Uint8Array, kind: ImageKind): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (kind === 'png') {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (kind === 'webp') {
      const chunk = String.fromCharCode(...bytes.subarray(12, 16));
      if (chunk === 'VP8 ') {
        return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      }
      if (chunk === 'VP8L') {
        const b = view.getUint32(21, true);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      if (chunk === 'VP8X') {
        const w = bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16);
        const h = bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16);
        return { width: w + 1, height: h + 1 };
      }
      return null;
    }
    // JPEG: walk the segments to the first "start of frame".
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      // Any number of 0xFF "fill" bytes may come before a marker.
      if (bytes[offset + 1] === 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1]!;
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
  } catch {
    return null;
  }
  return null;
}

/** The EXIF orientation (1 to 8) of a JPEG, or 1 when it has none. */
function readOrientation(app1: Uint8Array): number {
  // "Exif\0\0" then a TIFF header.
  if (String.fromCharCode(...app1.subarray(0, 4)) !== 'Exif') return 1;
  const tiff = app1.subarray(6);
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const little = tiff[0] === 0x49;
  const ifd = view.getUint32(4, little);
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/** A tiny EXIF block that holds nothing but the orientation. */
function orientationOnlyApp1(orientation: number): Uint8Array {
  const body = new Uint8Array([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF, first IFD at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, // Orientation, SHORT, count 1
    0x00, orientation, 0x00, 0x00, // the value
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
  const segment = new Uint8Array(4 + body.length);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment[2] = ((body.length + 2) >> 8) & 0xff;
  segment[3] = (body.length + 2) & 0xff;
  segment.set(body, 4);
  return segment;
}

/**
 * A copy of a JPEG with its metadata taken out: EXIF (which holds the GPS
 * position), XMP, IPTC and comments. The colour profile is kept so colours do
 * not shift, and the orientation is kept so the photo stays upright.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    // Fill bytes before a marker carry nothing, so they are left out.
    if (bytes[offset + 1] === 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    // Start of scan: the picture data runs from here to the end.
    if (marker === 0xda) break;
    const length = view.getUint16(offset + 2);
    const end = offset + 2 + length;
    if (end > bytes.length) break;
    const isApp1 = marker === 0xe1;
    // APP14 (0xee) is kept: Adobe uses it to say how to read the colours.
    const isDropped =
      isApp1 || marker === 0xed || marker === 0xfe || (marker >= 0xe3 && marker <= 0xef && marker !== 0xee);
    if (isApp1) {
      try {
        const found = readOrientation(bytes.subarray(offset + 4, end));
        if (found !== 1) orientation = found;
      } catch {
        // A broken EXIF block is dropped like any other.
      }
    }
    if (!isDropped) kept.push(bytes.subarray(offset, end));
    offset = end;
  }
  if (orientation !== 1) kept.splice(1, 0, orientationOnlyApp1(orientation));
  kept.push(bytes.subarray(offset));

  const total = kept.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of kept) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
