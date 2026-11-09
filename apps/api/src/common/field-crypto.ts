import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

/**
 * Field-level encryption for personal identifiers.
 *
 * WHAT THIS PROTECTS
 *   Aadhaar, PAN, UAN, ESI number and the bank account number. In the legacy
 *   system all five sat in plaintext in a shared Google Sheet, readable by
 *   anyone the sheet was shared with (defect D5).
 *
 * HOW
 *   AES-256-GCM with a random 96-bit IV per value. The stored string is
 *       v1:<iv-b64>:<tag-b64>:<ciphertext-b64>
 *   so the algorithm is versioned and a future key rotation can coexist with
 *   old rows. GCM is authenticated: tampering fails decryption instead of
 *   silently returning wrong data.
 *
 * KEY
 *   PII_ENCRYPTION_KEY, falling back to CREDENTIAL_ENCRYPTION_KEY.
 *   Must be 32 bytes, base64. Never committed — .env is gitignored and the
 *   deployment platform supplies it as a secret.
 *
 * WHAT THIS DOES NOT DO
 *   It does not make the API return these values. `maskedHint()` is what goes
 *   over the wire; a full value is only ever decrypted for a caller holding the
 *   explicit `hr:pii:read` permission, and every such read is audited.
 */

const PREFIX = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.PII_ENCRYPTION_KEY || process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'PII encryption key is not configured. Set PII_ENCRYPTION_KEY (or CREDENTIAL_ENCRYPTION_KEY) ' +
        'to a 32-byte base64 value. Generate one with: openssl rand -base64 32',
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      `PII encryption key must decode to 32 bytes, got ${buf.length}. Generate one with: openssl rand -base64 32`,
    );
  }
  cachedKey = buf;
  return buf;
}

/** Test-only hook so a suite can assert behaviour without touching process env. */
export function __resetKeyCache() {
  cachedKey = null;
}

export function encryptField(plain: string | null | undefined): string | null {
  const value = String(plain ?? '').trim();
  if (!value) return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptField(stored: string | null | undefined): string | null {
  const raw = String(stored ?? '');
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Encrypted field is not in the expected v1 format.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Encrypted field has an invalid IV or tag length.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/* ------------------------------------------------------------------ *
 * Masking — what the API is allowed to return
 * ------------------------------------------------------------------ */

/** "1234 5678 9012" -> "XXXX XXXX 9012"; short values collapse to "XXXX". */
export function maskedHint(plain: string | null | undefined): string | null {
  const v = String(plain ?? '').replace(/\s+/g, '');
  if (!v) return null;
  if (v.length <= 4) return 'XXXX';
  return `XXXX XXXX ${v.slice(-4)}`;
}

/** Aadhaar is masked to the last 4 digits only — UIDAI guidance. */
export function aadhaarHint(plain: string | null | undefined): string | null {
  const v = String(plain ?? '').replace(/\D/g, '');
  if (!v) return null;
  return v.length === 12 ? `XXXX XXXX ${v.slice(-4)}` : 'XXXX XXXX XXXX';
}

/** PAN keeps the entity-type character, which is not identifying: ABCDE1234F -> XXXXX1234X */
export function panHint(plain: string | null | undefined): string | null {
  const v = String(plain ?? '').toUpperCase().replace(/\s+/g, '');
  if (!v) return null;
  if (v.length !== 10) return 'XXXXXXXXXX';
  return `XXXXX${v.slice(5, 9)}X`;
}

/**
 * Deterministic lookup digest. Two different keys would give two different
 * digests, so this is only used to answer "is this the same value we already
 * hold?" without decrypting rows. Never used as an index for user data.
 */
export function blindIndex(plain: string | null | undefined): string | null {
  const v = String(plain ?? '').trim().toUpperCase();
  if (!v) return null;
  return createHmac('sha256', key()).update(v).digest('hex');
}

/** Constant-time compare for secrets such as a Webhook HMAC. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
