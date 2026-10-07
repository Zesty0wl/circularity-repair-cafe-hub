// =============================================================================
//  A small router with Fastify's shape
//  ---------------------------------------------------------------------------
//  The old Docker edition's API is 134 Fastify routes. Fastify does not run on
//  Workers, but its way of writing a route is simple: a handler gets a
//  `request` and a `reply`, sends with `reply.code(400).send({...})` or returns
//  a value, and `preHandler` hooks run first to check who is signed in.
//
//  This file gives the routes that same shape on top of the Web Fetch API, so
//  each route could be moved across with as few changes as possible. The fewer
//  lines that change, the fewer places a difference in behaviour can hide.
//
//  It copies the Fastify behaviours the routes rely on:
//    - a path with fixed text beats one with a :param, whatever the order the
//      routes were added in (/repairs/export.csv before /repairs/:id)
//    - `:id.png` means a parameter followed by the text ".png"
//    - hooks added inside `register()` apply only to the routes in it
//    - a handler's return value is sent as JSON unless it already replied
//    - an error thrown by a handler becomes a 500 with a JSON body
// =============================================================================

import { issueTokens, requireAuth, requireRole, revokeRefreshToken, signAccessToken } from './auth.js';

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'HEAD';

export interface UploadedFile {
  filename: string;
  mimetype: string;
  toBuffer(): Promise<Uint8Array>;
}

export interface JWTPayload {
  sub: string;
  email: string;
  role: 'super_admin' | 'admin' | 'repairer';
  displayName: string;
}

export interface HubRequest {
  method: string;
  /** Path and query string, as Fastify's `request.url`. */
  url: string;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  cookies: Record<string, string | undefined>;
  ip: string;
  auth?: JWTPayload;
  raw: Request;
  /** The first file in a multipart upload, like @fastify/multipart. */
  file(): Promise<UploadedFile | undefined>;
  log: Logger;
}

export interface CookieOptions {
  httpOnly?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  maxAge?: number;
  secure?: boolean;
}

export interface HubReply {
  code(status: number): HubReply;
  status(status: number): HubReply;
  header(name: string, value: string): HubReply;
  type(contentType: string): HubReply;
  send(payload?: unknown): HubReply;
  setCookie(name: string, value: string, options?: CookieOptions): HubReply;
  clearCookie(name: string, options?: CookieOptions): HubReply;
  redirect(url: string, status?: number): HubReply;
  readonly sent: boolean;
  readonly statusCode: number;
}

export type Handler = (request: HubRequest, reply: HubReply) => unknown | Promise<unknown>;
export type Hook = (request: HubRequest, reply: HubReply) => void | Promise<void> | unknown;

export interface RouteOptions {
  preHandler?: Hook | Hook[];
  /** Largest request body this route accepts, in bytes. */
  bodyLimit?: number;
  config?: Record<string, unknown>;
}

interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const log: Logger = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

// ── Matching ─────────────────────────────────────────────────────────────────

type Segment =
  | { kind: 'static'; text: string }
  | { kind: 'param'; name: string; suffix: string }
  | { kind: 'wildcard' };

interface Route {
  method: Method;
  path: string;
  segments: Segment[];
  hooks: Hook[];
  handler: Handler;
  options: RouteOptions;
}

function compile(path: string): Segment[] {
  return path
    .split('/')
    .filter((s) => s.length > 0)
    .map((s): Segment => {
      if (s === '*') return { kind: 'wildcard' };
      if (s.startsWith(':')) {
        const dot = s.indexOf('.');
        return dot > 0
          ? { kind: 'param', name: s.slice(1, dot), suffix: s.slice(dot) }
          : { kind: 'param', name: s.slice(1), suffix: '' };
      }
      return { kind: 'static', text: s };
    });
}

/** Lower is more specific, the way find-my-way (Fastify's router) ranks them. */
function rank(segment: Segment): number {
  if (segment.kind === 'static') return 0;
  if (segment.kind === 'param') return segment.suffix ? 1 : 2;
  return 3;
}

function match(route: Route, parts: string[]): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (let i = 0; i < route.segments.length; i++) {
    const seg = route.segments[i]!;
    if (seg.kind === 'wildcard') {
      params['*'] = parts.slice(i).join('/');
      return params;
    }
    const part = parts[i];
    if (part === undefined) return null;
    if (seg.kind === 'static') {
      if (seg.text !== part) return null;
    } else {
      if (seg.suffix) {
        if (!part.endsWith(seg.suffix) || part.length === seg.suffix.length) return null;
        params[seg.name] = safeDecode(part.slice(0, -seg.suffix.length));
      } else {
        params[seg.name] = safeDecode(part);
      }
    }
  }
  return parts.length === route.segments.length ? params : null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function compareRoutes(a: Route, b: Route): number {
  const len = Math.max(a.segments.length, b.segments.length);
  for (let i = 0; i < len; i++) {
    const ra = a.segments[i] ? rank(a.segments[i]!) : 4;
    const rb = b.segments[i] ? rank(b.segments[i]!) : 4;
    if (ra !== rb) return ra - rb;
  }
  return 0;
}

// ── Request and reply ────────────────────────────────────────────────────────

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name && !(name in out)) out[name] = safeDecode(value);
  }
  return out;
}

function parseQuery(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of params) {
    const existing = out[key];
    if (existing === undefined) out[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else out[key] = [existing, value];
  }
  return out;
}

function serializeCookie(name: string, value: string, options: CookieOptions & { expires?: Date }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
    parts.push(`Expires=${new Date(Date.now() + options.maxAge * 1000).toUTCString()}`);
  } else if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  const sameSite = options.sameSite ?? 'lax';
  parts.push(`SameSite=${sameSite[0]!.toUpperCase()}${sameSite.slice(1)}`);
  return parts.join('; ');
}

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

class Reply implements HubReply {
  statusCode = 200;
  headers = new Headers();
  body: BodyInit | null = null;
  sent = false;
  private secure: boolean;

  constructor(secure: boolean) {
    this.secure = secure;
  }

  code(status: number): HubReply {
    this.statusCode = status;
    return this;
  }

  status(status: number): HubReply {
    return this.code(status);
  }

  header(name: string, value: string): HubReply {
    this.headers.set(name, value);
    return this;
  }

  type(contentType: string): HubReply {
    this.headers.set('Content-Type', contentType);
    return this;
  }

  send(payload?: unknown): HubReply {
    if (this.sent) return this;
    this.sent = true;
    if (payload === undefined) {
      this.body = null;
      return this;
    }
    if (payload instanceof Response) {
      this.statusCode = payload.status;
      payload.headers.forEach((v, k) => this.headers.set(k, v));
      this.body = payload.body;
      return this;
    }
    if (
      typeof payload === 'string' ||
      payload instanceof Uint8Array ||
      payload instanceof ArrayBuffer ||
      payload instanceof ReadableStream ||
      payload instanceof Blob
    ) {
      if (!this.headers.has('Content-Type')) {
        this.headers.set(
          'Content-Type',
          typeof payload === 'string' ? 'text/plain; charset=utf-8' : 'application/octet-stream',
        );
      }
      this.body = payload as BodyInit;
      return this;
    }
    // Objects, arrays, numbers, booleans and null go out as JSON, as Fastify does.
    const type = this.headers.get('Content-Type');
    if (!type || type.includes('json')) {
      this.headers.set('Content-Type', 'application/json; charset=utf-8');
      this.body = JSON.stringify(payload);
    } else {
      this.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    }
    return this;
  }

  setCookie(name: string, value: string, options: CookieOptions = {}): HubReply {
    this.headers.append(
      'Set-Cookie',
      serializeCookie(name, value, { ...options, secure: options.secure ?? this.secure }),
    );
    return this;
  }

  clearCookie(name: string, options: CookieOptions = {}): HubReply {
    this.headers.append(
      'Set-Cookie',
      serializeCookie(name, '', { ...options, maxAge: undefined, expires: new Date(0), secure: options.secure ?? this.secure }),
    );
    return this;
  }

  redirect(url: string, status = 302): HubReply {
    this.statusCode = status;
    this.headers.set('Location', url);
    this.sent = true;
    return this;
  }

  toResponse(method: string): Response {
    // A null body status must not carry a body.
    const noBody = method === 'HEAD' || this.statusCode === 204 || this.statusCode === 304;
    return new Response(noBody ? null : this.body, { status: this.statusCode, headers: this.headers });
  }
}

// ── The app ──────────────────────────────────────────────────────────────────

export type Plugin = (app: App) => void | Promise<void>;

/** The routes and hooks of one `register()` scope. */
export class App {
  constructor(
    private readonly routes: Route[],
    private readonly hooks: Hook[] = [],
  ) {}

  // The helpers the auth plugin hung on the Fastify instance, so routes can
  // keep calling app.requireRole(...) and friends. signAccessToken is async.
  readonly requireAuth = requireAuth;
  readonly requireRole = requireRole;
  readonly issueTokens = issueTokens;
  readonly signAccessToken = signAccessToken;
  readonly revokeRefreshToken = revokeRefreshToken;

  addHook(name: 'preHandler', hook: Hook): void {
    if (name !== 'preHandler') throw new Error(`Hook ${name} is not supported`);
    this.hooks.push(hook);
  }

  /** Run a plugin in its own scope. Hooks it adds stay inside it. */
  async register(plugin: Plugin): Promise<void> {
    await plugin(new App(this.routes, [...this.hooks]));
  }

  route(method: Method, path: string, a: RouteOptions | Handler, b?: Handler): void {
    const options = typeof a === 'function' ? {} : a;
    const handler = typeof a === 'function' ? a : b!;
    const pre = options.preHandler ? (Array.isArray(options.preHandler) ? options.preHandler : [options.preHandler]) : [];
    this.routes.push({ method, path, segments: compile(path), hooks: [...this.hooks, ...pre], handler, options });
    this.routes.sort(compareRoutes);
  }

  get(path: string, a: RouteOptions | Handler, b?: Handler): void {
    this.route('GET', path, a, b);
  }
  post(path: string, a: RouteOptions | Handler, b?: Handler): void {
    this.route('POST', path, a, b);
  }
  patch(path: string, a: RouteOptions | Handler, b?: Handler): void {
    this.route('PATCH', path, a, b);
  }
  put(path: string, a: RouteOptions | Handler, b?: Handler): void {
    this.route('PUT', path, a, b);
  }
  delete(path: string, a: RouteOptions | Handler, b?: Handler): void {
    this.route('DELETE', path, a, b);
  }
}

export interface Router {
  app: App;
  /** Answer a request, or null when no route matches the path. */
  handle(request: Request): Promise<Response | null>;
}

const DEFAULT_BODY_LIMIT = 10 * 1024 * 1024;

export function createRouter(): Router {
  const routes: Route[] = [];
  const app = new App(routes);

  async function handle(raw: Request): Promise<Response | null> {
    const url = new URL(raw.url);
    const parts = url.pathname.split('/').filter((s) => s.length > 0);
    const method = (raw.method === 'HEAD' ? 'GET' : raw.method) as Method;

    let found: { route: Route; params: Record<string, string> } | null = null;
    let pathMatched = false;
    for (const route of routes) {
      const params = match(route, parts);
      if (!params) continue;
      pathMatched = true;
      if (route.method === method) {
        found = { route, params };
        break;
      }
    }
    if (!found) {
      if (pathMatched) {
        return Response.json({ error: 'Method not allowed', code: 'method_not_allowed' }, { status: 405 });
      }
      return null;
    }

    const { route, params } = found;
    const headers: Record<string, string> = {};
    raw.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const contentType = (headers['content-type'] ?? '').toLowerCase();
    const limit = route.options.bodyLimit ?? DEFAULT_BODY_LIMIT;
    const declared = Number(headers['content-length'] ?? 0);
    if (declared > limit) {
      return Response.json({ error: 'Request body is too large', code: 'body/too_large' }, { status: 413 });
    }

    let body: unknown = undefined;
    let formData: Promise<FormData> | null = null;
    if (method !== 'GET' && method !== 'DELETE' && raw.body) {
      if (contentType.includes('application/json')) {
        const text = await raw.text();
        if (text.length > limit) {
          return Response.json({ error: 'Request body is too large', code: 'body/too_large' }, { status: 413 });
        }
        if (text.trim().length > 0) {
          try {
            body = JSON.parse(text);
          } catch {
            return Response.json(
              { statusCode: 400, error: 'Bad Request', message: 'Body is not valid JSON', code: 'body/invalid_json' },
              { status: 400 },
            );
          }
        }
      } else if (contentType.startsWith('multipart/form-data')) {
        // Read only when a handler asks for the file, like @fastify/multipart.
        formData = null;
      } else if (contentType.startsWith('text/')) {
        body = await raw.text();
      }
    } else if (method === 'DELETE' && contentType.includes('application/json')) {
      const text = await raw.text().catch(() => '');
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          body = undefined;
        }
      }
    }

    const request: HubRequest = {
      method: raw.method,
      url: url.pathname + url.search,
      params,
      query: parseQuery(url.searchParams),
      body,
      headers,
      cookies: parseCookies(raw.headers.get('cookie')),
      ip: headers['cf-connecting-ip'] ?? headers['x-real-ip'] ?? '127.0.0.1',
      raw,
      log,
      async file() {
        if (!contentType.startsWith('multipart/form-data')) return undefined;
        formData ??= raw.formData();
        const form = await formData;
        for (const [, value] of form) {
          if (typeof value === 'object' && value !== null && 'arrayBuffer' in value) {
            const file = value as File;
            if (file.size > limit) {
              throw new HttpError(413, 'That file is too large', 'upload/too_large');
            }
            return {
              filename: file.name || 'upload',
              mimetype: file.type || 'application/octet-stream',
              toBuffer: async () => new Uint8Array(await file.arrayBuffer()),
            };
          }
        }
        return undefined;
      },
    };

    const reply = new Reply(url.protocol === 'https:');
    try {
      for (const hook of route.hooks) {
        await hook(request, reply);
        if (reply.sent) return reply.toResponse(raw.method);
      }
      const result = await route.handler(request, reply);
      if (!reply.sent) {
        if (result === undefined) {
          // Fastify would wait for a reply that never comes. Say so instead.
          reply.code(500).send({ error: 'The server did not answer', code: 'internal/no_reply' });
        } else {
          reply.send(result);
        }
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.statusCode : 500;
      if (status >= 500) log.error('Route failed', route.method, route.path, err);
      const fresh = new Reply(url.protocol === 'https:');
      fresh.code(status).send({
        error: status >= 500 ? 'Something went wrong on the server' : (err as Error).message,
        code: err instanceof HttpError ? err.code ?? 'error' : 'internal',
      });
      return fresh.toResponse(raw.method);
    }
    return reply.toResponse(raw.method);
  }

  return { app, handle };
}
