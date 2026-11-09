import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type JobType =
  | 'marketing:send_campaign'
  | 'social:publish_post'
  | 'ai:execute_tool'
  | 'report:generate_snapshot'
  | 'storage:process_upload';

export interface JobPayload {
  tenantId: string;
  actorId?: string;
  [key: string]: any;
}

export interface Job {
  id: string;
  type: JobType;
  payload: JobPayload;
  tenantId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead';
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  createdAt: Date;
  runAt: Date;
}

const MAX_ATTEMPTS: Record<JobType, number> = {
  'marketing:send_campaign': 3,
  'social:publish_post': 3,
  'ai:execute_tool': 2,
  'report:generate_snapshot': 2,
  'storage:process_upload': 3,
};

/**
 * Worker queue — intentionally dependency-free (no Redis) for single-node
 * deployments and test environments. Jobs persist in the DB via the `jobs`
 * table if present; otherwise in-memory only (honest degradation).
 *
 * Multi-instance deployments should replace `processNext()` driver with a
 * Redis/BullMQ adapter behind the same `enqueue()` / `status()` interface.
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly mem: Job[] = [];
  private handlers = new Map<JobType, (payload: JobPayload) => Promise<void>>();
  private ticking = false;

  constructor(private readonly prisma: PrismaService) {}

  register(type: JobType, handler: (payload: JobPayload) => Promise<void>) {
    this.handlers.set(type, handler);
    this.logger.log(`Handler registered: ${type}`);
  }

  async enqueue(type: JobType, payload: JobPayload, opts?: { runAt?: Date }): Promise<Job> {
    if (!payload.tenantId) throw new Error('payload.tenantId required');
    const job: Job = {
      id: cryptoRandomId(),
      type,
      payload,
      tenantId: payload.tenantId,
      status: 'pending',
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS[type] ?? 3,
      createdAt: new Date(),
      runAt: opts?.runAt ?? new Date(),
    };
    this.mem.push(job);
    // Best-effort DB persistence if `jobs` table exists (Phase 8 migration)
    try {
      await (this.prisma as any).job?.create?.({ data: {
        id: job.id, tenantId: job.tenantId, type: job.type,
        payload: job.payload, status: job.status,
        attempts: 0, maxAttempts: job.maxAttempts,
        runAt: job.runAt,
      }});
    } catch {}
    this.logger.log(`Enqueued ${type} ${job.id} tenant=${payload.tenantId}`);
    // Kick worker loop without blocking caller
    void this.tick();
    return job;
  }

  status(jobId: string): Job | undefined {
    return this.mem.find(j => j.id === jobId);
  }

  pending(tenantId?: string): Job[] {
    const list = [...this.mem].filter(j => j.status === 'pending' || j.status === 'processing');
    return tenantId ? list.filter(j => j.tenantId === tenantId) : list;
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      while (true) {
        const next = this.mem
          .filter(j => j.status === 'pending' && j.runAt <= new Date())
          .sort((a, b) => a.runAt.getTime() - b.runAt.getTime())[0];
        if (!next) break;
        await this.processOne(next);
      }
    } finally {
      this.ticking = false;
    }
  }

  private async processOne(job: Job) {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      job.status = 'dead';
      job.lastError = `No handler for ${job.type}`;
      this.logger.warn(job.lastError);
      return;
    }
    job.status = 'processing';
    job.attempts += 1;
    try {
      await handler(job.payload);
      job.status = 'completed';
      this.logger.log(`Job ${job.id} ${job.type} completed`);
      try { await (this.prisma as any).job?.update?.({ where: { id: job.id }, data: { status: 'completed', attempts: job.attempts }}); } catch {}
    } catch (e: any) {
      job.lastError = e?.message ?? String(e);
      this.logger.warn(`Job ${job.id} attempt ${job.attempts} failed: ${job.lastError}`);
      try { await (this.prisma as any).job?.update?.({ where: { id: job.id }, data: { status: 'failed', attempts: job.attempts, lastError: job.lastError }}).catch(()=>{}); } catch {}
      if (job.attempts >= job.maxAttempts) {
        job.status = 'dead';
      } else {
        job.status = 'pending';
        // exponential backoff: 2s, 8s, 32s ...
        job.runAt = new Date(Date.now() + Math.pow(4, job.attempts) * 500);
      }
    }
  }
}

function cryptoRandomId(): string {
  // Node 20 crypto.randomUUID is available; fallback to timestamp+random
  try { return (globalThis as any).crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
