import { exports } from 'cloudflare:workers';

/** The Worker under test (test/entry.ts). */
export const worker = (exports as unknown as { default: Fetcher }).default;

export const BASE = 'https://hub.test';

export interface CallOptions {
  method?: string;
  json?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  body?: BodyInit;
  cookie?: string;
}

export interface CallResult<T = any> {
  status: number;
  body: T;
  headers: Headers;
  raw: Response;
}

/** Call the API the way the web app does, and read the JSON answer. */
export async function call<T = any>(path: string, opts: CallOptions = {}): Promise<CallResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
  let body = opts.body;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.Cookie = opts.cookie;
  const raw = await worker.fetch(`${BASE}${path}`, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
  const type = raw.headers.get('content-type') ?? '';
  const parsed = type.includes('json') ? await raw.clone().json().catch(() => null) : null;
  return { status: raw.status, body: parsed as T, headers: raw.headers, raw };
}

/** The refresh cookie from a response, ready to send back. */
export function refreshCookie(res: CallResult): string {
  const header = res.headers.get('set-cookie') ?? '';
  const match = /circ_refresh=([^;]+)/.exec(header);
  return match ? `circ_refresh=${match[1]}` : '';
}

export const ADMIN = {
  displayName: 'Ada Admin',
  email: 'ada@example.org',
  password: 'CorrectHorse42',
};

/** Finish the setup wizard and return the admin's access token. */
export async function setUpHub(): Promise<{ token: string; cookie: string }> {
  const res = await call('/api/setup/complete', {
    json: {
      admin: ADMIN,
      cafe: { name: 'Tinkerton Repair Café', tagline: 'Fix it together', primaryColor: '#1B6B5A' },
      venue: { name: 'Village Hall', address: '1 High Street', postcode: 'TN1 1AA' },
      publicUrl: 'https://hub.test',
      telemetry: { level: 'none' },
    },
  });
  if (res.status !== 200) throw new Error(`setup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken, cookie: refreshCookie(res) };
}

/** A multipart body with one picture in it. */
export function photoForm(bytes: Uint8Array, type = 'image/jpeg', name = 'photo.jpg'): FormData {
  const form = new FormData();
  form.append('image', new File([bytes], name, { type }));
  return form;
}
