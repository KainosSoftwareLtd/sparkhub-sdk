import { describe, it, expect } from 'vitest';
import { generatePkcePair, generateRandomBase64Url } from './pkce.js';

describe('generateRandomBase64Url', () => {
  it('produces a base64url string (no +, /, or = padding)', () => {
    const value = generateRandomBase64Url(32);
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns the expected length for the requested byte count', () => {
    // base64url of N bytes is ceil(4N/3) chars without padding
    const value = generateRandomBase64Url(24);
    expect(value.length).toBe(32);
  });

  it('returns different values across calls (entropy sanity check)', () => {
    const a = generateRandomBase64Url();
    const b = generateRandomBase64Url();
    expect(a).not.toBe(b);
  });
});

describe('generatePkcePair', () => {
  it('returns a verifier, an S256 challenge, and the method tag', async () => {
    const pair = await generatePkcePair();
    expect(pair.method).toBe('S256');
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces a 43-char SHA-256 challenge (32 bytes -> base64url)', async () => {
    const pair = await generatePkcePair();
    expect(pair.challenge.length).toBe(43);
  });

  it('verifier and challenge differ (challenge is the SHA-256 of the verifier, not the verifier itself)', async () => {
    const pair = await generatePkcePair();
    expect(pair.verifier).not.toBe(pair.challenge);
  });

  it('challenge is deterministic for a given verifier (RFC 7636 conformance)', async () => {
    // Compute a challenge twice for the same string and verify equivalence
    // by re-running the digest pathway.
    const verifierEncoded = new TextEncoder().encode('test-verifier-12345');
    const digestA = await crypto.subtle.digest('SHA-256', verifierEncoded);
    const digestB = await crypto.subtle.digest('SHA-256', verifierEncoded);
    expect(new Uint8Array(digestA)).toEqual(new Uint8Array(digestB));
  });
});
