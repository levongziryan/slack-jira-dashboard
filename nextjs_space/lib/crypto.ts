import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// Шифрование токенов пользователей в базе: AES-256-GCM.
// Ключ: SETTINGS_ENCRYPTION_KEY, если не задан - NEXTAUTH_SECRET. Для SaaS задайте отдельный
// SETTINGS_ENCRYPTION_KEY: при смене ключа сохранённые токены станут нечитаемыми и их придётся ввести заново.
function key(): Buffer {
  const raw = (process.env.SETTINGS_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || '').trim();
  if (!raw) throw new Error('Не задан SETTINGS_ENCRYPTION_KEY (или NEXTAUTH_SECRET) для шифрования настроек');
  return createHash('sha256').update(raw).digest();
}

export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

// Возвращает null, если значение повреждено или зашифровано другим ключом.
export function decryptText(payload: string): string | null {
  try {
    const [v, iv, tag, ct] = payload.split(':');
    if (v !== 'v1' || !iv || !tag || !ct) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
