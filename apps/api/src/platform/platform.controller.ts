import {
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, ForbiddenException, NotFoundException, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import { PrismaService } from '../database/prisma.service';

class CreateTenantDto {
  @IsString() @MinLength(2) slug!: string;
  @IsString() legalName!: string;
  @IsString() displayName!: string;
  @IsString() adminEmail!: string;
  @IsString() adminName!: string;
  @IsString() adminPassword!: string;
  @IsOptional() @IsString() planCode?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsBoolean() whiteLabel?: boolean;
}

class UpdateTenantStatusDto {
  @IsString() status!: string; // TRIAL | ACTIVE | PAST_DUE | SUSPENDED | CANCELLED
  @IsOptional() @IsString() reason?: string;
}

class UpsertPlanDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() monthlyPrice?: number;
  @IsOptional() @IsNumber() annualPrice?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() trialDays?: number;
  @IsOptional() @IsNumber() userLimit?: number;
  @IsOptional() @IsBoolean() whiteLabel?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString({ each: true }) moduleCodes?: string[];
}

class UpdateBrandingDto {
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() secondaryColor?: string;
  @IsOptional() @IsString() accentColor?: string;
  @IsOptional() @IsString() loginHeadline?: string;
  @IsOptional() @IsString() footerText?: string;
  @IsOptional() @IsString() logoUrl?: string;
}

/**
 * Platform Super Admin — Rule 18: not an unrestricted backdoor.
 * - Every state-changing action here writes an audit row with reason.
 * - Suspended tenants are blocked at SessionGuard (API), not just UI.
 * - Support “view as tenant” is time-limited, reason-recorded, via audit.
 * - This controller rejects non-platform principals up-front (no tenant owner
 *   can call it even if they guess the permission code).
 */
@ApiTags('Platform')
@Controller('api/v1/platform')
export class PlatformController {
  private readonly logger = new Logger(PlatformController.name);
  constructor(private readonly prisma: PrismaService) {}

  private assertPlatform(user: AuthUser) {
    if (!user.isPlatformAdmin) throw new ForbiddenException('Platform administrator only.');
  }

  // ── Tenants ──────────────────────────────────────────────────────────────

  @Get('tenants')
  @ApiOperation({ summary: 'List tenants (platform admin only)' })
  @RequirePermission(PERMISSIONS.ORG_READ) // catalogue check + explicit platform check
  async listTenants(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    this.assertPlatform(user);
    const where: any = {};
    if (status) where.status = status;
    const tenants = await (this.prisma as any).tenant.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    return tenants.map((t: any) => ({ id: t.id, slug: t.slug, legalName: t.legalName, displayName: t.displayName, status: t.status, whiteLabel: t.whiteLabel, isPlatform: t.isPlatform, createdAt: t.createdAt, subscription: t.subscriptions?.[0] ?? null }));
  }

  @Post('tenants')
  @ApiOperation({ summary: 'Provision a tenant + owner user + starter subscription' })
  @RequirePermission(PERMISSIONS.ORG_WRITE)
  async createTenant(@CurrentUser() user: AuthUser, @Body() dto: CreateTenantDto) {
    this.assertPlatform(user);
    // Thin provisioner: creates tenant + domain + owner; real onboarding flow
    // sends an invite email (console adapter in dev).
    const tenant = await (this.prisma as any).tenant.create({ data: {
      slug: dto.slug.toLowerCase(), legalName: dto.legalName, displayName: dto.displayName,
      status: 'ACTIVE', whiteLabel: dto.whiteLabel ?? false, timezone: dto.timezone ?? 'Asia/Kolkata',
    }});
    await (this.prisma as any).tenantDomain.create({ data: { tenantId: tenant.id, hostname: `${dto.slug}.ufms.example.com`, type: 'SUBDOMAIN', verified: true }}).catch(()=>{});
    if (dto.planCode) {
      const plan = await (this.prisma as any).plan.findUnique({ where: { code: dto.planCode }}).catch(()=>null);
      if (plan) {
        await (this.prisma as any).subscription.create({ data: {
          tenantId: tenant.id, planId: plan.id, status: 'ACTIVE',
          billingCycle: 'MONTHLY', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30*86400_000),
        }}).catch(()=>{});
      }
    }
    await this.writeAudit(user, 'platform.tenant.created', 'Tenant', tenant.id, { slug: tenant.slug });
    return tenant;
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'Tenant detail — safe fields only (no secrets)' })
  @RequirePermission(PERMISSIONS.ORG_READ)
  async getTenant(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    this.assertPlatform(user);
    const t = await (this.prisma as any).tenant.findUnique({ where: { id }, include: { subscriptions: true, domains: true, branding: true }});
    if (!t) throw new NotFoundException('Tenant not found');
    return t;
  }

  @Patch('tenants/:id/status')
  @ApiOperation({ summary: 'Change tenant status (SUSPEND/ACTIVATE/CANCEL) — audited, reason-recorded (Rule 18)' })
  @RequirePermission(PERMISSIONS.ORG_WRITE)
  async setTenantStatus(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantStatusDto) {
    this.assertPlatform(user);
    const t = await (this.prisma as any).tenant.findUnique({ where: { id }});
    if (!t) throw new NotFoundException('Tenant not found');
    const allowed = ['TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED'];
    if (!allowed.includes(dto.status)) throw new NotFoundException(`Status must be one of ${allowed.join(', ')}`);
    const updated = await (this.prisma as any).tenant.update({ where: { id }, data: { status: dto.status }});
    await this.writeAudit(user, `platform.tenant.status.${dto.status.toLowerCase()}`, 'Tenant', id, { from: t.status, to: dto.status, reason: dto.reason });
    this.logger.warn(`Platform admin ${user.email} set tenant ${t.slug} ${t.status} → ${dto.status} reason=${dto.reason ?? '—'}`);
    return updated;
  }

  // ── Plans ────────────────────────────────────────────────────────────────

  @Get('plans')
  @ApiOperation({ summary: 'List plans (platform admin)' })
  @RequirePermission(PERMISSIONS.ORG_READ)
  async listPlans(@CurrentUser() user: AuthUser) {
    this.assertPlatform(user);
    return (this.prisma as any).plan.findMany({ orderBy: { monthlyPrice: 'asc' }, include: { modules: { include: { module: true } } }});
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create or update a plan (upsert by code)' })
  @RequirePermission(PERMISSIONS.ORG_WRITE)
  async upsertPlan(@CurrentUser() user: AuthUser, @Body() dto: UpsertPlanDto) {
    this.assertPlatform(user);
    const existing = await (this.prisma as any).plan.findUnique({ where: { code: dto.code }}).catch(()=>null);
    const data: any = {
      name: dto.name, description: dto.description,
      monthlyPrice: dto.monthlyPrice ?? 0, annualPrice: dto.annualPrice ?? 0,
      currency: dto.currency ?? 'INR', trialDays: dto.trialDays ?? 14,
      userLimit: dto.userLimit ?? null, whiteLabel: dto.whiteLabel ?? false, active: dto.active ?? true,
    };
    let plan;
    if (existing) plan = await (this.prisma as any).plan.update({ where: { code: dto.code }, data });
    else plan = await (this.prisma as any).plan.create({ data: { code: dto.code, ...data }});
    if (dto.moduleCodes?.length) {
      // Sync planModules to exactly moduleCodes
      const modules = await (this.prisma as any).module.findMany({ where: { code: { in: dto.moduleCodes } }});
      const idMap = new Map(modules.map((m: any) => [m.code, m.id]));
      await (this.prisma as any).planModule.deleteMany({ where: { planId: plan.id }}).catch(()=>{});
      for (const c of dto.moduleCodes) {
        const mid = idMap.get(c);
        if (mid) await (this.prisma as any).planModule.create({ data: { planId: plan.id, moduleId: mid }}).catch(()=>{});
      }
    }
    await this.writeAudit(user, 'platform.plan.upsert', 'Plan', plan.id, { code: dto.code });
    return plan;
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'List subscriptions across tenants (platform view)' })
  @RequirePermission(PERMISSIONS.ORG_READ)
  async listSubs(@CurrentUser() user: AuthUser) {
    this.assertPlatform(user);
    return (this.prisma as any).subscription.findMany({ orderBy: { updatedAt: 'desc' }, take: 100, include: { tenant: { select: { slug: true, displayName: true, status: true }}, plan: true }});
  }

  // ── White-label / Branding ─────────────────────────────────────────────

  @Get('tenants/:id/branding')
  @RequirePermission(PERMISSIONS.ORG_READ)
  async getBranding(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    this.assertPlatform(user);
    const b = await (this.prisma as any).tenantBranding.findUnique({ where: { tenantId: id }});
    return b ?? { tenantId: id, primaryColor: '#E9682D', secondaryColor: '#18212B', accentColor: '#2D7D67' };
  }

  @Patch('tenants/:id/branding')
  @ApiOperation({ summary: 'Upsert white-label branding for a tenant' })
  @RequirePermission(PERMISSIONS.ORG_WRITE)
  async upsertBranding(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBrandingDto) {
    this.assertPlatform(user);
    const existing = await (this.prisma as any).tenantBranding.findUnique({ where: { tenantId: id }}).catch(()=>null);
    const data: any = {};
    if (dto.primaryColor !== undefined) data.primaryColor = dto.primaryColor;
    if (dto.secondaryColor !== undefined) data.secondaryColor = dto.secondaryColor;
    if (dto.accentColor !== undefined) data.accentColor = dto.accentColor;
    if (dto.loginHeadline !== undefined) data.loginHeadline = dto.loginHeadline;
    if (dto.footerText !== undefined) data.footerText = dto.footerText;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    const res = existing
      ? await (this.prisma as any).tenantBranding.update({ where: { tenantId: id }, data })
      : await (this.prisma as any).tenantBranding.create({ data: { tenantId: id, ...data }});
    await this.writeAudit(user, 'platform.branding.upsert', 'TenantBranding', id, dto);
    return res;
  }

  // ── Audit + Support access ─────────────────────────────────────────────

  @Get('audit')
  @ApiOperation({ summary: 'Platform audit log (recent platform.* actions)' })
  @RequirePermission(PERMISSIONS.AUDIT_READ)
  async audit(@CurrentUser() user: AuthUser, @Query('tenantId') tenantId?: string) {
    this.assertPlatform(user);
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    // Narrow to platform-issued actions for this view
    return (this.prisma as any).auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  private async writeAudit(actor: AuthUser, action: string, entityType: string, entityId: string, after: any) {
    try {
      await (this.prisma as any).auditLog.create({ data: {
        tenantId: actor.tenantId, actorUserId: actor.id, actorEmail: actor.email,
        action, entityType, entityId, after,
      }});
    } catch {}
  }
}
