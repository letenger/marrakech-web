import { afterEach, describe, expect, it, vi } from 'vitest';
import { onlineRequest, readEvents } from '../src/online/transport';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('online transport recovery', () => {
  it('bounds stalled commands so a retry can reuse the same command id', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
    })));
    const result = onlineRequest('command', 'private', { id: 'same-id', type: 'roll' });
    const rejection = expect(result).rejects.toThrow(/too long/);
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
  });
  it('parses SSE frames split across chunks, including split CRLF separators', async () => {
    const chunks = ['event: snapshot\r', '\ndata: {"revision":1}\r', '\n\r', '\ndata: {"revision":2}\n\n'];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); },
    }))));
    const values: unknown[] = [];
    await expect(readEvents('private', new AbortController().signal, value => values.push(value), () => undefined)).rejects.toThrow(/interrupted/);
    expect(values).toEqual([{ revision: 1 }, { revision: 2 }]);
  });
  it('aborts silent streams after missing three heartbeats', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => Promise.resolve(new Response(new ReadableStream({
      start(controller) { init.signal!.addEventListener('abort', () => controller.error(new Error('idle timeout'))); },
    })))));
    const result = readEvents('private', new AbortController().signal, () => undefined, () => undefined);
    const rejection = expect(result).rejects.toThrow(/idle timeout/);
    await vi.advanceTimersByTimeAsync(45_000);
    await rejection;
  });
});
