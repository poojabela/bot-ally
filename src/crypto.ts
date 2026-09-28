import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env';

const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex');

export function encrypt(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decrypt(encrypted: string) {
  const [iv, tag, ciphertext] = encrypted.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

const STATE_TTL_MS = 15 * 60 * 1000;

function sign(payload: string) {
  return createHmac('sha256', env.OAUTH_STATE_SECRET).update(payload).digest('base64url');
}

export function signState(userId: string) {
  const payload = `${userId}.${Date.now() + STATE_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyState(state: string) {
  const [userId, expiry, signature] = state.split('.');
  if (!userId || !expiry || !signature) return null;
  const expected = Buffer.from(sign(`${userId}.${expiry}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (Number(expiry) < Date.now()) return null;
  return userId;
}
