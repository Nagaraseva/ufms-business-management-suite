import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service';

/**
 * Authentication.
 * - Passwords/PINs are Argon2id only. The legacy system used a PIN hash; the
 *   import path re-hashes on first successful reset (see migration-plan §5).
 * - Sessions are opaque 32-byte tokens. Only the SHA-256 is stored, so a
 *   database leak does not yield usable sessions.
 * - Brute force: 5 failures locks the account for 15 minutes.
 */
const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  static hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  static async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }

  /**
   * Resolve which tenant to authenticate against.
   * Order: explicit tenant slug -> verified custom/subdomain -> single tenant
   * matching the email domain. Never trusts a tenant id from the client as
   * proof of access; it only selects the realm to check credentials in.
   */
  private async resolveTenant(email: string, tenantSlug?: string, hostname?: string) {
    if (tenantSlug) {
      const t = await this.prisma.auth.tenant.findUnique({ where: { slug: tenantSlug } });
      if (!t) throw new UnauthorizedException({ code: 'UNKNOWN_TENANT', message: 'Unknown workspace.' });
      return t;
    }
    if (hostname) {
      const d = await this.prisma.auth.tenantDomain.findUnique({ where: { hostname }, include: { tenant: true } });
      if (d?.tenant) return d.tenant;
    }
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain) {
      const candidates = await this.prisma.auth.user.findMany({
        where: { email: email.toLowerCase(), deletedAt: null },
        include: { tenant: true },
        take: 2,
      });
      if (candidates.length === 1) return candidates[0].tenant;
      if (candidates.length > 1) {
        throw new UnauthorizedException({
          code: 'TENANT_REQUIRED',
          message: 'This email exists in more than one workspace. Provide your workspace name.',
        });
      }
    }
    throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
  }

  async login(input: { email: string; password: string; tenantSlug?: string; hostname?: string; ip?: string; userAgent?: string }) {
    const email = (input.email || '').trim().toLowerCase();
    if (!email || !input.password) {
      throw new BadRequestException({ code: 'VALIDATION', message: 'Email and password are required.' });
    }

    const tenant = await this.resolveTenant(email, input.tenantSlug, input.hostname);

    const user = await this.prisma.auth.user.findFirst({
      where: { tenantId: tenant.id, email, deletedAt: null },
    });

    const fail = async (reason: string) => {
      await this.prisma.auth.loginHistory.create({
        data: { tenantId: tenant.id, userId: user?.id ?? null, email, success: false, reason, ip: input.ip, userAgent: input.userAgent },
      }).catch(() => undefined);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
    };

    if (!user) return fail('no_user');
    if (!user.active) return fail('inactive');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({ code: 'LOCKED', message: 'Too many failed attempts. Try again later.' });
    }

    const ok = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!ok) {
      const attempts = user.failedAttempts + 1;
      await this.prisma.auth.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: attempts,
            lockedUntil: attempts >= LOCK_THRESHOLD ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
          },
        }).catch(() => undefined);
      return fail('bad_password');
    }

    // Success
    await this.prisma.auth.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const raw = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h, matches legacy SESSION_HOURS

    await this.prisma.withTenant(tenant.id, (tx) =>
      tx.session.create({
        data: { tenantId: tenant.id, userId: user.id, tokenHash: AuthService.hashToken(raw), ip: input.ip, userAgent: input.userAgent, expiresAt },
      }),
    );

    await this.prisma.auth.loginHistory.create({
      data: { tenantId: tenant.id, userId: user.id, email, success: true, ip: input.ip, userAgent: input.userAgent },
    });

    return { token: raw, expiresAt: expiresAt.toISOString(), user: await this.me(user.id, tenant.id) };
  }

  async logout(sessionId: string, tenantId: string) {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }),
    );
    return { ok: true };
  }

  async me(userId: string, tenantId: string) {
    const user = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({
        where: { id: userId },
        include: {
          userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
          department: true,
        },
      }),
    );
    if (!user) throw new UnauthorizedException({ code: 'NO_USER', message: 'User not found.' });

    const roles = user.userRoles.map((ur) => ur.role.code);
    const permissions = new Set<string>();
    for (const ur of user.userRoles) for (const rp of ur.role.rolePermissions) permissions.add(rp.permission.code);

    // Tenant + branding are read inside the tenant context so RLS applies to
    // tenant_branding (a tenant-owned table). Reading them on the raw client
    // returned null branding — a real bug caught by the smoke test.
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const branding = await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenantBranding.findUnique({ where: { tenantId } }),
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      roles,
      permissions: [...permissions],
      department: user.department?.name ?? null,
      tenant: {
        id: tenant!.id,
        slug: tenant!.slug,
        displayName: tenant!.displayName,
        whiteLabel: tenant!.whiteLabel,
        branding: branding
          ? {
              logoUrl: branding.logoUrl,
              primaryColor: branding.primaryColor,
              secondaryColor: branding.secondaryColor,
              accentColor: branding.accentColor,
              loginHeadline: branding.loginHeadline,
              footerText: branding.footerText,
            }
          : null,
      },
    };
  }
}
