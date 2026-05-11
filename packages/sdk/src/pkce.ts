/**
 * PKCE (RFC 7636) verifier + S256 challenge generation.
 *
 * Uses the browser's Web Crypto API. No external deps.
 */

function base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateRandomBase64Url(byteLength = 32): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return base64url(buf.buffer);
}

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export async function generatePkcePair(): Promise<PkcePair> {
  const verifier = generateRandomBase64Url(32);
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return { verifier, challenge: base64url(digest), method: 'S256' };
}
