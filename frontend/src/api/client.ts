/**
 * Low-level HTTP + SSE client. Every real network call in the app goes through here,
 * so base URL, auth header and error shape are defined in exactly one place.
 */
import type { ApiErrorBody } from '../types/trip';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
/** With USE_MOCK: still generate trips with the real backend's AI (see ./hybrid.ts). */
export const USE_AI = import.meta.env.VITE_USE_AI === 'true';

const TOKEN_KEY = 'zenvo.token';
/** Fired on window when the server rejects our token (so the UI can sign out). */
export const UNAUTHORIZED_EVENT = 'zenvo:unauthorized';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable (private mode): session just won't persist */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof Error) return new ApiError('unknown_error', e.message);
  return new ApiError('unknown_error', 'Something went wrong. Please try again.');
}

async function readError(res: Response): Promise<ApiError> {
  let code = 'http_error';
  let message = res.statusText || `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
    }
  } catch {
    /* body was not JSON */
  }
  return new ApiError(code, message, res.status);
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Send the bearer token when we have one (default true). */
  auth?: boolean;
}

async function send(path: string, opts: RequestOptions, accept: string): Promise<Response> {
  const headers = new Headers({ Accept: accept });
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (opts.auth !== false && token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new ApiError('network_error', 'Could not reach the server. Check your connection and try again.');
  }

  if (!res.ok) {
    const err = await readError(res);
    if (res.status === 401 && token) {
      clearToken();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw err;
  }
  return res;
}

/** JSON request. Resolves `undefined` for 204. */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts, 'application/json');
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface SSEMessage {
  event: string;
  data: unknown;
}

function parseBlock(raw: string): SSEMessage | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue; // blank / comment (keep-alive)
    const i = line.indexOf(':');
    const field = i === -1 ? line : line.slice(0, i);
    let value = i === -1 ? '' : line.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  if (data.length === 0) return null;
  const text = data.join('\n');
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* leave as string */
  }
  return { event, data: parsed };
}

/**
 * POST + Server-Sent Events. EventSource only supports GET, so we parse the
 * `text/event-stream` body ourselves from a fetch ReadableStream.
 */
export async function* streamSSE(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<SSEMessage, void, void> {
  const res = await send(path, { method: 'POST', body, signal }, 'text/event-stream');
  if (!res.body) throw new ApiError('no_stream', 'The server did not return a stream.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (e) {
        if (isAbortError(e)) throw e;
        throw new ApiError('stream_interrupted', 'The connection was interrupted.');
      }
      if (chunk.done) break;
      buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const msg = parseBlock(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
        if (msg) yield msg;
      }
    }
    buffer = (buffer + decoder.decode()).replace(/\r\n/g, '\n');
    if (buffer.trim()) {
      const msg = parseBlock(buffer);
      if (msg) yield msg;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
