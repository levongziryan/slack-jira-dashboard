import { createHmac, timingSafeEqual } from 'crypto';
import { appBaseUrl, appSecret } from '@/lib/config';

// Подпись покрывает пользователя и обещание: id обещаний уникальны только внутри пользователя.

/** Generate HMAC-SHA256 signature for a promise completion link. */
export function signPromiseId(userId: string, promiseId: string): string {
  return createHmac('sha256', appSecret())
    .update(`complete:${userId}:${promiseId}`)
    .digest('hex')
    .slice(0, 32);
}

/** Verify that a signature matches the user and promise ID (constant-time). */
export function verifyPromiseSignature(userId: string, promiseId: string, sig: string): boolean {
  if (!userId || !promiseId || !sig) return false;
  const a = Buffer.from(signPromiseId(userId, promiseId));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Build the full completion URL for a given promise ID. */
export function completionUrl(userId: string, promiseId: string): string {
  const sig = signPromiseId(userId, promiseId);
  return `${appBaseUrl()}/api/promises/complete?u=${encodeURIComponent(userId)}&id=${encodeURIComponent(promiseId)}&sig=${sig}`;
}
