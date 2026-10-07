// =============================================================================
//  Reading and writing zip files in the browser
//  ---------------------------------------------------------------------------
//  The hub builds and reads backups in the browser, because a
//  Worker has too little CPU time and memory to do it. Browsers can already
//  compress and decompress (CompressionStream), so all that is needed here is
//  the zip layout around it.
//
//  Reading jumps straight to each file through the zip's table of contents,
//  so a backup of a few hundred megabytes never has to be in memory at once:
//  only the file being read is.
//
//  This handles what the hub's own backups contain: stored or deflated files,
//  up to 4 GB in all. It reads the larger "zip64" layout too, which old Docker
//  hubs switched to for very big backups.
// =============================================================================

export interface ZipEntry {
  name: string;
  /** 0 is stored as it is, 8 is deflated. */
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

async function bytesOf(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

function u16(b: Uint8Array, at: number): number {
  return b[at]! | (b[at + 1]! << 8);
}

function u32(b: Uint8Array, at: number): number {
  return (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
}

function u64(b: Uint8Array, at: number): number {
  return u32(b, at) + u32(b, at + 4) * 0x1_0000_0000;
}

const decoder = new TextDecoder();

/** The list of files in a zip, read from its table of contents at the end. */
export async function readZipDirectory(blob: Blob): Promise<ZipEntry[]> {
  // The end record is in the last 22 bytes, plus up to 64 KB of comment.
  const tailStart = Math.max(0, blob.size - 65_557);
  const tail = await bytesOf(blob, tailStart, blob.size);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This file is not a zip file.');

  let count = u16(tail, eocd + 10);
  let dirSize = u32(tail, eocd + 12);
  let dirOffset = u32(tail, eocd + 16);

  // Zip64: the real numbers are in another record just before.
  if (dirOffset === 0xffffffff || count === 0xffff) {
    const locator = eocd - 20;
    if (locator >= 0 && u32(tail, locator) === 0x07064b50) {
      const recordAt = u64(tail, locator + 8);
      const record = await bytesOf(blob, recordAt, recordAt + 56);
      if (u32(record, 0) === 0x06064b50) {
        count = u64(record, 32);
        dirSize = u64(record, 40);
        dirOffset = u64(record, 48);
      }
    }
  }

  const dir = await bytesOf(blob, dirOffset, dirOffset + dirSize);
  const entries: ZipEntry[] = [];
  let at = 0;
  for (let n = 0; n < count && at + 46 <= dir.length; n++) {
    if (u32(dir, at) !== 0x02014b50) throw new Error('This zip file is damaged.');
    const method = u16(dir, at + 10);
    let compressedSize = u32(dir, at + 20);
    let size = u32(dir, at + 24);
    const nameLength = u16(dir, at + 28);
    const extraLength = u16(dir, at + 30);
    const commentLength = u16(dir, at + 32);
    let localHeaderOffset = u32(dir, at + 42);
    const name = decoder.decode(dir.subarray(at + 46, at + 46 + nameLength));

    // Zip64 sizes and offsets live in an "extra field" when they did not fit.
    let extra = at + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = u16(dir, extra);
      const length = u16(dir, extra + 2);
      if (id === 0x0001) {
        let field = extra + 4;
        if (size === 0xffffffff) {
          size = u64(dir, field);
          field += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = u64(dir, field);
          field += 8;
        }
        if (localHeaderOffset === 0xffffffff) localHeaderOffset = u64(dir, field);
      }
      extra += 4 + length;
    }

    entries.push({ name, method, compressedSize, size, localHeaderOffset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** One file's contents. */
export async function readZipEntry(blob: Blob, entry: ZipEntry): Promise<Uint8Array> {
  const header = await bytesOf(blob, entry.localHeaderOffset, entry.localHeaderOffset + 30);
  if (u32(header, 0) !== 0x04034b50) throw new Error(`The zip entry ${entry.name} is damaged.`);
  const dataStart = entry.localHeaderOffset + 30 + u16(header, 26) + u16(header, 28);
  const data = blob.slice(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return new Uint8Array(await data.arrayBuffer());
  if (entry.method !== 8) throw new Error(`${entry.name} is compressed in a way this page cannot read.`);
  const stream = data.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipText(blob: Blob, entry: ZipEntry): Promise<string> {
  return decoder.decode(await readZipEntry(blob, entry));
}

// ── Writing ──────────────────────────────────────────────────────────────────

let crcTable: Uint32Array | null = null;

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** What new Blob() takes, without naming a type only browsers define. */
type BlobParts = ConstructorParameters<typeof Blob>[0];

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes] as unknown as BlobParts).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Builds a zip in memory, as a list of parts the browser keeps as one Blob.
 * Photos are stored as they are, because a JPEG does not compress.
 */
export class ZipWriter {
  private parts: Uint8Array[] = [];
  private central: Uint8Array[] = [];
  private offset = 0;
  private count = 0;
  private readonly stamp = dosDateTime(new Date());

  async add(name: string, data: Uint8Array, options: { compress?: boolean } = {}): Promise<void> {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const compressed = options.compress ? await deflateRaw(data) : data;
    const method = options.compress ? 8 : 0;
    if (this.offset + compressed.length > 0xfffffff0) {
      throw new Error('This backup is larger than 4 GB, which a zip file this page writes cannot hold.');
    }

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // names are UTF-8
    lv.setUint16(8, method, true);
    lv.setUint16(10, this.stamp.time, true);
    lv.setUint16(12, this.stamp.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const entry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, this.stamp.time, true);
    cv.setUint16(14, this.stamp.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, this.offset, true);
    entry.set(nameBytes, 46);

    this.parts.push(local, compressed);
    this.central.push(entry);
    this.offset += local.length + compressed.length;
    this.count++;
  }

  finish(): Blob {
    const dirSize = this.central.reduce((n, e) => n + e.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, this.count, true);
    ev.setUint16(10, this.count, true);
    ev.setUint32(12, dirSize, true);
    ev.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...this.central, end] as unknown as BlobParts, { type: 'application/zip' });
  }
}
