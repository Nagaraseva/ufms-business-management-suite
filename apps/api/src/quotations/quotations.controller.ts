import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Patch, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsEnum, IsInt, IsISO8601, IsNumber, IsOptional,
  IsString, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import {
  calculateBreakup, computeQuotationTotals,
  type BreakupSettings, type BreakupOptions, type WageColumnInput, type FeeSpec, type FeeMode,
} from '@ufms/shared/payroll/wage-engine';

class LineItemDto {
  @IsString() @MinLength(1) @MaxLength(500) description: string;
  @IsOptional() @IsString() unit?: string;
  @IsNumber() @Min(0) quantity: number;
  @IsNumber() @Min(0) rate: number;
}

class WageColumnDto {
  @IsString() name: string;
  @IsInt() @Min(1) headcount: number;
  @IsNumber() basic: number;
  @IsNumber() vda: number;
  @IsNumber() hra: number;
  @IsNumber() special: number;
  @IsNumber() washing: number;
  @IsNumber() conveyance: number;
  @IsNumber() other: number;
  @IsNumber() extra4: number;
  @IsNumber() uniform: number;
  @IsNumber() uniformEmployee: number;
  @IsNumber() compliance: number;
  @IsNumber() lwfYear: number;
  @IsNumber() lwfDedYear: number;
  @IsNumber() groupInsurance: number;
  @IsOptional() @IsNumber() xa1?: number;
  @IsOptional() @IsNumber() xa2?: number;
  @IsOptional() @IsNumber() xa3?: number;
}

class BreakupSettingsDto {
  @IsOptional() @IsBoolean() applyBonus?: boolean;
  @IsOptional() @IsBoolean() applyLeaveWages?: boolean;
  @IsOptional() @IsBoolean() applyEsi?: boolean;
  @IsOptional() @IsBoolean() applyInsurance?: boolean;
  @IsOptional() @IsBoolean() applyPf?: boolean;
  @IsOptional() @IsBoolean() applyPt?: boolean;
  @IsOptional() @IsBoolean() applyGratuity?: boolean;
  @IsOptional() @IsBoolean() ptOnGross?: boolean;
  @IsNumber() ptAmount: number;
  @IsNumber() ptThreshold: number;
  @IsNumber() esiCap: number;
  @IsNumber() pfCap: number;
}

class CreateQuotationDto {
  @IsString() @MinLength(1) customerName: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() billingAddress?: string;
  @IsOptional() @IsString() serviceType?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() surveyId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsISO8601() issueDate: string;
  @IsOptional() @IsISO8601() validUntil?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => LineItemDto)
  items: LineItemDto[];

  @IsEnum(['NONE', 'PERCENTAGE', 'LUMPSUM', 'BASIC_VDA_PCT', 'ST2_PCT', 'CTC_PCT'] as const)
  managementFeeMode: FeeMode;
  @IsNumber() @Min(0) managementFeeValue: number;
  @IsNumber() @Min(0) taxPercent: number;

  /** Optional wage breakup — when present the totals are derived from it. */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WageColumnDto)
  wageColumns?: WageColumnDto[];

  @IsOptional() @ValidateNested() @Type(() => BreakupSettingsDto)
  breakupSettings?: BreakupSettingsDto;

  @IsOptional() breakupOptions?: Partial<BreakupOptions>;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() terms?: string;
}

const DEFAULT_SETTINGS: BreakupSettings = {
  applyBonus: true, applyLeaveWages: true, applyEsi: true, applyInsurance: false,
  applyPf: true, applyPt: true, applyGratuity: false, ptOnGross: false,
  ptAmount: 200, ptThreshold: 15000, esiCap: 21000, pfCap: 15000,
};

@ApiTags('quotations')
@Controller('api/v1/quotations')
export class QuotationsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Pure calculation preview — no database writes, no permission beyond read. */
  @Post('calculate')
  @HttpCode(200)
  @RequirePermission(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Preview quotation totals and wage breakup without saving' })
  calculate(@Body() dto: CreateQuotationDto) {
    const items = (dto.items ?? []).map((i) => ({ ...i, amount: round2(i.quantity * i.rate) }));
    const settings: BreakupSettings = { ...DEFAULT_SETTINGS, ...(dto.breakupSettings ?? {}) };

    let wage = null as any;
    let basis: { basicVda: number; st2: number; ctc: number } | undefined;

    if (dto.wageColumns?.length) {
      wage = calculateBreakup({
        cols: dto.wageColumns as WageColumnInput[],
        settings,
        options: dto.breakupOptions ?? {},
      });
      basis = {
        basicVda: wage.cols.reduce((s, c) => s + (c.basic + c.vda) * c.headcount, 0),
        st2: wage.cols.reduce((s, c) => s + c.st2 * c.headcount, 0),
        ctc: wage.totals.billing,
      };
    }

    const lineAmounts = items.length ? items.map((i) => i.amount) : (basis ? [basis.ctc] : [0]);
    const totals = computeQuotationTotals({
      lineItemAmounts: lineAmounts,
      feeMode: dto.managementFeeMode,
      feeValue: dto.managementFeeValue,
      taxPercent: dto.taxPercent,
      breakupBasis: basis,
    });

    return { items, wage, totals };
  }

  @Get()
  @RequirePermission(PERMISSIONS.QUOTATION_READ)
  list(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.quotation.findMany({
        where: { deletedAt: null, ...(status ? { status: status as any } : {}) },
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
        include: { _count: { select: { items: true } } },
      }),
    );
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.QUOTATION_READ)
  async detail(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const q = await tx.quotation.findFirst({
        where: { id },
        include: { items: { orderBy: { sortOrder: 'asc' } }, versions: { orderBy: { revision: 'desc' } } },
      });
      if (!q) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Quotation not found.' });
      return q;
    });
  }

  @Post()
  @RequirePermission(PERMISSIONS.QUOTATION_WRITE)
  @ApiOperation({ summary: 'Create a quotation with items, wage breakup and computed totals' })
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateQuotationDto) {
    if (!dto.items?.length && !dto.wageColumns?.length) {
      throw new BadRequestException({ code: 'VALIDATION', message: 'Add at least one line item or a wage breakup.' });
    }

    const settings: BreakupSettings = { ...DEFAULT_SETTINGS, ...(dto.breakupSettings ?? {}) };
    const items = (dto.items ?? []).map((i, idx) => ({
      sortOrder: idx,
      description: i.description,
      unit: i.unit ?? null,
      quantity: i.quantity,
      rate: i.rate,
      amount: round2(i.quantity * i.rate),
    }));

    let wage: any = null;
    let basis: { basicVda: number; st2: number; ctc: number } | undefined;
    if (dto.wageColumns?.length) {
      wage = calculateBreakup({ cols: dto.wageColumns as WageColumnInput[], settings, options: dto.breakupOptions ?? {} });
      basis = {
        basicVda: wage.cols.reduce((s: number, c: any) => s + (c.basic + c.vda) * c.headcount, 0),
        st2: wage.cols.reduce((s: number, c: any) => s + c.st2 * c.headcount, 0),
        ctc: wage.totals.billing,
      };
    }

    const lineAmounts = items.length ? items.map((i) => i.amount) : [basis!.ctc];
    const totals = computeQuotationTotals({
      lineItemAmounts: lineAmounts,
      feeMode: dto.managementFeeMode,
      feeValue: dto.managementFeeValue,
      taxPercent: dto.taxPercent,
      breakupBasis: basis,
    });

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      // Per-tenant quotation number, allocated inside the transaction so two
      // concurrent saves cannot collide (legacy defect D7).
      const year = new Date(dto.issueDate).getFullYear();
      const prefix = `QUO-${year}-`;
      const last = await tx.quotation.findFirst({
        where: { quotationNo: { startsWith: prefix } },
        orderBy: { quotationNo: 'desc' },
        select: { quotationNo: true },
      });
      let next = 1;
      if (last?.quotationNo) {
        const n = parseInt(last.quotationNo.slice(prefix.length), 10);
        if (Number.isFinite(n)) next = n + 1;
      }
      const quotationNo = `${prefix}${String(next).padStart(4, '0')}`;

      const created = await tx.quotation.create({
        data: {
          tenantId: u.tenantId,
          companyId: dto.companyId ?? null,
          quotationNo,
          revision: 1,
          leadId: dto.leadId ?? null,
          surveyId: dto.surveyId ?? null,
          status: 'DRAFT',
          issueDate: new Date(dto.issueDate),
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          customerName: dto.customerName,
          companyName: dto.companyName ?? null,
          billingAddress: dto.billingAddress ?? null,
          serviceType: dto.serviceType ?? null,
          subtotal: totals.subtotal,
          managementFeeMode: dto.managementFeeMode as any,
          managementFeeValue: dto.managementFeeValue,
          managementFeeAmount: totals.managementFee,
          amountBeforeTax: totals.amountBeforeTax,
          taxPercent: dto.taxPercent,
          taxAmount: totals.taxAmount,
          grandTotal: totals.grandTotal,
          wageBreakupJson: wage ? ({ input: { cols: dto.wageColumns, settings, options: dto.breakupOptions }, computed: wage } as any) : undefined,
          notes: dto.notes ?? null,
          terms: dto.terms ?? null,
          createdById: u.id,
          items: { create: items.map((i) => ({ ...i, tenantId: u.tenantId })) },
        },
        include: { items: true },
      });

      await tx.quotationVersion.create({
        data: {
          tenantId: u.tenantId,
          quotationId: created.id,
          revision: 1,
          snapshot: { quotation: serialize(created), totals } as any,
          changedById: u.id,
          changeSummary: 'Initial version',
        },
      });

      return created;
    });
  }

  @Patch(':id/status')
  @RequirePermission(PERMISSIONS.QUOTATION_WRITE)
  @ApiOperation({ summary: 'Advance quotation status (approval requires quotation:approve)' })
  async setStatus(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string, @Body() body: { status: string }) {
    const allowed = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'WON', 'LOST', 'EXPIRED'];
    if (!allowed.includes(body.status)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: `Status must be one of ${allowed.join(', ')}.` });
    }
    // Approving needs a separate permission — the legacy system had no
    // separation between preparing and approving a quotation.
    if (body.status === 'APPROVED' && !u.permissions.includes(PERMISSIONS.QUOTATION_APPROVE) && !u.roles.includes('tenant_owner')) {
      throw new BadRequestException({ code: 'APPROVAL_REQUIRED', message: 'You are not permitted to approve quotations.' });
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const q = await tx.quotation.findFirst({ where: { id } });
      if (!q) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Quotation not found.' });

      // Finalised quotations are locked; changes must go through a new revision.
      if (['APPROVED', 'WON'].includes(q.status) && body.status !== 'WON') {
        throw new BadRequestException({ code: 'LOCKED', message: 'This quotation is approved and locked. Create a revision to change it.' });
      }

      return tx.quotation.update({
        where: { id },
        data: {
          status: body.status as any,
          ...(body.status === 'APPROVED' ? { approvedById: u.id, approvedAt: new Date() } : {}),
        },
      });
    });
  }
}

function round2(v: number) { return Math.round(v * 100) / 100; }

function serialize(row: any) {
  return JSON.parse(JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}
