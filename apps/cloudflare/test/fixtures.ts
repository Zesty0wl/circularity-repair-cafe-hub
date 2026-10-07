// Small test pictures, as base64.
// A 1x1 JPEG, and the same JPEG with an EXIF block holding orientation 6 and
// a GPS block that includes the text GPSSECRET, which must not survive upload.
export const TINY_JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
export const JPEG_WITH_GPS = '/9j/4QBJRXhpZgAATU0AKgAAAAgAAgESAAMAAAABAAYAAIglAAQAAAABAAAAJgAAAAAAAQABAAIAAAACTgAAAAAAAABHUFNTRUNSRVT/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

export function bytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
