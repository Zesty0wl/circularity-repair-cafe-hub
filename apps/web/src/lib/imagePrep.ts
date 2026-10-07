// =============================================================================
//  Shrinking a picture in the browser before it is uploaded
//  ---------------------------------------------------------------------------
//  A Worker cannot resize pictures, so the browser does it before uploading.
//  It helps anyway: a smaller file uploads faster on a hall's wifi.
//
//  The picture is drawn through an <img>, so the browser turns it the right
//  way up first. Drawing it again also drops the camera's hidden details, such
//  as where the photo was taken.
// =============================================================================

const DECODABLE = ['image/jpeg', 'image/png', 'image/webp'];

export interface PrepareOptions {
  /** The longest side, in pixels, the server keeps. */
  maxLongestEdge: number;
  /** JPEG quality from 0 to 1. */
  quality?: number;
  /**
   * Keep a see-through background, for logos and favicons. The result is a
   * PNG. Without this everything becomes a JPEG.
   */
  keepTransparency?: boolean;
}

/**
 * The picture, shrunk to fit and re-encoded. If the browser cannot read the
 * file (an iPhone HEIC photo, say) the original is returned, and the server
 * says plainly that it cannot use it.
 */
export async function prepareImage(file: File, options: PrepareOptions): Promise<Blob> {
  if (!DECODABLE.includes(file.type)) return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return file;
    const scale = Math.min(1, options.maxLongestEdge / Math.max(w, h));
    const keepPng = options.keepTransparency && file.type !== 'image/jpeg';
    // A small picture that already fits is sent as it is. Drawing it again
    // would only lose quality. JPEGs are always drawn again, to drop the
    // camera's hidden details.
    if (scale === 1 && keepPng && file.size < 1_200_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, keepPng ? 'image/png' : 'image/jpeg', options.quality ?? 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
