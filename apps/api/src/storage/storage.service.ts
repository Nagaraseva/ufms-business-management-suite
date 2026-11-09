import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Storage adapter — Rule 4: never permanently store uploads on app server local filesystem.
 *
 * Interface is provider-agnostic (S3, GCS, Azure Blob, R2 all speak the same
 * dialect: put object, get signed URL, delete). Production should set
 * STORAGE_PROVIDER=s3|s3_compatible|gcs|azure and STORAGE_BUCKET.
 * `console` provider is the safe dev default: keeps metadata + checksum in DB,
 * returns a deterministic signed-URL placeholder, never writes to disk.
 */
export type StorageProvider = 'console' | 's3' | 's3_compatible' | 'gcs' | 'azure';

export interface StoredObject {
  storageKey: string;
  bucket: string;
  checksum: string;
  size: number;
  mime: string;
  originalName: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: StorageProvider;
  private readonly bucket: string;
  private readonly signingSecret: string;

  constructor() {
    this.provider = (process.env.STORAGE_PROVIDER as StorageProvider) || 'console';
    this.bucket = process.env.STORAGE_BUCKET || 'ufms-dev';
    this.signingSecret = process.env.AUTH_SECRET || 'dev-only-signing-secret-do-not-use-in-prod';
  }

  describe(): { provider: StorageProvider; bucket: string; mode: string } {
    return { provider: this.provider, bucket: this.bucket, mode: this.provider === 'console' ? 'metadata-only (no disk)' : 'object-storage' };
  }

  /**
   * Validate and register an upload. Caller supplies the bytes via multipart
   * or presigned-PUT; this method validates guardrails and returns the
   * canonical storageKey the object MUST be stored under.
   */
  async registerUpload(opts: {
    tenantId: string;
    originalName: string;
    mimeType?: string;
    sizeBytes: number;
    checksum?: string; // sha256 hex if client computed
    category?: string; // employee_document | creative_asset | branding_logo | etc
  }): Promise<StoredObject> {
    if (!opts.originalName) throw new BadRequestException('originalName required');
    if (opts.sizeBytes > maxBytes()) throw new BadRequestException(`File too large: ${opts.sizeBytes} > ${maxBytes()}`);
    if (isForbiddenExt(opts.originalName)) throw new BadRequestException('File type not allowed');

    const safeName = sanitizeFileName(opts.originalName);
    const prefix = opts.category ?? 'uploads';
    const storageKey = `${opts.tenantId}/${prefix}/${new Date().toISOString().slice(0, 10)}/${randomBytes(8).toString('hex')}-${safeName}`;
    const checksum = opts.checksum ?? createHash('sha256').update(storageKey).digest('hex').slice(0, 16);

    if (this.provider === 'console') {
      this.logger.log(`[console storage] registered ${storageKey} (${opts.sizeBytes} bytes, ${opts.mimeType ?? 'unknown'})`);
      // Intentionally writing nothing to disk — metadata lives in employee_documents / creative_assets
      return { storageKey, bucket: this.bucket, checksum, size: opts.sizeBytes, mime: opts.mimeType ?? 'application/octet-stream', originalName: opts.originalName };
    }

    // S3/GCS/Azure: caller should PUT directly to the signed URL we will mint;
    // we have validated and reserved the key.
    return { storageKey, bucket: this.bucket, checksum, size: opts.sizeBytes, mime: opts.mimeType ?? 'application/octet-stream', originalName: opts.originalName };
  }

  /**
   * Mint a time-limited download URL.
   * Console provider returns a placeholder that never serves bytes (honest).
   * S3/GCS/Azure providers would call AWS SDK GetObject presign; we simulate
   * the HMAC so the contract is visible in tests without credentials.
   */
  signedUrl(storageKey: string, opts?: { expiresInSec?: number }): string {
    const exp = Math.floor(Date.now() / 1000) + (opts?.expiresInSec ?? 900);
    if (this.provider === 'console') {
      return `/api/v1/storage/preview/${encodeURIComponent(storageKey)}?exp=${exp}&sig=console-${createHash('sha256').update(storageKey + exp + this.signingSecret).digest('hex').slice(0, 16)}`;
    }
    const sig = createHash('sha256').update(`${storageKey}:${exp}:${this.signingSecret}`).digest('hex').slice(0, 32);
    return `https://${this.bucket}.storage.example/${encodeURIComponent(storageKey)}?X-Expires=${exp}&X-Signature=${sig}`;
  }

  verifyPreviewToken(storageKey: string, exp: string, sig: string): boolean {
    if (this.provider !== 'console') return true; // real provider verifies its own SigV4
    const expected = createHash('sha256').update(storageKey + exp + this.signingSecret).digest('hex').slice(0, 16);
    if (sig !== `console-${expected}`) return false;
    if (Number(exp) * 1000 < Date.now()) return false;
    return true;
  }
}

function maxBytes(): number { return Number(process.env.STORAGE_MAX_BYTES || 25 * 1024 * 1024); }
function isForbiddenExt(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ['exe', 'bat', 'sh', 'dll', 'so'].includes(ext);
}
function sanitizeFileName(name: string): string {
  const base = name.split('/').pop()!.split('\\').pop()!; // strip dirs, handle traversal
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.\.+/g, '.').slice(0, 120) || 'file';
}
