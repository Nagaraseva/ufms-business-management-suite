import {
  BadRequestException, Body, Controller, Get, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional,
  IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const COMPLAINT_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED', 'REOPENED'] as const;
const OPEN_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'REOPENED'];

class CreateSlaDto {
  @IsString() @MinLength(1) clientId: string;
  @IsOptional() @IsString() contractId?: string;
  @IsOptional() @IsString() @MaxLength(60) agreementNo?: string;
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsOptional() @IsInt() @Min(1) @Max(720) responseHours?: number;
  @IsOptional() @IsInt() @Min(1) @Max(2160) resolutionHours?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) uptimeTarget?: number;
  @IsOptional() @IsString() penaltyClause?: string;
  @IsDateString() startDate: string;
  @IsOptional() @IsDateString() endDate?: string;
}

class CreateComplaintDto {
  @IsString() @MinLength(1) clientId: string;
  @IsOptional() @IsString() slaId?: string;
  @IsString() @MinLength(1) @MaxLength(300) subject: string;
  @IsString() @MinLength(1) @MaxLength(5000) description: string;
  @IsOptional() @IsEnum(PRIORITIES as unknown as object) priority?: (typeof PRIORITIES)[number];
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() assignedToId?: string;
}

/**
 * SLA agreements and client-care tickets.
 *
 * The SLA clock is derived, not stored by hand: `dueAt` is set from the
 * agreement's resolution target at creation, `firstResponseAt` is stamped on
 * the first status move off OPEN, and `breached` is recomputed whenever a
 * ticket is read or written so a stale flag can never be shown.
 */
@ApiTags('client-care')
@Controller('api/v1')
export class ClientCareController {
  constructor(private readonly prisma: PrismaService) {}

  private async nextTicketNo(tx: any): Promise<string> {
    const rows = await tx.complaint.findMany({ select: { ticketNo: true } });
    const year = new Date().getFullYear();
    let max = 0;
    const re = new RegExp(`^TKT-${year}-(\\d+)$`, 'i');
    for (const r of rows) {
      const m = re.exec(String(r.ticketNo ?? '').trim());
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `TKT-${year}-${String(max + 1).padStart(4, '0')}`;
  }

  private async nextAgreementNo(tx: any): Promise<string> {
    const rows = await tx.slaAgreement.findMany({ select: { agreementNo: true } });
    let max = 0;
    for (const r of rows) {
      const m = /^SLA-(\d+)$/i.exec(String(r.agreementNo ?? '').trim());
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `SLA-${String(max + 1).padStart(4, '0')}`;
  }

  /* ------------------------------- SLA ------------------------------- */

  @Get('sla')
  @RequirePermission(PERMISSIONS.SLA_READ)
  async listSla(@CurrentUser() u: AuthUser, @Query('clientId') clientId?: string) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.slaAgreement.findMany({
        where: { ...(clientId ? { clientId } : {}) },
        orderBy: { startDate: 'desc' },
      }),
    );
  }

  @Post('sla')
  @RequirePermission(PERMISSIONS.SLA_WRITE)
  async createSla(@CurrentUser() u: AuthUser, @Body() dto: CreateSlaDto) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const client = await tx.client.findFirst({ where: { id: dto.clientId, deletedAt: null } });
      if (!client) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Client not found.' });

      const agreementNo = String(dto.agreementNo ?? '').trim() || (await this.nextAgreementNo(tx));
      const clash = await tx.slaAgreement.findFirst({ where: { agreementNo } });
      if (clash) {
        throw new BadRequestException({
          code: 'DUPLICATE_AGREEMENT_NO', message: 'This SLA agreement number already exists.',
        });
      }

      return tx.slaAgreement.create({
        data: {
          tenantId: u.tenantId,
          clientId: dto.clientId,
          contractId: dto.contractId ?? null,
          agreementNo,
          title: dto.title.trim(),
          responseHours: dto.responseHours ?? 24,
          resolutionHours: dto.resolutionHours ?? 72,
          uptimeTarget: dto.uptimeTarget ?? null,
          penaltyClause: dto.penaltyClause ?? null,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          status: 'ACTIVE',
        },
      });
    });
  }

  /* ----------------------------- complaints ----------------------------- */

  @Get('complaints')
  @RequirePermission(PERMISSIONS.COMPLAINT_READ)
  @ApiOperation({ summary: 'List client-care tickets with a live SLA breach flag' })
  async listComplaints(
    @CurrentUser() u: AuthUser,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('openOnly') openOnly?: string,
  ) {
    const where: any = {};
    if (status) where.status = status;
    else if (openOnly === 'true') where.status = { in: OPEN_STATUSES };
    if (clientId) where.clientId = clientId;

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const rows = await tx.complaint.findMany({
        where,
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
        take: 200,
      });
      const now = Date.now();
      return rows.map((c) => {
        const resolved = ['RESOLVED', 'CLOSED'].includes(c.status);
        const breached = resolved
          ? c.breached
          : !!c.dueAt && new Date(c.dueAt).getTime() < now;
        return {
          ...c,
          breached,
          overdueHours: c.dueAt && !resolved
            ? Math.max(0, Math.round((now - new Date(c.dueAt).getTime()) / 3_600_000))
            : 0,
        };
      });
    });
  }

  @Get('complaints/:id')
  @RequirePermission(PERMISSIONS.COMPLAINT_READ)
  async complaintDetail(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const c = await tx.complaint.findFirst({ where: { id }, include: { sla: true } });
      if (!c) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ticket not found.' });
      return c;
    });
  }

  @Post('complaints')
  @RequirePermission(PERMISSIONS.COMPLAINT_WRITE)
  async createComplaint(@CurrentUser() u: AuthUser, @Body() dto: CreateComplaintDto) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const client = await tx.client.findFirst({ where: { id: dto.clientId, deletedAt: null } });
      if (!client) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Client not found.' });

      // Auto-attach the client's active SLA when the caller did not choose one.
      let slaId = dto.slaId ?? null;
      if (!slaId) {
        const sla = await tx.slaAgreement.findFirst({
          where: { clientId: dto.clientId, status: 'ACTIVE' },
          orderBy: { startDate: 'desc' },
        });
        slaId = sla?.id ?? null;
      }
      const sla = slaId ? await tx.slaAgreement.findUnique({ where: { id: slaId } }) : null;
      const dueAt = sla
        ? new Date(Date.now() + sla.resolutionHours * 3_600_000)
        : null;

      return tx.complaint.create({
        data: {
          tenantId: u.tenantId,
          clientId: dto.clientId,
          slaId,
          ticketNo: await this.nextTicketNo(tx),
          subject: dto.subject.trim(),
          description: dto.description.trim(),
          priority: (dto.priority ?? 'MEDIUM') as any,
          status: dto.assignedToId ? 'ASSIGNED' : 'OPEN',
          category: dto.category ?? null,
          dueAt,
          assignedToId: dto.assignedToId ?? null,
          createdById: u.id,
        },
      });
    });
  }

  @Patch('complaints/:id')
  @RequirePermission(PERMISSIONS.COMPLAINT_WRITE)
  async updateComplaint(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: Partial<CreateComplaintDto> & { status?: string; resolution?: string; assignedToId?: string },
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.complaint.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ticket not found.' });

      const data: any = {};
      if (dto.subject !== undefined) data.subject = dto.subject;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.category !== undefined) data.category = dto.category;
      if (dto.priority !== undefined) {
        if (!PRIORITIES.includes(dto.priority as any)) {
          throw new BadRequestException({
            code: 'INVALID_PRIORITY', message: `Priority must be one of ${PRIORITIES.join(', ')}.`,
          });
        }
        data.priority = dto.priority;
      }
      if (dto.assignedToId !== undefined) {
        data.assignedToId = dto.assignedToId || null;
        if (dto.status === undefined && existing.status === 'OPEN' && dto.assignedToId) {
          data.status = 'ASSIGNED';
        }
      }

      if (dto.status !== undefined) {
        const status = String(dto.status).toUpperCase();
        if (!COMPLAINT_STATUSES.includes(status as any)) {
          throw new BadRequestException({
            code: 'INVALID_STATUS', message: `Status must be one of ${COMPLAINT_STATUSES.join(', ')}.`,
          });
        }
        data.status = status;

        // First move off OPEN starts the response clock.
        if (existing.status === 'OPEN' && status !== 'OPEN' && !existing.firstResponseAt) {
          data.firstResponseAt = new Date();
        }
        if (['RESOLVED', 'CLOSED'].includes(status)) {
          data.resolvedAt = new Date();
          const isLate = !!existing.dueAt && Date.now() > new Date(existing.dueAt).getTime();
          data.breached = existing.breached || isLate;
          if (status === 'RESOLVED' && dto.resolution) data.resolution = dto.resolution;
        }
        if (status === 'REOPENED') {
          data.resolvedAt = null;
        }
      } else if (dto.resolution !== undefined) {
        data.resolution = dto.resolution;
      }

      return tx.complaint.update({ where: { id }, data });
    });
  }

  /** Customer feedback — stored only, never published. */
  @Post('complaints/:id/feedback')
  @RequirePermission(PERMISSIONS.COMPLAINT_WRITE)
  async feedback(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() body: { rating: number; notes?: string },
  ) {
    const rating = Number(body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException({
        code: 'INVALID_RATING', message: 'Rating must be a whole number from 1 to 5.',
      });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.complaint.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ticket not found.' });
      if (!['RESOLVED', 'CLOSED'].includes(existing.status)) {
        throw new BadRequestException({
          code: 'NOT_RESOLVED', message: 'Feedback can only be recorded on a resolved or closed ticket.',
        });
      }
      return tx.complaint.update({
        where: { id },
        data: { feedbackRating: rating, feedbackNotes: body?.notes ?? null },
      });
    });
  }

  /** SLA dashboard: breach rate and average resolution time, computed live. */
  @Get('client-care/summary')
  @RequirePermission([PERMISSIONS.SLA_READ, PERMISSIONS.COMPLAINT_READ])
  async summary(@CurrentUser() u: AuthUser) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const rows = await tx.complaint.findMany({
        select: {
          status: true, priority: true, dueAt: true, createdAt: true,
          resolvedAt: true, breached: true, feedbackRating: true,
        },
      });
      const now = Date.now();
      const open = rows.filter((r) => OPEN_STATUSES.includes(r.status));
      const resolved = rows.filter((r) => ['RESOLVED', 'CLOSED'].includes(r.status));
      const breached = rows.filter(
        (r) => !['RESOLVED', 'CLOSED'].includes(r.status) && r.dueAt && new Date(r.dueAt).getTime() < now,
      ).length + resolved.filter((r) => r.breached).length;

      const avgResolutionHours = resolved.length
        ? Math.round(
            resolved.reduce(
              (sum, r) => sum + (new Date(r.resolvedAt!).getTime() - new Date(r.createdAt).getTime()) / 3_600_000,
              0,
            ) / resolved.length,
          )
        : 0;

      const rated = rows.filter((r) => typeof r.feedbackRating === 'number');
      const avgRating = rated.length
        ? Math.round((rated.reduce((s, r) => s + (r.feedbackRating as number), 0) / rated.length) * 100) / 100
        : null;

      return {
        total: rows.length,
        open: open.length,
        breached,
        breachRatePct: rows.length ? Math.round((breached / rows.length) * 10000) / 100 : 0,
        avgResolutionHours,
        avgRating,
        byPriority: PRIORITIES.reduce<Record<string, number>>((acc, p) => {
          acc[p] = open.filter((r) => r.priority === p).length;
          return acc;
        }, {}),
      };
    });
  }
}
