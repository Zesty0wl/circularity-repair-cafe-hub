import { auth } from './stores/auth';
import { get } from 'svelte/store';

export interface ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
}

let refreshing: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) {
        auth.set(null);
        throw new Error('refresh failed');
      }
      const body = await res.json();
      auth.set({ accessToken: body.accessToken, user: body.user });
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export interface ApiOptions extends RequestInit {
  json?: unknown;
  formData?: FormData;
  /** Set to false to disable auto refresh on 401 */
  autoRefresh?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  let body = opts.body;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.formData) {
    body = opts.formData;
  }
  const state = get(auth);
  if (state?.accessToken) headers['Authorization'] = `Bearer ${state.accessToken}`;

  const res = await fetch(path, {
    ...opts,
    headers,
    body,
    credentials: 'include',
  });

  if (res.status === 401 && opts.autoRefresh !== false) {
    try {
      await refreshAccessToken();
      const stateNow = get(auth);
      if (stateNow?.accessToken) headers['Authorization'] = `Bearer ${stateNow.accessToken}`;
      const retry = await fetch(path, {
        ...opts,
        headers,
        body,
        credentials: 'include',
      });
      return handleResponse<T>(retry);
    } catch {
      return handleResponse<T>(res);
    }
  }
  return handleResponse<T>(res);
}

async function handleResponse<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    let errBody: any = null;
    try {
      errBody = ct.includes('json') ? await res.json() : { error: await res.text() };
    } catch {
      errBody = { error: res.statusText };
    }
    const err: ApiError = Object.assign(new Error(errBody?.error || res.statusText), {
      status: res.status,
      code: errBody?.code,
      details: errBody?.details,
    });
    throw err;
  }
  if (res.status === 204 || !ct.includes('json')) return undefined as T;
  return (await res.json()) as T;
}
