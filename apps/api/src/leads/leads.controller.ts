import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Patch, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsEmail, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';

class CreateLeadDto {
  @IsString() @MinLength(1) @MaxLength(200) customerName: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() serviceType?: string;
  @IsOptional() @IsString() requirement?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() assignedToId?: string;
}

class FollowupDto {
  @IsString() @MinLength(1) @MaxLength(60) type: string;
  @IsOptional() @IsString() outcome?: string;
  @IsString() @MinLength(1) @MaxLength(4000) notes: string;
  @IsOptional() @IsISO8601() nextFollowupAt?: string;
  @IsOptional() @IsString() newStatus?: string;
}

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'SURVEY_SCHEDULED', 'QUOTED', 'WON', 'LOST'] as const;

/**
 * Leads and follow-ups.
 * Row-level rule: a user holding only `lead:read:own` sees only leads assigned
 * to them (legacy EXECUTIVE behaviour). Everyone else sees the tenant's leads.
 */
@ApiTags('leads')
@Controller('api/v1/leads')
export class LeadsController {
  constructor(private readonly prisma: PrismaService) {}

  private ownOnly(u: AuthUser): boolean {
    return !u.permissions.includes(PERMISSIONS.LEAD_READ) && u.permissions.includes(PERMISSIONS.LEAD_READ_OWN);
  }

  @Get()
  @RequirePermission([PERMISSIONS.LEAD_READ, PERMISSIONS.LEAD_READ_OWN])
  @ApiOperation({ summary: 'List / search leads with pagination' })
  async list(
    @CurrentUser() u: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    const take = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * take;

    const where: any = { deletedAt: null };
    if (status) where.status = status;
    if (this.ownOnly(u)) where.assignedToId = u.id;
    if (q) {
      where.OR = [
        { customerName: { contains: q, mode: 'insensitive' } },
        { companyName: { contains: q, mode: 'insensitive' } },
        { leadNo: { contains: q, mode: 'insensitive' } },
        { mobile: { contains: q } },
      ];
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        tx.lead.count({ where }),
      ]);
      return { items, total, page: Number(page), pageSize: take };
    });
  }

  @Get(':id')
  @RequirePermission([PERMISSIONS.LEAD_READ, PERMISSIONS.LEAD_READ_OWN])
  async detail(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id } });
      if (!lead) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Lead not found.' });
      if (this.ownOnly(u) && lead.assignedToId !== u.id) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'Lead not found.' });
      }
      return lead;
    });
  }

  @Post()
  @RequirePermission(PERMISSIONS.LEAD_WRITE)
  @ApiOperation({ summary: 'Create a lead; assigns a per-tenant sequential lead number' })
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateLeadDto) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      // Per-tenant sequence inside the transaction — no row-count arithmetic,
      // which is the legacy duplicate-number defect (D7).
      const last = await tx.lead.findFirst({
        where: { leadNo: { startsWith: 'LEAD-' } },
        orderBy: { leadNo: 'desc' },
        select: { leadNo: true },
      });
      let next = 1;
      if (last?.leadNo) {
        const n = parseInt(last.leadNo.replace('LEAD-', ''), 10);
        if (Number.isFinite(n)) next = n + 1;
      }
      const leadNo = `LEAD-${String(next).padStart(5, '0')}`;

      return tx.lead.create({
        data: {
          tenantId: u.tenantId,
          leadNo,
          customerName: dto.customerName,
          companyName: dto.companyName,
          mobile: dto.mobile,
          email: dto.email?.toLowerCase(),
          source: dto.source,
          serviceType: dto.serviceType,
          requirement: dto.requirement,
          companyId: dto.companyId || null,
          assignedToId: dto.assignedToId || (this.ownOnly(u) ? u.id : null),
          createdById: u.id,
        },
      });
    });
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.LEAD_WRITE)
  async update(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string, @Body() dto: Partial<CreateLeadDto> & { status?: string }) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.lead.findFirst({ where: { id } });
      if (!existing) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Lead not found.' });
      if (this.ownOnly(u) && existing.assignedToId !== u.id) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'Lead not found.' });
      }
      const data: any = { ...dto };
      delete data.status;
      if (dto.status) {
        if (!LEAD_STATUSES.includes(dto.status as any)) {
          throw new BadRequestException({ code: 'INVALID_STATUS', message: `Status must be one of ${LEAD_STATUSES.join(', ')}.` });
        }
        data.status = dto.status;
      }
      return tx.lead.update({ where: { id }, data });
    });
  }

  @Get(':id/followups')
  @RequirePermission([PERMISSIONS.LEAD_READ, PERMISSIONS.LEAD_READ_OWN])
  listFollowups(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.$queryRawUnsafe(
        `SELECT * FROM lead_followups WHERE "tenantId" = $1::uuid AND "leadId" = $2::uuid ORDER BY "createdAt" DESC`,
        u.tenantId, id,
      ),
    );
  }

  @Post(':id/followups')
  @RequirePermission(PERMISSIONS.LEAD_WRITE)
  @ApiOperation({ summary: 'Record a follow-up and optionally advance the lead status' })
  async addFollowup(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string, @Body() dto: FollowupDto) {
    if (dto.newStatus && !LEAD_STATUSES.includes(dto.newStatus as any)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: `Status must be one of ${LEAD_STATUSES.join(', ')}.` });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id } });
      if (!lead) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Lead not found.' });

      const fu = await tx.$queryRawUnsafe(
        `INSERT INTO lead_followups ("id","tenantId","leadId","createdById","type","outcome","notes","nextFollowupAt","newStatus","createdAt")
         VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::timestamptz,$8,now())
         RETURNING *`,
        u.tenantId, id, u.id, dto.type, dto.outcome ?? null, dto.notes,
        dto.nextFollowupAt ?? null, dto.newStatus ?? null,
      );

      await tx.lead.update({
        where: { id },
        data: {
          ...(dto.nextFollowupAt ? { nextFollowupAt: new Date(dto.nextFollowupAt) } : {}),
          ...(dto.newStatus ? { status: dto.newStatus as any } : {}),
        },
      });

      return Array.isArray(fu) ? fu[0] : fu;
    });
  }
}
