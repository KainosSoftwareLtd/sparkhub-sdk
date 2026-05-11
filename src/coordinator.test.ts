import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RefreshCoordinator, type CoordinatorEvent } from './coordinator.js';

describe('RefreshCoordinator', () => {
  beforeEach(() => {
    // jsdom does not implement navigator.locks. The coordinator detects this
    // and falls back to direct callback invocation. Tests assume that path
    // unless otherwise noted.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to running the callback directly when Web Locks unsupported', async () => {
    const c = new RefreshCoordinator({ clientId: 'papp_test' });
    let ran = false;
    const result = await c.withLock(async () => {
      ran = true;
      return 'value';
    });
    expect(ran).toBe(true);
    expect(result).toBe('value');
    c.close();
  });

  it('uses navigator.locks when available', async () => {
    const requestSpy = vi.fn(
      async (_name: string, _opts: unknown, cb: (lock: { name: string }) => Promise<unknown>) => {
        return cb({ name: 'mock' });
      },
    );
    // 3-arg signature matches the standard but the coordinator calls
    // navigator.locks.request(name, callback) — the 2-arg form. Wrap to handle both.
    const requestImpl = vi.fn(async (..._args: unknown[]) => {
      const last = _args[_args.length - 1];
      if (typeof last === 'function') {
        return await (last as (l: unknown) => unknown)({ name: 'mock' });
      }
      return undefined;
    });
    Object.defineProperty(navigator, 'locks', {
      value: { request: requestImpl },
      configurable: true,
    });

    const c = new RefreshCoordinator({ clientId: 'papp_test_locks' });
    const result = await c.withLock(async () => 'locked-result');
    expect(result).toBe('locked-result');
    expect(requestImpl).toHaveBeenCalledTimes(1);
    c.close();

    // Cleanup
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    expect(requestSpy).not.toHaveBeenCalled(); // unused, just for type satisfaction
  });

  it('broadcasts events through BroadcastChannel when available', async () => {
    if (typeof BroadcastChannel === 'undefined') {
      // jsdom v22+ supports BroadcastChannel; bail if not.
      return;
    }
    const received: CoordinatorEvent[] = [];
    const listener = new BroadcastChannel('sparkhub_partner_app:papp_broadcast_test');
    listener.onmessage = (e: MessageEvent<CoordinatorEvent>) => received.push(e.data);

    const c = new RefreshCoordinator({ clientId: 'papp_broadcast_test' });
    c.broadcast({ type: 'refreshed' });

    // BroadcastChannel delivers asynchronously
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toEqual([{ type: 'refreshed' }]);
    listener.close();
    c.close();
  });

  it('peer-event handler fires for messages from other instances on same channel', async () => {
    if (typeof BroadcastChannel === 'undefined') return;
    const peerEvents: CoordinatorEvent[] = [];

    const listener = new RefreshCoordinator({
      clientId: 'papp_peer_test',
      onPeerEvent: (e) => peerEvents.push(e),
    });

    // Simulate a peer tab broadcasting on the same channel
    const sender = new BroadcastChannel('sparkhub_partner_app:papp_peer_test');
    sender.postMessage({ type: 'refreshed' });
    sender.postMessage({ type: 'signed-out' });

    await new Promise((r) => setTimeout(r, 10));

    expect(peerEvents).toEqual([{ type: 'refreshed' }, { type: 'signed-out' }]);
    sender.close();
    listener.close();
  });

  it('close() is idempotent', () => {
    const c = new RefreshCoordinator({ clientId: 'papp_close_test' });
    c.close();
    c.close();
    // No exception = pass
  });
});
