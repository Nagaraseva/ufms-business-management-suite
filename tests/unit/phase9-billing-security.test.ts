import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

describe('Billing webhook HMAC — Phase 9', () => {
  it('stripe signature verification is strict', async () => {
    const { BillingService } = await import('../../apps/api/src/billing/billing.service');
    const svc: any = new (BillingService as any)({} as any);
    // No secret → verification fails
    expect(svc.verifySignature('stripe', '{}', 't=1,v1=abc', '')).toBe(false);
    // Correct HMAC
    const secret = 'whsec_test';
    const body = JSON.stringify({ type: 'invoice.payment_failed' });
    const sig = `t=1710000000,v1=${createHmac('sha256', secret).update(`1710000000.${body}`).digest('hex')}`;
    expect(svc.verifySignature('stripe', body, sig, secret)).toBe(true);
    expect(svc.verifySignature('stripe', body, 't=1,v1=bad', secret)).toBe(false);
  });
  it('razorpay/console HMAC path', async () => {
    const { BillingService } = await import('../../apps/api/src/billing/billing.service');
    const svc: any = new (BillingService as any)({} as any);
    const secret = 'rzp_secret';
    const body = JSON.stringify({ tenantId: 't1', status: 'ACTIVE' });
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(svc.verifySignature('razorpay', body, sig, secret)).toBe(true);
  });
  it('entitlement degrades honestly without DB', async () => {
    const { BillingService } = await import('../../apps/api/src/billing/billing.service');
    const svc = new (BillingService as any)({ subscription: { findFirst: async () => { throw new Error('no table'); } } });
    const ent = await svc.entitlement('t1');
    expect(ent.status).toBe('UNKNOWN');
    expect(ent.tenantId).toBe('t1');
  });
});

describe('Queue Redis adapter seam — Phase 9', () => {
  it('shouldUseRedis respects env', async () => {
    const { shouldUseRedis, queueAdapterDocs } = await import('../../apps/api/src/queue/queue-redis.adapter');
    delete process.env.REDIS_URL; delete process.env.QUEUE_ADAPTER;
    expect(shouldUseRedis()).toBe(false);
    process.env.REDIS_URL = 'redis://localhost:6379/0';
    expect(shouldUseRedis()).toBe(true);
    delete process.env.REDIS_URL;
    expect(queueAdapterDocs()).toContain('Default: in-process');
  });
});

describe('Security review doc exists', () => {
  it('docs/security-review.md is present and mentions RLS', async () => {
    const fs = await import('node:fs');
    expect(fs.existsSync('docs/security-review.md')).toBe(true);
    expect(fs.readFileSync('docs/security-review.md','utf8')).toMatch(/Row Level Security|RLS/);
  });
  it('docs/deployment.md covers backups and suspension', async () => {
    const fs = await import('node:fs');
    const text = fs.readFileSync('docs/deployment.md','utf8');
    expect(text).toMatch(/PITR|pg_dump/);
    expect(text).toMatch(/TENANT_SUSPENDED|SUSPENDED/);
  });
});
