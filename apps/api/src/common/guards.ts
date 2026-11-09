import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { PERMISSION_KEY, PUBLIC_KEY, AUTH_ONLY_KEY } from './decorators';

/**
 * Session guard.
 * Opaque bearer token (or HttpOnly cookie) -> SHA-256 -> sessions row.
 * The tenant is taken from the SESSION, never from a header or body, so a
 * caller cannot assert a tenant they do not belong to (Part 5).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly logger = new Logger(SessionGuard.name);

  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const handler = ctx.getHandler();
    const cls = ctx.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [handler, cls]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const raw =
      (req.headers['authorization'] as string)?.replace(/^Bearer\s+/i, '') ||
      (req.cookies?.ufms_session as string);
    if (!raw) throw new UnauthorizedException({ code: 'NO_SESSION', message: 'Sign-in required.' });

    const tokenHash = createHash('sha256').update(raw).digest('hex');

    // Session lookup precedes tenant resolution (the session IS what tells us
    // the tenant), so it uses the narrow auth client. Scoped by exact token hash.
    const session = await this.prisma.auth.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: { include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } } } },
    });

    if (!session || !session.user || session.user.deletedAt || !session.user.active) {
      throw new UnauthorizedException({ code: 'INVALID_SESSION', message: 'Session expired or invalid.' });
    }

    // Commercial gate — suspended/cancelled tenants blocked at the API (not just UI)
    // Uses auth client (no tenantId context) to read tenant status.
    try {
      const tenant = await this.prisma.auth.tenant.findUnique({ where: { id: session.user.tenantId }, select: { status: true, slug: true } });
      if (tenant && (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED')) {
        this.logger.warn(`Blocked ${tenant.slug} — tenant status ${tenant.status} — principal ${session.user.email}`);
        throw new ForbiddenException({ code: 'TENANT_SUSPENDED', message: `Workspace is ${tenant.status.toLowerCase()}. Contact support.` });
      }
    } catch (e: any) {
      if (e?.response?.code === 'TENANT_SUSPENDED') throw e;
      // On transient DB error, fail open for read (do not block logins)
      this.logger.warn(`Tenant status check failed (non-blocking): ${e?.message ?? e}`);
    }

    const roles = session.user.userRoles.map((ur) => ur.role);
    const permissions = new Set<string>();
    let isPlatformAdmin = false;
    for (const r of roles) {
      if (r.code === 'platform_admin') isPlatformAdmin = true;
      for (const rp of r.rolePermissions) permissions.add(rp.permission.code);
    }

    const user = {
      id: session.user.id,
      tenantId: session.user.tenantId,
      email: session.user.email,
      name: session.user.name,
      roles: roles.map((r) => r.code),
      permissions: [...permissions],
      isPlatformAdmin,
    };

    (req as any).user = user;
    (req as any).sessionId = session.id;

    // Touch last-seen without blocking the request.
    void this.prisma.auth.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);

    return true;
  }
}

/**
 * Permission guard — FAIL CLOSED.
 * No @RequirePermission() on a protected route = 403, not "allow".
 * 'tenant_owner' and platform admins hold every permission and are granted here.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const handler = ctx.getHandler();
    const cls = ctx.getClass();
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [handler, cls])) return true;

    // Explicit "any signed-in principal" routes (profile, logout).
    const authOnly = this.reflector.getAllAndOverride<boolean>(AUTH_ONLY_KEY, [handler, cls]);
    if (authOnly) {
      if (!ctx.switchToHttp().getRequest().user) {
        throw new ForbiddenException({ code: 'NO_PRINCIPAL', message: 'Not signed in.' });
      }
      return true;
    }

    const declared = this.reflector.getAllAndOverride<string | string[]>(PERMISSION_KEY, [handler, cls]);
    if (!declared || (Array.isArray(declared) && declared.length === 0)) {
      throw new ForbiddenException({
        code: 'NO_PERMISSION_DECLARED',
        message: 'This endpoint is not permitted to run: no permission was declared for it.',
      });
    }
    const required = Array.isArray(declared) ? declared : [declared];

    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException({ code: 'NO_PRINCIPAL', message: 'Not signed in.' });
    if (user.isPlatformAdmin) return true;
    if (user.roles.includes('tenant_owner')) return true;
    // Any-of semantics: holding any one of the declared permissions is enough.
    if (required.some((code) => user.permissions.includes(code))) return true;

    throw new ForbiddenException({
      code: 'PERMISSION_DENIED',
      message: `You do not have permission to do this (${required.join(' or ')}).`,
    });
  }
}
