import { createHmac } from 'crypto';

function getSecret(): string {
  return process.env.NEXTAUTH_SECRET || 'fallback-dev-key';
}

/** Generate HMAC-SHA256 signature for a promise completion link. */
export function signPromiseId(promiseId: string): string {
  return createHmac('sha256', getSecret())
    .update(`complete:${promiseId}`)
    .digest('hex')
    .slice(0, 32);
}

/** Verify that a signature matches the promise ID. */
export function verifyPromiseSignature(promiseId: string, sig: string): boolean {
  if (!promiseId || !sig) return false;
  return signPromiseId(promiseId) === sig;
}

/** Build the full completion URL for a given promise ID. */
export function completionUrl(promiseId: string): string {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const sig = signPromiseId(promiseId);
  return `${base}/api/promises/complete?id=${encodeURIComponent(promiseId)}&sig=${sig}`;
}
