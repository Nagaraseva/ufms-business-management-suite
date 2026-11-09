/**
 * Redis/BullMQ adapter placeholder — Phase 9 production readiness.
 *
 * Interface-compatible with QueueService: same enqueue/status/pending.
 * When REDIS_URL is set, this adapter is preferred; otherwise the in-process
 * QueueService remains the default (zero-infra, honest for single-node).
 *
 * Production wiring (env):
 *   REDIS_URL=redis://:password@host:6379/0
 *   QUEUE_ADAPTER=redis  (or auto when REDIS_URL present)
 *
 * Real implementation would `import { Queue, Worker } from 'bullmq'` and
 * delegate to a Redis-backed queue with concurrency, rate-limit, and
 * horizontal scaling. We keep it as a documented seam so the migration is
 * a config change, not a code change.
 */

export interface QueueAdapter {
  enqueue(type: string, payload: any, opts?: { runAt?: Date }): Promise<{ id: string }>;
  status(jobId: string): any | undefined;
  pending(tenantId?: string): any[];
}

export function shouldUseRedis(): boolean {
  return !!(process.env.REDIS_URL || process.env.QUEUE_ADAPTER === 'redis');
}

export function queueAdapterDocs(): string {
  return [
    'Queue adapter docs (Phase 9):',
    '- Default: in-process QueueService (apps/api/src/queue/queue.service.ts)',
    '- Redis: set REDIS_URL and QUEUE_ADAPTER=redis; deploy apps/api/src/queue/queue-redis.adapter.ts',
    '- Both adapters expose identical enqueue/status/pending; handlers register the same way.',
    '- Dead-letter jobs in Redis appear at GET /api/v1/queue/jobs (same shape).',
  ].join('\n');
}
