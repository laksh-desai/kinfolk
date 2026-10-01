import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShutdown } from './shutdown';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('createShutdown', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('closes, disconnects, and exits 0 in that order', async () => {
    const order: string[] = [];
    const exit = vi.fn();
    createShutdown({
      close: async () => void order.push('close'),
      disconnect: async () => void order.push('disconnect'),
      exit,
    })();
    await settle();
    expect(order).toEqual(['close', 'disconnect']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('gives up after the timeout when a request will not finish', async () => {
    const exit = vi.fn();
    const log = vi.fn();
    createShutdown({ close: () => new Promise(() => undefined), disconnect: async () => undefined, exit, log, timeoutMs: 5_000 })();
    vi.advanceTimersByTime(4_999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('5000 ms'));
  });

  it('exits 1 when closing fails, and says why', async () => {
    const exit = vi.fn();
    const log = vi.fn();
    createShutdown({ close: async () => undefined, disconnect: async () => { throw new Error('pool gone'); }, exit, log })();
    await settle();
    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('pool gone'));
  });

  it('ignores a second signal while the first is being handled', async () => {
    const close = vi.fn(async () => undefined);
    const shutdown = createShutdown({ close, disconnect: async () => undefined, exit: vi.fn() });
    shutdown();
    shutdown();
    await settle();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
