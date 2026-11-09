import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param,
  ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString,
  MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import {
  findEffectiveDateOverlap, setInForceOn, resolveWageFloor,
  checkMinimumWageFloor, LEGACY_STATUTORY_DEFAULTS,
} from '@ufms/shared/hr/employee-rules';

const STATUSES = ['PROVISIONAL', 'CONFIRMED', 'CONTESTED'] as const;
const CATEGORIES = ['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED'] as const;

class RateLineDto {
  @IsString() @MaxLength(60) code: string;
  @IsString() @MaxLength(120) label: string;
  @IsNumber() value: number;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

class SlabDto {
  @IsNumber() @Min(0) fromGross: number;
  @IsNumber() toGross: number;
  @IsNumber() @Min(0) amount: number;
  @IsOptional() @IsNumber() overrideMonth?: number;
  @IsOptional() @IsNumber() overrideAmount?: number;
}

class CreateRateSetDto {
  @IsString() @MaxLength(60) code: string;
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(60) jurisdiction?: string;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsString() @MaxLength(500) sourceReference?: string;
  @IsOptional() @IsString() @MaxLength(500) sourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) reviewNotes?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RateLineDto)
  rates?: RateLineDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SlabDto)
  slabs?: SlabDto[];
}

class CreateWageRateDto {
  @IsString() @MaxLength(40) regime: string;
  @IsString() @MaxLength(60) zone: string;
  @IsOptional() @IsString() @MaxLength(80) sector?: string;
  @IsEnum(CATEGORIES as unknown as object) category: (typeof CATEGORIES)[number];
  @IsNumber() @Min(0) monthlyWage: number;
  @IsOptional() @IsNumber() @Min(0) dailyWage?: number;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsString() @MaxLength(500) sourceReference?: string;
  @IsOptional() @IsString() @MaxLength(500) sourceUrl?: string;
}

const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

/**
 * Statutory configuration.
 *
 * Rule 15: PF/ESI/PT ceilings and minimum-wage rates are DATA, effective-dated,
 * and carry a source reference. Nothing statutory is compiled into the payroll
 * engine — it resolves a rate set for the pay period and reads the values out.
 *
 * Every set starts PROVISIONAL. Only a reviewer can CONFIRM it, and a confirmed
 * set must name the notification it came from. The running system therefore
 * cannot silently treat an unverified number as authoritative.
 */
@ApiTags('statutory')
@Controller('api/v1/statutory')
export class StatutoryController {
  constructor(private readonly prisma: PrismaService) {}

  /** Values the payroll engine will use if no set exists — shown, not hidden. */
  @Get('legacy-defaults')
  @RequirePermission(PERMISSIONS.STATUTORY_READ)
  @ApiOperation({ summary: 'Built-in fallback values inherited from v5.6.61' })
  legacyDefaults() {
    return {
      ...LEGACY_STATUTORY_DEFAULTS,
      warning:
        'These are the constants hardcoded in the legacy HR module. They are used only when no ' +
        'CONFIRMED, effective-dated rate set covers the pay period. Review them against the current ' +
        'EPFO / ESIC / state notifications before running production payroll.',
    };
  }

  /* ------------------------------ rate sets ------------------------------ */

  @Get('rate-sets')
  @RequirePermission(PERMISSIONS.STATUTORY_READ)
  async listRateSets(@CurrentUser() u: AuthUser, @Query('jurisdiction') jurisdiction?: string) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.statutoryRateSet.findMany({
        where: { ...(jurisdiction ? { jurisdiction } : {}) },
        orderBy: [{ jurisdiction: 'asc' }, { effectiveFrom: 'desc' }],
        include: { _count: { select: { rates: true, slabs: true } } },
      }),
    );
  }

  @Get('rate-sets/in-force')
  @RequirePermission(PERMISSIONS.STATUTORY_READ)
  @ApiOperation({ summary: 'The rate set governing a jurisdiction on a date' })
  async inForce(
    @CurrentUser() u: AuthUser,
    @Query('jurisdiction') jurisdiction = 'CENTRAL',
    @Query('asOn') asOn?: string,
  ) {
    const date = asOn || todayIso();
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const sets = await tx.statutoryRateSet.findMany({
        where: { jurisdiction },
        include: { rates: true, slabs: true },
        orderBy: { effectiveFrom: 'desc' },
      });
      const inForceSet = setInForceOn(
        sets.map((s) => ({ id: s.id, effectiveFrom: s.effectiveFrom, effectiveTo: s.effectiveTo })),
        date,
      );
      if (!inForceSet) {
        return {
          asOn: date, jurisdiction, rateSet: null,
          warning: 'No rate set covers this date. Payroll would fall back to the legacy defaults.',
        };
      }
      const full = sets.find((s) => s.id === inForceSet.id)!;
      return { asOn: date, jurisdiction, rateSet: full };
    });
  }

  @Get('rate-sets/:id')
  @RequirePermission(PERMISSIONS.STATUTORY_READ)
  async getRateSet(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const set = await tx.statutoryRateSet.findFirst({
        where: { id },
        include: { rates: { orderBy: { code: 'asc' } }, slabs: { orderBy: { fromGross: 'asc' } } },
      });
      if (!set) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Rate set not found.' });
      return set;
    });
  }

  @Post('rate-sets')
  @RequirePermission(PERMISSIONS.STATUTORY_WRITE)
  @ApiOperation({ summary: 'Create a PROVISIONAL rate set; overlapping periods are refused' })
  async createRateSet(@CurrentUser() u: AuthUser, @Body() dto: CreateRateSetDto) {
    const from = new Date(dto.effectiveFrom);
    const to = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (to && to < from) {
      throw new BadRequestException({ code: 'INVALID_PERIOD', message: 'Effective-to cannot precede effective-from.' });
    }
    const jurisdiction = dto.jurisdiction ?? 'CENTRAL';

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const siblings = await tx.statutoryRateSet.findMany({
        where: { jurisdiction },
        select: { id: true, code: true, effectiveFrom: true, effectiveTo: true },
      });
      const clash = findEffectiveDateOverlap({ effectiveFrom: from, effectiveTo: to }, siblings);
      if (clash) {
        throw new BadRequestException({
          code: 'EFFECTIVE_DATE_OVERLAP',
          message: `Rate set ${clash.code ?? ''} already covers part of this period. ` +
            'Two sets in force on the same day would make the statutory values ambiguous.',
        });
      }

      for (const r of dto.rates ?? []) {
        if (!r.code || !/^[A-Z0-9_]+$/.test(r.code)) {
          throw new BadRequestException({
            code: 'INVALID_RATE_CODE', message: `Rate code "${r.code}" must be UPPER_SNAKE_CASE.`,
          });
        }
      }

      return tx.statutoryRateSet.create({
        data: {
          tenantId: u.tenantId,
          code: dto.code.trim(),
          name: dto.name.trim(),
          jurisdiction,
          status: 'PROVISIONAL',
          effectiveFrom: from,
          effectiveTo: to,
          sourceReference: dto.sourceReference ?? null,
          sourceUrl: dto.sourceUrl ?? null,
          reviewNotes: dto.reviewNotes ?? null,
          createdById: u.id,
          rates: dto.rates?.length
            ? {
                create: dto.rates.map((r) => ({
                  tenantId: u.tenantId,
                  code: r.code,
                  label: r.label,
                  value: r.value,
                  unit: r.unit ?? 'PERCENT',
                  notes: r.notes ?? null,
                })),
              }
            : undefined,
          slabs: dto.slabs?.length
            ? {
                create: dto.slabs.map((s) => ({
                  tenantId: u.tenantId,
                  fromGross: s.fromGross,
                  toGross: s.toGross,
                  amount: s.amount,
                  overrideMonth: s.overrideMonth ?? null,
                  overrideAmount: s.overrideAmount ?? null,
                })),
              }
            : undefined,
        },
        include: { rates: true, slabs: true },
      });
    });
  }

  @Patch('rate-sets/:id')
  @RequirePermission(PERMISSIONS.STATUTORY_WRITE)
  async updateRateSet(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: Partial<CreateRateSetDto>,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.statutoryRateSet.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Rate set not found.' });
      if (existing.status === 'CONFIRMED') {
        throw new BadRequestException({
          code: 'LOCKED',
          message: 'A confirmed rate set cannot be edited. Supersede it with a new set instead.',
        });
      }
      const data: any = {};
      for (const k of ['name', 'sourceReference', 'sourceUrl', 'reviewNotes'] as const) {
        if ((dto as any)[k] !== undefined) data[k] = (dto as any)[k];
      }
      if (dto.effectiveFrom !== undefined) data.effectiveFrom = new Date(dto.effectiveFrom);
      if (dto.effectiveTo !== undefined) data.effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
      return tx.statutoryRateSet.update({ where: { id }, data });
    });
  }

  /**
   * Confirm a rate set. Refuses without a source reference — a confirmed set is
   * what payroll treats as authoritative, so it must say where it came from.
   */
  @Post('rate-sets/:id/confirm')
  @RequirePermission(PERMISSIONS.STATUTORY_WRITE)
  @ApiOperation({ summary: 'Mark a rate set reviewed and authoritative' })
  async confirm(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() body: { sourceReference?: string; reviewNotes?: string },
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const set = await tx.statutoryRateSet.findFirst({ where: { id }, include: { rates: true } });
      if (!set) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Rate set not found.' });
      if (set.status === 'CONFIRMED') {
        throw new BadRequestException({ code: 'ALREADY_CONFIRMED', message: 'This rate set is already confirmed.' });
      }
      const source = String(body?.sourceReference ?? set.sourceReference ?? '').trim();
      if (!source) {
        throw new BadRequestException({
          code: 'SOURCE_REQUIRED',
          message: 'A confirmed rate set must name the notification or circular it is based on.',
        });
      }
      if (!set.rates.length && !['CENTRAL'].includes(set.jurisdiction)) {
        throw new BadRequestException({
          code: 'NO_RATES',
          message: 'Add at least one rate before confirming this set.',
        });
      }

      return tx.statutoryRateSet.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          sourceReference: source,
          reviewNotes: body?.reviewNotes ?? set.reviewNotes,
          reviewedAt: new Date(),
          reviewedById: u.id,
        },
        include: { rates: true, slabs: true },
      });
    });
  }

  @Post('rate-sets/:id/contest')
  @RequirePermission(PERMISSIONS.STATUTORY_WRITE)
  async contest(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() body: { reason: string },
  ) {
    const reason = String(body?.reason ?? '').trim();
    if (reason.length < 10) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED', message: 'Explain why this rate set is disputed (at least 10 characters).',
      });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const set = await tx.statutoryRateSet.findFirst({ where: { id } });
      if (!set) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Rate set not found.' });
      return tx.statutoryRateSet.update({
        where: { id },
        data: { status: 'CONTESTED', reviewNotes: reason },
      });
    });
  }

  @Post('rate-sets/:id/rates')
  @RequirePermission(PERMISSIONS.STATUTORY_WRITE)
  async upsertRate(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: RateLineDto,
  ) {
    if (!/^[A-Z0-9_]+$/.test(dto.code ?? '')) {
      throw new BadRequestException({
        code: 'INVALID_RATE_CODE', message: 'Rate code must be UPPER_SNAKE_CASE.',
      });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const set = await tx.statutoryRateSet.findFirst({ where: { id } });
      if (!set) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Rate set not found.' });
      if (set.status === 'CONFIRMED') {
        throw new BadRequestException({
          code: 'LOCKED', message: 'A confirmed rate set cannot be edited.',
        });
      }
      return tx.statutoryRate.upsert({
        where: { rateSetId_code: { rateSetId: id, code: dto.code } },
        update: { label: dto.label, value: dto.value, unit: dto.unit ?? 'PERCENT', notes: dto.notes ?? null },
        create: {
          tenantId: u.tenantId, rateSetId: id, code: dto.code, label: dto.label,
          value: dto.value, unit: dto.unit ?? 'PERCENT', notes: dto.notes ?? null,
        },
      });
    });
  }

  /* --------------------------- minimum wages --------------------------- */

  @Get('minimum-wages')
  @RequirePermission(PERMISSIONS.STATUTORY_READ)
  async listWages(
    @CurrentUser() u: AuthUser,
    @Query('regime') regime?: string,
    @Query('zone') zone?: string,
  ) {
    const where: any = {};
    if (regime) where.regime = regime;
    if (zone) where.zone = zone;
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.minimumWageRate.findMany({
        where,
        orderBy: [{ regime: 'asc' }, { zone: 'asc' }, { category: 'asc' }, { effectiveFrom: 'desc' }],
        take: 1000,
      }),
    );
  }

  @Post('minimum-wages')
  @RequirePermission(PERMISSIONS.STATUTORY_WRITE)
  @ApiOperation({ summary: 'Add an effective-dated minimum wage (starts PROVISIONAL)' })
  async createWage(@CurrentUser() u: AuthUser, @Body() dto: CreateWageRateDto) {
    const from = new Date(dto.effectiveFrom);
    const to = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (to && to < from) {
      throw new BadRequestException({ code: 'INVALID_PERIOD', message: 'Effective-to cannot precede effective-from.' });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      return tx.minimumWageRate.create({
        data: {
          tenantId: u.tenantId,
          regime: dto.regime.trim().toUpperCase(),
          zone: dto.zone.trim(),
          sector: dto.sector ?? null,
          category: dto.category as any,
          monthlyWage: dto.monthlyWage,
          dailyWage: dto.dailyWage ?? null,
          status: 'PROVISIONAL',
          effectiveFrom: from,
          effectiveTo: to,
          sourceReference: dto.sourceReference ?? null,
          sourceUrl: dto.sourceUrl ?? null,
        },
      });
    });
  }

  @Post('minimum-wages/:id/confirm')
  @RequirePermission(PERMISSIONS.STATUTORY_WRITE)
  async confirmWage(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() body: { sourceReference?: string },
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const rate = await tx.minimumWageRate.findFirst({ where: { id } });
      if (!rate) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Wage rate not found.' });
      const source = String(body?.sourceReference ?? rate.sourceReference ?? '').trim();
      if (!source) {
        throw new BadRequestException({
          code: 'SOURCE_REQUIRED', message: 'A confirmed rate must name its source notification.',
        });
      }
      return tx.minimumWageRate.update({
        where: { id },
        data: { status: 'CONFIRMED', sourceReference: source },
      });
    });
  }

  @Get('minimum-wages/resolve')
  @RequirePermission(PERMISSIONS.STATUTORY_READ)
  @ApiOperation({ summary: 'The minimum wage in force for a regime/zone/category on a date' })
  async resolve(
    @CurrentUser() u: AuthUser,
    @Query('regime') regime: string,
    @Query('zone') zone: string,
    @Query('category') category: string,
    @Query('asOn') asOn?: string,
  ) {
    const date = asOn || todayIso();
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const rates = await tx.minimumWageRate.findMany({ where: { regime } });
      const hit = resolveWageFloor(
        rates.map((r) => ({
          regime: r.regime, zone: r.zone, sector: r.sector, category: r.category,
          monthlyWage: Number(r.monthlyWage), status: r.status,
          effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
        })),
        { regime, zone, category, asOn: date },
      );
      if (!hit) {
        return {
          asOn: date, regime, zone, category, rate: null,
          warning: 'No minimum wage covers this combination. Payroll approval will block rather than guess.',
        };
      }
      return { asOn: date, regime, zone, category, rate: hit };
    });
  }

  /**
   * Wage-floor check for a set of employees. Payroll calls this before a run
   * can be approved; a shortfall is a blocking finding, not a warning.
   */
  @Get('minimum-wages/floor-check')
  @RequirePermission([PERMISSIONS.STATUTORY_READ, PERMISSIONS.EMPLOYEE_READ])
  @ApiOperation({ summary: 'Compare employee Basic+DA against the applicable wage floor' })
  async floorCheck(
    @CurrentUser() u: AuthUser,
    @Query('regime') regime: string,
    @Query('zone') zone: string,
    @Query('category') category?: string,
    @Query('asOn') asOn?: string,
  ) {
    const date = asOn || todayIso();
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const rates = await tx.minimumWageRate.findMany({ where: { regime } });
      const employees = await tx.employee.findMany({
        where: { deletedAt: null, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
        select: { id: true, name: true, basic: true, da: true, employeeCode: true },
      });
      const allocations = await tx.employeeAllocation.findMany({
        where: { status: 'ACTIVE' },
        select: { employeeId: true, category: true },
      });
      const categoryByEmployee = new Map(allocations.map((a) => [a.employeeId, a.category]));

      const result = checkMinimumWageFloor(
        employees.map((e) => ({
          id: e.id,
          name: e.name,
          basic: Number(e.basic),
          da: Number(e.da),
          category: String(categoryByEmployee.get(e.id) ?? category ?? 'UNSKILLED'),
        })),
        (cat) => {
          const hit = resolveWageFloor(
            rates.map((r) => ({
              regime: r.regime, zone: r.zone, sector: r.sector, category: r.category,
              monthlyWage: Number(r.monthlyWage), status: r.status,
              effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
            })),
            { regime, zone, category: cat, asOn: date },
          );
          return hit ? Number(hit.monthlyWage) : null;
        },
      );

      return {
        asOn: date, regime, zone,
        compliant: result.compliant,
        breaches: result.checks.filter((c) => !c.compliant),
        checked: result.checks.length,
        missingRates: result.missingRates,
      };
    });
  }
}
