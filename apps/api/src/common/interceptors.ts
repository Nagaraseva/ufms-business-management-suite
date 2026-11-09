import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

/** Attach a correlation id to every request/response. */
@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const id = req.headers['x-correlation-id'] || randomUUID();
    req.correlationId = id;
    res.setHeader('x-correlation-id', id);
    return next.handle();
  }
}

/**
 * Audit interceptor.
 * Writes one tenant-scoped audit row per successful MUTATION. Reads are not
 * audited (volume), but every create/update/delete is.
 * Sensitive fields are never recorded — see REDACT.
 */
const REDACT = new Set([
  'password', 'passwordHash', 'pin', 'pinHash', 'token', 'tokenHash',
  'secret', 'mfaSecret', 'refreshToken', 'bankAccount', 'accountNumber',
]);

function redact(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = REDACT.has(k) ? '[redacted]' : redact(v);
  }
  return out;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const method = req.method as string;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next.handle();

    const user = req.user;
    const path: string = req.route?.path || req.url;

    return next.handle().pipe(
      tap((result) => {
        if (!user?.tenantId) return;
        const entityId =
          (result && (result.id ?? result.data?.id)) ??
          (req.params?.id ?? null);

        void this.prisma
          .withTenant(user.tenantId, (tx) =>
            tx.auditLog.create({
              data: {
                tenantId: user.tenantId,
                actorUserId: user.id,
                actorEmail: user.email,
                action: `${method} ${path}`,
                entityType: path.split('/').filter(Boolean)[2] ?? 'unknown',
                entityId: entityId ? String(entityId) : null,
                after: redact(result) as any,
                ip: req.ip,
                userAgent: req.headers['user-agent']?.slice(0, 300),
                correlationId: req.correlationId,
              },
            }),
          )
          .catch(() => undefined); // never fail a request because auditing failed
      }),
    );
  }
}
