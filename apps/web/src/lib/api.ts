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

let restoring: Promise<void> | null = null;

/**
 * Restore the session from the refresh cookie after a full page load.
 * Runs at most once per page load and never rejects. The auth store only
 * lives in memory, so protected layouts must await this before they decide
 * to send the user to /login.
 */
export function restoreSession(): Promise<void> {
  if (!restoring) restoring = refreshAccessToken().catch(() => {});
  return restoring;
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

export interface UploadOptions {
  /** Form field name the server reads the file from. */
  fieldName?: string;
  /** Called with 0–1 as the bytes go up. */
  onProgress?: (fraction: number) => void;
}

/**
 * Upload one file and report how far it has got.
 *
 * `fetch` cannot tell you how much of a request body has been sent, and a
 * photo from a phone can take a while on a hall's wifi, so this uses
 * XMLHttpRequest instead. It refreshes the session and retries once if the
 * access token expired mid-upload, the same as `api()`.
 */
export async function uploadFile<T = unknown>(
  path: string,
  file: Blob,
  opts: UploadOptions = {}
): Promise<T> {
  const filename = file instanceof File ? file.name : 'photo.jpg';
  const send = (token: string | null): Promise<{ status: number; text: string; contentType: string }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', path, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Accept', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      if (opts.onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) opts.onProgress!(e.loaded / e.total);
        };
      }
      xhr.onload = () =>
        resolve({
          status: xhr.status,
          text: xhr.responseText,
          contentType: xhr.getResponseHeader('content-type') ?? '',
        });
      xhr.onerror = () => reject(new Error('Network error while uploading'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));
      const fd = new FormData();
      fd.append(opts.fieldName ?? 'image', file, filename);
      xhr.send(fd);
    });

  let res = await send(get(auth)?.accessToken ?? null);
  if (res.status === 401) {
    try {
      await refreshAccessToken();
      res = await send(get(auth)?.accessToken ?? null);
    } catch {
      /* fall through to the error below */
    }
  }
  let body: any = null;
  try {
    body = res.contentType.includes('json') && res.text ? JSON.parse(res.text) : null;
  } catch {
    body = null;
  }
  if (res.status < 200 || res.status >= 300) {
    const err: ApiError = Object.assign(new Error(body?.error || `Upload failed (${res.status})`), {
      status: res.status,
      code: body?.code,
      details: body?.details,
    });
    throw err;
  }
  return body as T;
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
