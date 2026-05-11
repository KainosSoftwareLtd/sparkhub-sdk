/**
 * Cross-tab refresh coordinator (browser-only).
 *
 * Multiple tabs of the same partner app can race on token refresh. Each tab
 * sees a 401, each tab tries to refresh — and the server's refresh-token
 * reuse-detection revokes the chain on the second arrival. Without
 * coordination, a multi-tab session is fragile.
 *
 * This module fixes that with two browser primitives:
 *
 *   - **Web Locks (`navigator.locks`)** — only the lock holder runs the
 *     network refresh. Peer tabs wait at the lock; once it releases they
 *     re-read storage and use the new tokens the holder wrote.
 *   - **BroadcastChannel** — the holder posts a "refreshed" event so peers
 *     can react (e.g. fire `onTokenRefresh`) without waiting for their next
 *     fetch to read storage.
 *
 * Browser support:
 *   - Web Locks: Chrome 69+, Firefox 96+, Safari 15.4+
 *   - BroadcastChannel: Chrome 54+, Firefox 38+, Safari 15.4+
 *
 * Older browsers fall back to the previous in-tab dedupe behavior — no
 * cross-tab coordination, but no regression either.
 */

const LOCK_NAME_PREFIX = 'sparkhub_partner_app:';
const CHANNEL_NAME_PREFIX = 'sparkhub_partner_app:';

export type CoordinatorEvent =
  | { type: 'refreshed' }
  | { type: 'signed-out' }
  | { type: 'signed-in' };

export interface CoordinatorOptions {
  clientId: string;
  onPeerEvent?: (event: CoordinatorEvent) => void;
}

export class RefreshCoordinator {
  private channel: BroadcastChannel | null = null;
  private readonly lockName: string;

  constructor(opts: CoordinatorOptions) {
    this.lockName = `${LOCK_NAME_PREFIX}${opts.clientId}:refresh`;

    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      return;
    }
    try {
      this.channel = new BroadcastChannel(`${CHANNEL_NAME_PREFIX}${opts.clientId}`);
      this.channel.onmessage = (ev: MessageEvent<CoordinatorEvent>) => {
        opts.onPeerEvent?.(ev.data);
      };
    } catch {
      this.channel = null;
    }
  }

  async withLock<T>(callback: () => Promise<T>): Promise<T> {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.locks === 'undefined' ||
      navigator.locks === null
    ) {
      return await callback();
    }
    return await navigator.locks.request(this.lockName, callback);
  }

  broadcast(event: CoordinatorEvent): void {
    this.channel?.postMessage(event);
  }

  close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}
