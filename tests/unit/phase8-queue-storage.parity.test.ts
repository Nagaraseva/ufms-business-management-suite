import { describe, it, expect } from 'vitest';
import { StorageService } from '../../apps/api/src/storage/storage.service';

describe('Queue job types — Phase 8 worker', () => {
  it('enqueue validates tenantId', async () => {
    const { QueueService } = await import('../../apps/api/src/queue/queue.service');
    const fakePrisma: any = {};
    const q = new QueueService(fakePrisma);
    await expect(q.enqueue('marketing:send_campaign' as any, { tenantId: '', campaignId: 'x' } as any)).rejects.toThrow();
  });
  it('maxAttempts per job type', async () => {
    const { QueueService } = await import('../../apps/api/src/queue/queue.service');
    const fakePrisma: any = {};
    const q = new QueueService(fakePrisma);
    const j1 = await q.enqueue('marketing:send_campaign', { tenantId: 't1', campaignId: 'c1' });
    expect(j1.maxAttempts).toBe(3);
    const j2 = await q.enqueue('ai:execute_tool', { tenantId: 't1', toolCallId: 'x' });
    expect(j2.maxAttempts).toBe(2);
  });
  it('pending filters by tenant (no handler → jobs become dead, not pending)', async () => {
    const { QueueService } = await import('../../apps/api/src/queue/queue.service');
    const fakePrisma: any = {};
    const q = new QueueService(fakePrisma);
    q.register('marketing:send_campaign', async () => { throw new Error('fail to keep pending'); });
    await q.enqueue('marketing:send_campaign', { tenantId: 't1', campaignId: 'c1' });
    await q.enqueue('marketing:send_campaign', { tenantId: 't2', campaignId: 'c2' });
    // Allow tick to run
    await new Promise(r => setTimeout(r, 50));
    // Both attempted once and re-queued (pending) because maxAttempts=3
    expect(q.pending('t1').length).toBe(1);
    expect(q.pending().length).toBe(2);
  });
});

describe('StorageService — Rule 4 (no local disk) + signed URLs', () => {
  it('console provider reports metadata-only mode', () => {
    process.env.STORAGE_PROVIDER = 'console';
    const s = new StorageService();
    expect(s.describe().mode).toContain('metadata-only');
  });
  it('registerUpload reserves tenant-scoped key', async () => {
    const s = new StorageService();
    const obj = await s.registerUpload({ tenantId: 'tenant-123', originalName: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 2048, category: 'invoices' });
    expect(obj.storageKey.startsWith('tenant-123/invoices/')).toBe(true);
    expect(obj.storageKey.endsWith('invoice.pdf')).toBe(true);
    expect(obj.bucket).toBeTruthy();
  });
  it('registerUpload rejects forbidden extensions', async () => {
    const s = new StorageService();
    await expect(s.registerUpload({ tenantId: 't1', originalName: 'evil.exe', sizeBytes: 100 } as any)).rejects.toThrow(/not allowed/);
  });
  it('registerUpload rejects oversized file', async () => {
    const s = new StorageService();
    await expect(s.registerUpload({ tenantId: 't1', originalName: 'big.pdf', sizeBytes: 100 * 1024 * 1024 } as any)).rejects.toThrow(/too large/i);
  });
  it('signedUrl round-trips via verifyPreviewToken (console)', () => {
    const s = new StorageService();
    const key = 't1/uploads/2026-01-01/abc-file.pdf';
    const url = s.signedUrl(key, { expiresInSec: 600 });
    const u = new URL(url, 'http://localhost');
    expect(s.verifyPreviewToken(key, u.searchParams.get('exp')!, u.searchParams.get('sig')!)).toBe(true);
    expect(s.verifyPreviewToken(key, '1', 'bad')).toBe(false);
  });
  it('sanitizeFileName strips path traversal', async () => {
    const s = new StorageService();
    const obj = await s.registerUpload({ tenantId: 't1', originalName: '../../etc/passwd', sizeBytes: 10 } as any);
    expect(obj.storageKey.split('/').pop()!.includes('..')).toBe(false);
    expect(obj.storageKey.includes('/etc/passwd')).toBe(false);
  });
});

describe('Tenant suspension — SessionGuard', () => {
  it('SUSPENDED status is defined in schema', async () => {
    const fs = await import('node:fs');
    const schema = fs.readFileSync('packages/database/prisma/schema.prisma', 'utf8');
    expect(schema).toContain('SUSPENDED');
    expect(schema).toContain('TenantStatus');
    expect(schema).toContain('SubscriptionStatus');
  });
});
