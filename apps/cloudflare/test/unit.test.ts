// The new pieces the old Docker edition has no equivalent for, tested on their own.
import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { hashPassword, hashToken, signJwt, verifyJwt, verifyPassword } from '../src/lib/crypto.js';
import { createRouter } from '../src/lib/router.js';
import { imageSize, sniffImage, stripJpegMetadata } from '../src/lib/images.js';
import { addDaysIso, addMonthsIso, localMidnightMs, offsetMinutes } from '../src/lib/dates.js';
import { normaliseTime } from '../src/db/schema.js';
import { splitStatements } from '../src/db/migrate.js';
import { TABLES } from '../src/services/portable.js';
import { safeUploadPath } from '../src/routes/admin/backup.js';
import { encodeGreyPng } from '../src/lib/png.js';
import { BACKUP_TABLE_ORDER, parsePgArray, pgTimestampToIso, unescapeCopyField } from '../../../packages/shared/src/backup.js';
import { readZipDirectory, readZipEntry, ZipWriter } from '../../web/src/lib/backup/zip.js';
import { bytes, JPEG_WITH_GPS, TINY_JPEG } from './fixtures.js';

describe('passwords', () => {
  it('hashes with PBKDF2 and checks the result', async () => {
    const hash = await hashPassword('CorrectHorse42');
    expect(hash).toMatch(/^pbkdf2\$sha256\$100000\$/);
    expect((await verifyPassword('CorrectHorse42', hash)).ok).toBe(true);
    expect((await verifyPassword('correcthorse42', hash)).ok).toBe(false);
    expect((await verifyPassword('anything', 'garbage')).ok).toBe(false);
  });

  it('accepts an old bcrypt hash once, and offers a replacement', async () => {
    const legacy = bcrypt.hashSync('FromDocker1', 4);
    const check = await verifyPassword('FromDocker1', legacy);
    expect(check.ok).toBe(true);
    expect(check.upgradedHash).toMatch(/^pbkdf2\$/);
    expect((await verifyPassword('FromDocker1', check.upgradedHash!)).ok).toBe(true);
    expect((await verifyPassword('wrong', legacy)).upgradedHash).toBeUndefined();
  });

  it('hashes tokens the same way node:crypto did', async () => {
    expect(await hashToken('docker-refresh-token-0123456789')).toBe(
      'f47a044f40d8d5adb18fa5099501a21937a4358e404608958f27624f80e10722',
    );
  });
});

describe('login tokens', () => {
  const secret = 'x'.repeat(40);
  it('signs and verifies, and refuses tampering and expiry', async () => {
    const token = await signJwt({ sub: 'u1', role: 'admin' }, secret, 60);
    expect(await verifyJwt(token, secret)).toMatchObject({ sub: 'u1', role: 'admin' });
    expect(await verifyJwt(token, 'y'.repeat(40))).toBeNull();
    const [h, , s] = token.split('.');
    const forged = `${h}.${btoa(JSON.stringify({ sub: 'u1', role: 'super_admin', exp: 9e9 })).replace(/=+$/, '')}.${s}`;
    expect(await verifyJwt(forged, secret)).toBeNull();
    expect(await verifyJwt(await signJwt({ sub: 'u1' }, secret, -1), secret)).toBeNull();
  });
});

describe('the router', () => {
  it('prefers fixed paths to parameters, whatever the order they were added in', async () => {
    const { app, handle } = createRouter();
    app.get('/repairs/:id', async (req) => ({ id: req.params.id }));
    app.get('/repairs/export.csv', async (_req, reply) => reply.type('text/csv').send('a,b'));
    app.get('/og/section/:key.png', async (req) => ({ key: req.params.key }));
    app.get('/files/*', async (req) => ({ rest: req.params['*'] }));
    const get = async (path: string) => (await handle(new Request(`https://x.test${path}`)))!;
    expect(await (await get('/repairs/abc')).json()).toEqual({ id: 'abc' });
    expect(await (await get('/repairs/export.csv')).text()).toBe('a,b');
    expect(await (await get('/og/section/home.png')).json()).toEqual({ key: 'home' });
    expect(await (await get('/files/a/b/c.jpg')).json()).toEqual({ rest: 'a/b/c.jpg' });
    expect(await handle(new Request('https://x.test/nothing'))).toBeNull();
    expect((await handle(new Request('https://x.test/repairs/abc', { method: 'DELETE' })))!.status).toBe(405);
  });

  it('runs hooks in their scope, and stops when one replies', async () => {
    const { app, handle } = createRouter();
    await app.register(async (inner) => {
      inner.addHook('preHandler', async (_req, reply) => {
        reply.code(403).send({ error: 'no' });
      });
      inner.get('/private', async () => ({ ok: true }));
    });
    app.get('/public', async () => ({ ok: true }));
    expect((await handle(new Request('https://x.test/private')))!.status).toBe(403);
    expect((await handle(new Request('https://x.test/public')))!.status).toBe(200);
  });

  it('parses JSON bodies, cookies and queries, and turns errors into 500s', async () => {
    const { app, handle } = createRouter();
    app.post('/echo', async (req, reply) => {
      reply.setCookie('c', 'v', { maxAge: 10 });
      return { body: req.body, cookie: req.cookies.a, q: req.query.q };
    });
    app.get('/boom', async () => {
      throw new Error('secret detail');
    });
    const res = (await handle(
      new Request('https://x.test/echo?q=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: 'a=b' },
        body: JSON.stringify({ x: 1 }),
      }),
    ))!;
    expect(await res.json()).toEqual({ body: { x: 1 }, cookie: 'b', q: '1' });
    expect(res.headers.get('set-cookie')).toMatch(/c=v; Max-Age=10;.*HttpOnly; Secure; SameSite=Lax/);
    const bad = (await handle(
      new Request('https://x.test/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }),
    ))!;
    expect(bad.status).toBe(400);
    const boom = (await handle(new Request('https://x.test/boom')))!;
    expect(boom.status).toBe(500);
    expect(await boom.text()).not.toContain('secret detail');
  });
});

describe('pictures', () => {
  it('recognises pictures by their bytes and reads their size', async () => {
    expect(sniffImage(bytes(TINY_JPEG))).toBe('jpeg');
    expect(imageSize(bytes(TINY_JPEG), 'jpeg')).toEqual({ width: 1, height: 1 });
    const png = await encodeGreyPng(3, 2, new Uint8Array(6).fill(255));
    expect(sniffImage(png)).toBe('png');
    expect(imageSize(png, 'png')).toEqual({ width: 3, height: 2 });
    expect(sniffImage(new TextEncoder().encode('<svg></svg>'))).toBeNull();
  });

  it('takes the GPS position out of a JPEG but keeps the orientation', () => {
    const stripped = stripJpegMetadata(bytes(JPEG_WITH_GPS));
    const text = new TextDecoder('latin1').decode(stripped);
    expect(text).not.toContain('GPSSECRET');
    expect(text).toContain('Exif');
    expect(sniffImage(stripped)).toBe('jpeg');
    expect(imageSize(stripped, 'jpeg')).toEqual({ width: 1, height: 1 });
    // A JPEG with nothing to remove comes back the same.
    expect(stripJpegMetadata(bytes(TINY_JPEG))).toEqual(bytes(TINY_JPEG));
  });

  it('refuses file names that try to leave the uploads folder', () => {
    expect(safeUploadPath('repairs/a/b.jpg')).toBe('repairs/a/b.jpg');
    expect(safeUploadPath('uploads/branding/x.png')).toBe('branding/x.png');
    expect(safeUploadPath('../etc/passwd')).toBeNull();
    expect(safeUploadPath('a/../../b')).toBeNull();
    expect(safeUploadPath('a//b')).toBeNull();
    expect(safeUploadPath('a/b c.jpg')).toBeNull();
  });
});

describe('dates and times', () => {
  it('does calendar arithmetic on plain dates', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2026-10-07', -12)).toBe('2025-10-07');
  });

  it("knows when the cafe's day starts", () => {
    // British Summer Time: the day starts at 23:00 UTC the evening before.
    expect(new Date(localMidnightMs('2026-07-01')).toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(new Date(localMidnightMs('2026-12-01')).toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(offsetMinutes(new Date('2026-07-01T12:00:00Z'), 'Europe/Berlin')).toBe(120);
  });

  it('stores times the way Postgres did', () => {
    expect(normaliseTime('10:00')).toBe('10:00:00');
    expect(normaliseTime('9:30')).toBe('09:30:00');
    expect(normaliseTime('13:45:10')).toBe('13:45:10');
  });
});

describe('backups', () => {
  it('reads Postgres text values', () => {
    expect(unescapeCopyField('a\\tb\\nc\\\\d')).toBe('a\tb\nc\\d');
    expect(unescapeCopyField('caf\\303\\251')).toBe('café');
    expect(parsePgArray('{a,"b c","d\\"e",NULL}')).toEqual(['a', 'b c', 'd"e', '']);
    expect(parsePgArray('{}')).toEqual([]);
    expect(pgTimestampToIso('2026-10-07 00:00:12.364602+02')).toBe('2026-10-06T22:00:12.364Z');
    expect(pgTimestampToIso('2026-03-29 01:30:00+05:30')).toBe('2026-03-28T20:00:00.000Z');
  });

  it('knows every table, in an order the database accepts', () => {
    const names = TABLES.map((t) => t.name);
    expect(names).toEqual([...BACKUP_TABLE_ORDER]);
    const users = TABLES.find((t) => t.name === 'users')!;
    expect(users.columns.get('skills')).toBe('textArray');
    expect(users.columns.get('is_active')).toBe('boolean');
    expect(users.columns.get('created_at')).toBe('timestamp');
    const cafes = TABLES.find((t) => t.name === 'cafes')!;
    expect(cafes.columns.get('home_page')).toBe('json');
    expect(cafes.columns.get('co2_displacement_rate')).toBe('number');
    expect(TABLES.find((t) => t.name === 'events')!.columns.get('start_time')).toBe('time');
  });

  it('writes a zip it can read back', async () => {
    const writer = new ZipWriter();
    const text = new TextEncoder().encode('hello '.repeat(1000));
    await writer.add('manifest.json', text, { compress: true });
    await writer.add('uploads/photo.jpg', bytes(TINY_JPEG));
    const zip = writer.finish();
    const entries = await readZipDirectory(zip);
    expect(entries.map((e) => [e.name, e.method])).toEqual([
      ['manifest.json', 8],
      ['uploads/photo.jpg', 0],
    ]);
    expect(entries[0]!.compressedSize).toBeLessThan(text.length);
    expect(await readZipEntry(zip, entries[0]!)).toEqual(text);
    expect(await readZipEntry(zip, entries[1]!)).toEqual(bytes(TINY_JPEG));
    await expect(readZipDirectory(new Blob([new Uint8Array(100)]))).rejects.toThrow(/not a zip/);
  });

  it('splits migrations into statements', () => {
    expect(splitStatements('-- note\nCREATE TABLE a (x TEXT DEFAULT \'{}\');\nCREATE INDEX i ON a(x);\n')).toEqual([
      "CREATE TABLE a (x TEXT DEFAULT '{}')",
      'CREATE INDEX i ON a(x)',
    ]);
  });
});

describe('JPEG fill bytes', () => {
  it('reads a JPEG with 0xFF fill bytes before a marker, as some cameras and sites write', () => {
    const plain = bytes(TINY_JPEG);
    // FF D8, then two extra FF bytes before the next marker.
    const filled = new Uint8Array(plain.length + 2);
    filled.set(plain.subarray(0, 2), 0);
    filled.set([0xff, 0xff], 2);
    filled.set(plain.subarray(2), 4);
    expect(sniffImage(filled)).toBe('jpeg');
    expect(imageSize(filled, 'jpeg')).toEqual(imageSize(plain, 'jpeg'));
    expect(imageSize(stripJpegMetadata(filled), 'jpeg')).toEqual(imageSize(plain, 'jpeg'));
  });
});
