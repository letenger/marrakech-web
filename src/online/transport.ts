// Fetch-based SSE keeps credentials out of URLs and works across API origins.
export const ONLINE_API = (import.meta.env.VITE_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const SESSION_KEY = 'marrakech-online-session-v1';
export type GuestSession = { token: string; guestId: string; name: string };

export function readSession(): GuestSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as GuestSession | null;
    return value && typeof value.token === 'string' && typeof value.guestId === 'string' && typeof value.name === 'string' ? value : null;
  } catch { return null; }
}

export function saveSession(session: GuestSession | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* The in-memory session still works when browser storage is unavailable. */ }
}

export class OnlineError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function onlineRequest<T>(path: string, token?: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('The server took too long. Please try again.')), path === 'session' || path === 'snapshot' ? 90_000 : 10_000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${ONLINE_API}/api/online/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : 'The request could not be completed.';
      throw new OnlineError(message, response.status);
    }
    return data as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export async function readEvents(token: string, signal: AbortSignal, onData: (data: unknown) => void, onConnected: () => void) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  let watchdog = setTimeout(() => controller.abort(), 90_000);
  function resetWatchdog() {
    clearTimeout(watchdog);
    // Heartbeats arrive every 15 seconds. Detect half-open connections too.
    watchdog = setTimeout(() => controller.abort(), 45_000);
  }
  try {
    const response = await fetch(`${ONLINE_API}/api/online/events`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    });
    if (!response.ok) throw new OnlineError('Connection unavailable. Please reconnect.', response.status);
    if (!response.body) throw new Error('Live updates are unavailable in this browser.');
    onConnected();
    resetWatchdog();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    try {
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        resetWatchdog();
        pending = (pending + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
        let boundary: number;
        while ((boundary = pending.indexOf('\n\n')) >= 0) {
          const frame = pending.slice(0, boundary);
          pending = pending.slice(boundary + 2);
          const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (data) onData(JSON.parse(data) as unknown);
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (!signal.aborted) throw new Error('Connection interrupted. Reconnecting…');
  } finally {
    clearTimeout(watchdog);
    signal.removeEventListener('abort', abort);
    controller.abort();
  }
}
