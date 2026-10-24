import { describe, expect, it, vi } from 'vitest';
import { PostgresOnlineStore } from '../apps/api/src/postgresStore';

describe('PostgreSQL online snapshot writes', () => {
  it('serializes commits and waits for the latest queued state before acknowledging', async () => {
    let release!: () => void;
    const first = new Promise<void>(resolve => { release = resolve; });
    const committed: string[] = [];
    const store = new PostgresOnlineStore('restored', async value => {
      if (value === 'first') await first;
      committed.push(value);
    });
    expect(store.load()).toBe('restored');
    store.save('first'); store.save('second');
    const finished = vi.fn();
    const flush = store.flush().then(finished);
    await Promise.resolve();
    expect(committed).toEqual([]);
    expect(finished).not.toHaveBeenCalled();
    release(); await flush;
    expect(committed).toEqual(['first', 'second']);
    expect(store.load()).toBe('second');
  });

  it('fails closed after a database error instead of overwriting with a later snapshot', async () => {
    const write = vi.fn().mockRejectedValue(new Error('offline'));
    const store = new PostgresOnlineStore(null, write);
    store.save('first'); store.save('second');
    await expect(store.flush()).rejects.toThrow('offline');
    expect(write).toHaveBeenCalledTimes(1);
    expect(() => store.save('third')).toThrow('offline');
  });
});
