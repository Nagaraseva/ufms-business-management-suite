import {
  BadRequestException, Body, Controller, Get, HttpCode, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional,
  IsString, MaxLength, Min, MinLength,
} from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import {
  validateTender, nextTenderNo, isDuplicateTenderNo, isValidFollowupStatus,
  deriveResultReason, shouldCreateOrder, CLOSED_STATUSES, TENDER_STATUSES,
  tenderMetrics,
} from '@ufms/shared/tenders/tender-rules';

class CreateTenderDto {
  @IsOptional() @IsString() companyId?: string;
  /** Blank => auto-generated TND-YYYY-NNNN. Otherwise the portal's own number. */
  @IsOptional() @IsString() @MaxLength(100) tenderNo?: string;
  @IsString() @MinLength(1) @MaxLength(300) tenderTitle: string;
  @IsString() @MinLength(1) @MaxLength(100) portal: string;
  @IsOptional() @IsString() @MaxLength(1000) portalUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) organization?: string;
  @IsString() @MinLength(1) @MaxLength(100) sector: string;
  @IsOptional() @IsString() @MaxLength(500) location?: string;

  @IsOptional() @IsNumber() @Min(0) tenderFee?: number;
  @IsOptional() @IsNumber() @Min(0) emdAmount?: number;
  @IsOptional() @IsNumber() @Min(0) bgAmount?: number;
  @IsOptional() @IsNumber() @Min(0) amcAmount?: number;
  @IsOptional() @IsNumber() @Min(0) tenderValue?: number;

  @IsOptional() @IsNumber() @Min(0) securityDepositPercent?: number;
  @IsOptional() @IsEnum(['PBG', 'TD', 'FDR'] as const) securityDepositForm?: 'PBG' | 'TD' | 'FDR';

  @IsOptional() @IsString() manpowerCount?: string;
  @IsOptional() @IsInt() @Min(0) tenureMonths?: number;

  @IsOptional() @IsDateString() postedDate?: string;
  @IsOptional() @IsDateString() preBidDate?: string;
  @IsDateString() submissionDate: string;
  @IsOptional() @IsDateString() openingDate?: string;

  @IsOptional() @IsString() scope?: string;
  @IsOptional() @IsString() eligibility?: string;
  @IsOptional() @IsString() documentsRequired?: string;
  @IsOptional() @IsString() documentsPending?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsDateString() nextFollowupAt?: string;
}

class FollowupDto {
  @IsString() @MinLength(1) status: string;
  @IsString() @MinLength(1) @MaxLength(5000) notes: string;
  @IsOptional() @IsString() documentsPending?: string;
  @IsOptional() @IsDateString() nextFollowupAt?: string;
  @IsOptional() @IsNumber() @Min(0) amountQuoted?: number;
  @IsOptional() @IsString() resultReason?: string;
}

/** The one ordering convention, applied at the query level. */
const ORDER = [{ submissionDate: 'asc' as const }, { updatedAt: 'desc' as const }];

@ApiTags('tenders')
@Controller('api/v1/tenders')
export class TendersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Row-level narrowing for a tender-desk user who may see only their own. */
  private ownOnly(u: AuthUser): boolean {
    return !u.permissions.includes(PERMISSIONS.TENDER_READ)
      && u.permissions.includes(PERMISSIONS.TENDER_READ_OWN)
      && !u.roles.includes('tenant_owner');
  }

  private async resolveCompanyId(u: AuthUser, companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const company = await this.prisma.withTenant(u.tenantId, (tx) =>
      tx.company.findFirst({ where: { deletedAt: null, active: true }, orderBy: { code: 'asc' } }),
    );
    if (!company) {
      throw new BadRequestException({
        code: 'NO_COMPANY',
        message: 'Create a company in Organisation before adding tenders.',
      });
    }
    return company.id;
  }

  @Get()
  @RequirePermission([PERMISSIONS.TENDER_READ, PERMISSIONS.TENDER_READ_OWN])
  @ApiOperation({ summary: 'List tenders (drafts excluded, submission-date ordering)' })
  async list(
    @CurrentUser() u: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('companyId') companyId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    const take = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * take;

    const where: any = {
      deletedAt: null,
      // A wizard draft is staging only: never in lists, reports or search.
      status: { not: 'DRAFT' },
    };
    if (status) where.status = status;
    if (companyId) where.companyId = companyId;
    if (this.ownOnly(u)) where.assignedToId = u.id;
    if (q) {
      where.OR = [
        { tenderNo: { contains: q, mode: 'insensitive' } },
        { tenderTitle: { contains: q, mode: 'insensitive' } },
        { organization: { contains: q, mode: 'insensitive' } },
        { portal: { contains: q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.tender.findMany({ where, orderBy: ORDER, skip, take }),
        tx.tender.count({ where }),
      ]);
      return { items, total, page: Number(page), pageSize: take };
    });
  }

  @Get('metrics')
  @RequirePermission([PERMISSIONS.TENDER_READ, PERMISSIONS.TENDER_READ_OWN])
  @ApiOperation({ summary: 'Dashboard counters (legacy tenderDashboardMetricsServer_)' })
  async metrics(@CurrentUser() u: AuthUser, @Query('today') today?: string) {
    const day = today || new Date().toISOString().slice(0, 10);
    const tenders = await this.prisma.withTenant(u.tenantId, (tx) =>
      tx.tender.findMany({
        where: { deletedAt: null, status: { not: 'DRAFT' }, ...(this.ownOnly(u) ? { assignedToId: u.id } : {}) },
        select: {
          status: true, submissionDate: true, createdAt: true,
          tenderValue: true, documentsPending: true, updatedAt: true,
        },
      }),
    );

    // Money columns are Decimal -> serialise to numbers for the pure function.
    const rows = tenders.map((t) => ({
      status: t.status,
      submissionDate: t.submissionDate,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      tenderValue: Number(t.tenderValue),
      documentsPending: t.documentsPending,
    }));

    return tenderMetrics(rows, day);
  }

  @Get(':id')
  @RequirePermission([PERMISSIONS.TENDER_READ, PERMISSIONS.TENDER_READ_OWN])
  async detail(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const t = await tx.tender.findFirst({
        where: { id },
        include: {
          followups: { orderBy: { createdAt: 'desc' } },
          order: true,
        },
      });
      if (!t) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Tender not found.' });
      if (this.ownOnly(u) && t.assignedToId !== u.id) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Tender not found.' });
      }
      return t;
    });
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENDER_WRITE)
  @ApiOperation({ summary: 'Create a tender. Tender number is independent of any Lead.' })
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateTenderDto) {
    const issues = validateTender(dto as any);
    if (issues.length) {
      throw new BadRequestException({
        code: 'VALIDATION',
        message: issues.map((i) => i.message).join(' '),
        details: issues,
      });
    }

    const companyId = await this.resolveCompanyId(u, dto.companyId);
    const submissionDate = new Date(dto.submissionDate);
    const year = submissionDate.getUTCFullYear();

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.tender.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, tenderNo: true },
      });

      // Preserve an operator's portal number verbatim; otherwise allocate TND-YYYY-NNNN.
      const manual = String(dto.tenderNo ?? '').trim();
      const tenderNo = manual || nextTenderNo(existing.map((e) => e.tenderNo), year);

      if (isDuplicateTenderNo(tenderNo, existing)) {
        throw new BadRequestException({
          code: 'DUPLICATE_TENDER_NO',
          message: 'This tender number already exists for the selected company.',
        });
      }

      const assignedToId = u.roles.includes('tender_desk') && !dto.assignedToId ? u.id : (dto.assignedToId ?? null);

      const created = await tx.tender.create({
        data: {
          tenantId: u.tenantId,
          companyId,
          tenderNo,
          tenderNoIsManual: !!manual,
          tenderTitle: dto.tenderTitle.trim(),
          portal: dto.portal.trim(),
          portalUrl: dto.portalUrl?.trim() || null,
          organization: dto.organization?.trim() || null,
          sector: dto.sector.trim(),
          location: dto.location?.trim() || null,
          tenderFee: dto.tenderFee ?? 0,
          emdAmount: dto.emdAmount ?? 0,
          bgAmount: dto.bgAmount ?? 0,
          amcAmount: dto.amcAmount ?? 0,
          tenderValue: dto.tenderValue ?? 0,
          securityDepositPercent: dto.securityDepositPercent ?? 0,
          securityDepositForm: dto.securityDepositForm ?? null,
          manpowerCount: dto.manpowerCount ?? null,
          tenureMonths: dto.tenureMonths ?? 0,
          postedDate: dto.postedDate ? new Date(dto.postedDate) : null,
          preBidDate: dto.preBidDate ? new Date(dto.preBidDate) : null,
          submissionDate,
          openingDate: dto.openingDate ? new Date(dto.openingDate) : null,
          status: 'NEW',
          scope: dto.scope ?? null,
          eligibility: dto.eligibility ?? null,
          documentsRequired: dto.documentsRequired ?? null,
          documentsPending: dto.documentsPending ?? null,
          notes: dto.notes ?? null,
          assignedToId,
          nextFollowupAt: dto.nextFollowupAt ? new Date(dto.nextFollowupAt) : null,
          createdById: u.id,
        },
      });

      // Legacy behaviour: creating a tender also opens its first follow-up entry.
      await tx.tenderFollowup.create({
        data: {
          tenantId: u.tenantId,
          tenderId: created.id,
          status: 'NEW',
          notes: 'Tender added to CRM',
          documentsPending: created.documentsPending,
          nextFollowupAt: created.nextFollowupAt,
          amountQuoted: 0,
          resultReason: '',
          createdById: u.id,
        },
      });

      return created;
    });
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENDER_WRITE)
  async update(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: Partial<CreateTenderDto>,
  ) {
    if (dto.tenderTitle !== undefined || dto.portal !== undefined || dto.sector !== undefined) {
      const issues = validateTender(dto as any);
      // Only surface issues for fields actually supplied by the caller.
      const relevant = issues.filter((i) => (dto as any)[i.field] !== undefined);
      if (relevant.length) {
        throw new BadRequestException({
          code: 'VALIDATION',
          message: relevant.map((i) => i.message).join(' '),
          details: relevant,
        });
      }
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.tender.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Tender not found.' });
      if (this.ownOnly(u) && existing.assignedToId !== u.id) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Tender not found.' });
      }

      // A submitted/won/lost tender is final for its descriptive fields.
      if (CLOSED_STATUSES.includes(existing.status as any)) {
        const bad = new BadRequestException({
          code: 'LOCKED',
          message: 'This tender is closed. Reopen it with a follow-up before editing.',
        });
        if (dto.tenderNo !== undefined && dto.tenderNo !== existing.tenderNo) throw bad;
      }

      const data: any = {};
      const map: Array<[keyof CreateTenderDto, string]> = [
        ['tenderTitle', 'tenderTitle'], ['portal', 'portal'], ['portalUrl', 'portalUrl'],
        ['organization', 'organization'], ['sector', 'sector'], ['location', 'location'],
        ['manpowerCount', 'manpowerCount'], ['scope', 'scope'], ['eligibility', 'eligibility'],
        ['documentsRequired', 'documentsRequired'], ['documentsPending', 'documentsPending'],
        ['notes', 'notes'], ['assignedToId', 'assignedToId'],
      ];
      for (const [from] of map) {
        if ((dto as any)[from] !== undefined) data[from] = (dto as any)[from];
      }
      for (const k of ['tenderFee', 'emdAmount', 'bgAmount', 'amcAmount', 'tenderValue',
        'securityDepositPercent', 'tenureMonths'] as const) {
        if (dto[k] !== undefined) data[k] = dto[k];
      }
      if (dto.securityDepositForm !== undefined) data.securityDepositForm = dto.securityDepositForm;

      for (const k of ['postedDate', 'preBidDate', 'submissionDate', 'openingDate', 'nextFollowupAt'] as const) {
        if ((dto as any)[k] !== undefined) {
          data[k] = (dto as any)[k] ? new Date((dto as any)[k]) : null;
        }
      }

      // Preserve the legacy immutability rule for an operator-entered number.
      if (dto.tenderNo !== undefined && dto.tenderNo !== existing.tenderNo) {
        const manual = String(dto.tenderNo ?? '').trim();
        const siblings = await tx.tender.findMany({
          where: { companyId: existing.companyId, deletedAt: null },
          select: { id: true, tenderNo: true },
        });
        if (isDuplicateTenderNo(manual, siblings, id)) {
          throw new BadRequestException({
            code: 'DUPLICATE_TENDER_NO',
            message: 'This tender number already exists for the selected company.',
          });
        }
        data.tenderNo = manual;
        data.tenderNoIsManual = true;
      }

      return tx.tender.update({ where: { id }, data });
    });
  }

  @Post(':id/followups')
  @RequirePermission(PERMISSIONS.TENDER_WRITE)
  @ApiOperation({ summary: 'Record a follow-up; FINANCIALLY_WON auto-creates the order' })
  async followup(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: FollowupDto,
  ) {
    const status = String(dto.status ?? '').toUpperCase();
    if (!isValidFollowupStatus(status)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `A follow-up status must be one of ${TENDER_STATUSES.filter((s) => s !== 'NEW').join(', ')}.`,
      });
    }

    const resultReason = deriveResultReason(status, dto.notes, dto.resultReason);

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const tender = await tx.tender.findFirst({ where: { id, deletedAt: null } });
      if (!tender) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Tender not found.' });
      if (this.ownOnly(u) && tender.assignedToId !== u.id) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Tender not found.' });
      }

      const nextFollowupAt = dto.nextFollowupAt ? new Date(dto.nextFollowupAt) : null;

      const followup = await tx.tenderFollowup.create({
        data: {
          tenantId: u.tenantId,
          tenderId: id,
          status: status as any,
          notes: dto.notes.trim(),
          documentsPending: dto.documentsPending ?? null,
          nextFollowupAt,
          amountQuoted: dto.amountQuoted ?? 0,
          resultReason,
          createdById: u.id,
        },
      });

      const updated = await tx.tender.update({
        where: { id },
        data: {
          status: status as any,
          documentsPending: dto.documentsPending ?? tender.documentsPending,
          nextFollowupAt,
          resultReason,
        },
      });

      // Legacy: a tender that reaches FINANCIALLY_WON produces exactly one order.
      let orderId: string | null = null;
      if (shouldCreateOrder(status)) {
        const existingOrder = await tx.tenderOrder.findUnique({ where: { tenderId: id } });
        if (existingOrder) {
          orderId = existingOrder.id;
        } else {
          const order = await tx.tenderOrder.create({
            data: {
              tenantId: u.tenantId,
              companyId: tender.companyId,
              tenderId: id,
              beneficiary: tender.organization,
              contractValue: dto.amountQuoted ?? tender.tenderValue,
              tenureMonths: tender.tenureMonths,
              status: 'ACTIVE',
            },
          });
          orderId = order.id;
        }
      }

      return { tender: updated, followup, orderId };
    });
  }

  @Get(':id/followups')
  @RequirePermission([PERMISSIONS.TENDER_READ, PERMISSIONS.TENDER_READ_OWN])
  listFollowups(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.tenderFollowup.findMany({ where: { tenderId: id }, orderBy: { createdAt: 'desc' } }),
    );
  }
}
