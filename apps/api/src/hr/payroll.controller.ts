import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString,
  IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { decryptField } from '../common/field-crypto';
import { PERMISSIONS } from '../permissions/catalogue';
import { resolveStatutory } from './statutory-config';
import {
  applyAdjustments, attendanceToDays, blockingCount, buildBankTransferCsv,
  buildPfEcrText, canApproveRun, canTransition, collectFindings, computeSlip,
  daysInMonthOf, isEditable, isPeriodComplete, isPeriodLocked, monthLabel,
  periodBounds, summarizePayrollRun,
} from '@ufms/shared/payroll/run-rules';
import { checkMinimumWageFloor, resolveWageFloor } from '@ufms/shared/hr/employee-rules';

const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

const money = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
const plain = (v: unknown) => (v == null ? 0 : Number(v));
const dayOnly = (d: Date) => d.toISOString().slice(0, 10);

class GenerateSlipsDto {
  @IsInt() @Min(1) @Max(12) month: number;
  @IsInt() @Min(2000) @Max(2100) year: number;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) employeeIds?: string[];
  @IsOptional() @IsString() @MaxLength(40) jurisdiction?: string;
  /** 'DRAFT' previews without publishing; 'GENERATED' publishes for a run. */
  @IsOptional() @IsEnum(['DRAFT', 'GENERATED'] as unknown as object) status?: 'DRAFT' | 'GENERATED';
  @IsOptional() @IsBoolean() includeInactive?: boolean;
}

class FinaliseDto {
  @IsInt() @Min(1) @Max(12) month: number;
  @IsInt() @Min(2000) @Max(2100) year: number;
}

class CreateRunDto {
  @IsInt() @Min(1) @Max(12) month: number;
  @IsInt() @Min(2000) @Max(2100) year: number;
  @IsOptional() @IsString() @MaxLength(40) jurisdiction?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class ApproveDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  /** Tenant-configured exception allowing the preparer to approve (Rule 16). */
  @IsOptional() @IsBoolean() enableSelfApprovalException?: boolean;
}

class CancelRunDto {
  @IsString() @MaxLength(500) reason: string;
}

class DisburseDto {
  @IsOptional() @IsString() @MaxLength(120) bankFileRef?: string;
  /** Mandatory catch-all: a bank reference or an explicit confirmation note. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class AdjustmentDto {
  // Validated as a UUID: an arbitrary string here previously reached Postgres
  // and surfaced as a 500 instead of a clear 400.
  @IsUUID() employeeId: string;
  @IsOptional() @IsUUID() originalRunId?: string;
  @IsEnum(['REVERSAL', 'ADDITION'] as unknown as object) type: 'REVERSAL' | 'ADDITION';
  @IsNumber() @Min(0.01) amount: number;
  @IsString() @MaxLength(500) reason: string;
}

/**
 * Payroll — runs, slips, approval, exports and controlled corrections.
 *
 * Legacy reference: HR.gs:787-1190. Three defects in that implementation are
 * corrected here and each is marked inline:
 *   D-P5-1  the preparer could approve their own run
 *   D-P5-2  slips could drift after the run that used them was approved
 *   D-P5-3  the bank CSV was not escaped (csv injection)
 *
 * Everything that decides money is delegated to @ufms/shared/payroll/run-rules,
 * which is parity-tested against the legacy code.
 */
@ApiTags('payroll')
@Controller('api/v1')
export class PayrollController {
  constructor(private readonly prisma: PrismaService) {}

  /* ===================================================================== *
   * SLIPS
   * ===================================================================== */

  @Get('payroll/slips')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Salary slips for a month' })
  async listSlips(
    @CurrentUser() u: AuthUser,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const m = Number(month);
    const y = Number(year);
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const slips = await tx.salarySlip.findMany({
        where: {
          ...(Number.isInteger(m) ? { month: m } : {}),
          ...(Number.isInteger(y) ? { year: y } : {}),
          ...(status ? { status: status as any } : {}),
          ...(employeeId ? { employeeId } : {}),
        },
        include: {
          employee: { select: { id: true, employeeCode: true, name: true, department: true, designation: true } },
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { slipNumber: 'asc' }],
        take: 2000,
      });
      return {
        count: slips.length,
        slips: slips.map((s) => ({ ...s, netPay: plain(s.netPay) })),
      };
    });
  }

  @Get('payroll/slips/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  async getSlip(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const slip = await tx.salarySlip.findFirst({
        where: { id },
        include: {
          employee: {
            select: {
              id: true, employeeCode: true, name: true, department: true,
              designation: true, dateOfJoining: true, pfNo: true,
              uanHint: true, esiNoHint: true, bankAccountHint: true,
            },
          },
        },
      });
      if (!slip) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Salary slip not found.' });
      return slip;
    });
  }

  /**
   * Compute slips for a month from attendance.
   *
   * A slip is only produced for an employee whose attendance has actually been
   * recorded: the legacy form let a number be typed in, which is how a payroll
   * register ends up unverifiable. Anyone with no attendance is reported back
   * rather than being paid a full month by default.
   */
  @Post('payroll/slips/generate')
  @RequirePermission(PERMISSIONS.PAYROLL_PREPARE)
  @ApiOperation({ summary: 'Compute salary slips for a month from recorded attendance' })
  async generateSlips(@CurrentUser() u: AuthUser, @Body() dto: GenerateSlipsDto) {
    const { month, year } = dto;
    const bounds = periodBounds(month, year);
    const asOn = bounds.end;
    const publishAs = dto.status ?? 'DRAFT';

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existingRun = await tx.payrollRun.findFirst({
        where: { month, year, status: { in: ['LOCKED', 'APPROVED', 'DISBURSED'] } },
        select: { id: true, runNumber: true, status: true },
      });
      if (existingRun) {
        throw new ConflictException({
          code: 'PERIOD_LOCKED',
          message: `${monthLabel(month, year)} is frozen by payroll run ${existingRun.runNumber} (${existingRun.status}). ` +
            'Use an adjustment to correct it.',
          payrollRun: existingRun,
        });
      }

      const statutory = await resolveStatutory(tx, { jurisdiction: dto.jurisdiction, asOn });

      const employees = await tx.employee.findMany({
        where: {
          deletedAt: null,
          ...(dto.includeInactive ? {} : { active: true }),
          ...(dto.employeeIds?.length ? { id: { in: dto.employeeIds } } : {}),
        },
        orderBy: { employeeCode: 'asc' },
      });

      const records = await tx.attendanceRecord.findMany({
        where: {
          date: { gte: new Date(`${bounds.start}T00:00:00Z`), lte: new Date(`${bounds.end}T00:00:00Z`) },
          employeeId: { in: employees.map((e) => e.id) },
        },
        select: { employeeId: true, status: true, otHours: true },
      });

      const attendanceByEmployee = new Map<string, Array<{ status: string; otHours: number }>>();
      for (const r of records) {
        const list = attendanceByEmployee.get(r.employeeId) ?? [];
        list.push({ status: r.status, otHours: Number(r.otHours) });
        attendanceByEmployee.set(r.employeeId, list);
      }

      const monthRuns = await tx.payrollRun.findMany({
        where: { month, year },
        select: { id: true },
      });
      const pendingAdjustments = await tx.payrollAdjustment.findMany({
        where: {
          status: 'PENDING',
          employeeId: { in: employees.map((e) => e.id) },
          OR: [
            { originalRunId: null },
            { originalRunId: { in: monthRuns.map((r) => r.id) } },
          ],
        },
        select: { id: true, employeeId: true, type: true, amount: true },
      });
      const adjustmentsByEmployee = new Map<string, typeof pendingAdjustments>();
      for (const a of pendingAdjustments) {
        const list = adjustmentsByEmployee.get(a.employeeId) ?? [];
        list.push(a);
        adjustmentsByEmployee.set(a.employeeId, list);
      }

      const generated: any[] = [];
      const skipped: Array<{ employeeId: string; employeeCode: string; name: string; reason: string }> = [];

      for (const emp of employees) {
        const rows = attendanceByEmployee.get(emp.id) ?? [];
        const days = attendanceToDays(rows, bounds.days);

        if (days.empty) {
          skipped.push({
            employeeId: emp.id, employeeCode: emp.employeeCode, name: emp.name,
            reason: 'No attendance recorded for this month.',
          });
          continue;
        }
        if (emp.status === 'LEFT' && emp.dateOfLeaving && dayOnly(emp.dateOfLeaving) < bounds.start) {
          skipped.push({
            employeeId: emp.id, employeeCode: emp.employeeCode, name: emp.name,
            reason: `Left on ${dayOnly(emp.dateOfLeaving)}, before this pay period.`,
          });
          continue;
        }

        const adjustments = adjustmentsByEmployee.get(emp.id) ?? [];
        const base = computeSlip({
          employee: {
            basic: plain(emp.basic), hra: plain(emp.hra), da: plain(emp.da),
            otherAllowances: plain(emp.otherAllowances),
            esiApplicable: emp.esiApplicable, pfApplicable: emp.pfApplicable,
            ptState: emp.ptState,
          },
          month, year, days,
          cfg: statutory.config, ptSlabs: statutory.ptSlabs,
        });

        const applied = applyAdjustments(
          base.netPay,
          adjustments.map((a) => ({ id: a.id, type: a.type, amount: plain(a.amount) })),
        );

        const data = {
          tenantId: u.tenantId,
          employeeId: emp.id,
          slipNumber: `SLIP-${year}${String(month).padStart(2, '0')}-${emp.employeeCode}`,
          month, year,
          daysInMonth: bounds.days,
          daysWorked: base.daysWorked,
          daysPresent: base.daysPresent,
          otDays: base.earnings.otDays,
          basic: base.earnings.basic,
          hra: base.earnings.hra,
          da: base.earnings.da,
          specialAllowance: base.earnings.specialAllowance,
          otAmount: base.earnings.otAmount,
          bonus: base.earnings.bonus,
          grossEarnings: base.earnings.grossEarnings,
          esiEmployee: base.deductions.esiEmployee,
          esiEmployer: base.deductions.esiEmployer,
          pfEmployee: base.deductions.pfEmployee,
          pfEmployer: base.deductions.pfEmployer,
          pt: base.deductions.pt,
          tds: base.deductions.tds,
          loanRecovery: base.deductions.loanRecovery,
          advanceRecovery: base.deductions.advanceRecovery,
          totalDeductions: base.deductions.totalDeductions,
          netPay: applied.netPay,
          status: publishAs as any,
          statutorySetId: statutory.rateSet?.id ?? null,
          statutorySetCode: statutory.rateSet?.code ?? null,
          calcSnapshot: {
            config: statutory.config,
            days,
            earnings: base.earnings,
            deductions: base.deductions,
            adjustments: adjustments.map((a) => ({ id: a.id, type: a.type, amount: plain(a.amount) })),
            adjustmentAmount: applied.adjustmentAmount,
            generatedAt: new Date().toISOString(),
          } as any,
          generatedById: u.id,
        };

        const existing = await tx.salarySlip.findFirst({
          where: { employeeId: emp.id, month, year },
          select: { id: true, status: true, payrollRunId: true },
        });
        if (existing?.payrollRunId) {
          skipped.push({
            employeeId: emp.id, employeeCode: emp.employeeCode, name: emp.name,
            reason: 'Already attached to a payroll run; it cannot be recomputed.',
          });
          continue;
        }

        const saved = existing
          ? await tx.salarySlip.update({ where: { id: existing.id }, data })
          : await tx.salarySlip.create({ data });

        generated.push({
          ...saved,
          netPay: plain(saved.netPay),
          grossEarnings: plain(saved.grossEarnings),
          adjustmentAmount: applied.adjustmentAmount,
        });
      }

      return {
        month, year,
        label: monthLabel(month, year),
        statutory: {
          source: statutory.source,
          rateSet: statutory.rateSet,
          problems: statutory.problems,
          config: statutory.config,
        },
        generated: generated.length,
        skipped: skipped.length,
        skippedDetail: skipped,
        slips: generated,
        /** Non-blocking at this stage; the run re-evaluates with a floor check. */
        warning: statutory.problems.length ? statutory.problems.join(' ') : undefined,
      };
    });
  }

  @Post('payroll/slips/finalise')
  @RequirePermission(PERMISSIONS.PAYROLL_PREPARE)
  @ApiOperation({ summary: 'Publish DRAFT slips so a run can consume them' })
  async finaliseSlips(@CurrentUser() u: AuthUser, @Body() dto: FinaliseDto) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { month: dto.month, year: dto.year, status: { in: ['LOCKED', 'APPROVED', 'DISBURSED'] } },
      });
      if (run) {
        throw new ConflictException({
          code: 'PERIOD_LOCKED',
          message: `${monthLabel(dto.month, dto.year)} is frozen by run ${run.runNumber}.`,
        });
      }
      const res = await tx.salarySlip.updateMany({
        where: { month: dto.month, year: dto.year, status: 'DRAFT', payrollRunId: null },
        data: { status: 'GENERATED' },
      });
      return { month: dto.month, year: dto.year, finalised: res.count };
    });
  }

  @Patch('payroll/slips/:id/cancel')
  @RequirePermission(PERMISSIONS.PAYROLL_PREPARE)
  @ApiOperation({ summary: 'Cancel a slip that has not been pulled into a run' })
  async cancelSlip(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: { reason: string },
  ) {
    if (!dto?.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A cancellation reason is required.' });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const slip = await tx.salarySlip.findFirst({ where: { id } });
      if (!slip) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Salary slip not found.' });
      if (slip.payrollRunId) {
        throw new ConflictException({
          code: 'SLIP_IN_RUN',
          message: 'This slip belongs to a payroll run. Cancel the run, or raise an adjustment instead.',
        });
      }
      return tx.salarySlip.update({
        where: { id },
        data: { status: 'CANCELLED', calcSnapshot: { ...(slip.calcSnapshot as any ?? {}), cancelReason: dto.reason } as any },
      });
    });
  }

  /* ===================================================================== *
   * RUNS
   * ===================================================================== */

  @Get('payroll/runs')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  async listRuns(
    @CurrentUser() u: AuthUser,
    @Query('status') status?: string,
    @Query('year') year?: string,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const runs = await tx.payrollRun.findMany({
        where: {
          ...(status ? { status: status as any } : {}),
          ...(year ? { year: Number(year) } : {}),
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 200,
      });
      return runs.map((r) => ({
        ...r,
        // Every money column comes back as a Decimal; convert the whole set so
        // the client never has to guess which fields are strings.
        totalGross: plain(r.totalGross),
        totalEsiEmployee: plain(r.totalEsiEmployee),
        totalEsiEmployer: plain(r.totalEsiEmployer),
        totalPfEmployee: plain(r.totalPfEmployee),
        totalPfEmployerEpf: plain(r.totalPfEmployerEpf),
        totalPfEmployerEps: plain(r.totalPfEmployerEps),
        totalPfEmployerEdlis: plain(r.totalPfEmployerEdlis),
        totalPt: plain(r.totalPt),
        totalTds: plain(r.totalTds),
        totalNet: plain(r.totalNet),
        totalDeductions: plain(r.totalDeductions),
        blockingFindings: Array.isArray(r.findings)
          ? (r.findings as any[]).filter((f) => f.severity === 'BLOCKING').length
          : 0,
      }));
    });
  }

  @Get('payroll/runs/:id')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  async getRun(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payroll run not found.' });
      return {
        ...run,
        label: monthLabel(run.month, run.year),
        items: run.items.map((i) => ({
          ...i,
          grossEarnings: plain(i.grossEarnings),
          netPay: plain(i.netPay),
          totalDeductions: plain(i.totalDeductions),
          adjustmentAmount: plain(i.adjustmentAmount),
        })),
        totals: {
          employees: run.totalEmployees,
          gross: plain(run.totalGross),
          esiEmployee: plain(run.totalEsiEmployee),
          esiEmployer: plain(run.totalEsiEmployer),
          pfEmployee: plain(run.totalPfEmployee),
          pfEmployerEPF: plain(run.totalPfEmployerEpf),
          pfEmployerEPS: plain(run.totalPfEmployerEps),
          pfEmployerEDLIS: plain(run.totalPfEmployerEdlis),
          pt: plain(run.totalPt),
          tds: plain(run.totalTds),
          deductions: plain(run.totalDeductions),
          net: plain(run.totalNet),
        },
        canApprove: canApproveRun({
          runStatus: run.status,
          preparedById: run.preparedById,
          approver: { id: u.id, permissions: u.permissions },
          blockingFindings: Array.isArray(run.findings)
            ? (run.findings as any[]).filter((f) => f.severity === 'BLOCKING').length
            : 0,
        }),
      };
    });
  }

  /**
   * Create a DRAFT run for a completed month.
   *
   * Legacy `createPayrollRun_` skipped straight to LOCKED, which is why nobody
   * could review a run before it was fixed. Here the run starts as DRAFT and
   * must be locked deliberately.
   */
  @Post('payroll/runs')
  @RequirePermission(PERMISSIONS.PAYROLL_PREPARE)
  @ApiOperation({ summary: 'Assemble a DRAFT payroll run from the month\'s GENERATED slips' })
  async createRun(@CurrentUser() u: AuthUser, @Body() dto: CreateRunDto) {
    const { month, year } = dto;
    const bounds = periodBounds(month, year);

    if (!isPeriodComplete(month, year, todayIso())) {
      throw new BadRequestException({
        code: 'PERIOD_INCOMPLETE',
        message: `${monthLabel(month, year)} has not finished yet (it runs to ${bounds.end}). ` +
          'Attendance for the remaining days does not exist, so payroll cannot be finalised.',
      });
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const live = await tx.payrollRun.findFirst({
        where: { month, year, status: { notIn: ['CANCELLED'] } },
        select: { id: true, runNumber: true, status: true },
      });
      if (live) {
        throw new ConflictException({
          code: 'RUN_EXISTS',
          message: `A payroll run for ${monthLabel(month, year)} already exists (${live.runNumber}, ${live.status}).`,
          payrollRun: live,
        });
      }

      const slips = await tx.salarySlip.findMany({
        where: { month, year, status: 'GENERATED', payrollRunId: null },
        include: { employee: true },
        orderBy: { slipNumber: 'asc' },
      });
      if (slips.length === 0) {
        throw new BadRequestException({
          code: 'NO_SLIPS',
          message: `There are no GENERATED salary slips for ${monthLabel(month, year)}. Generate and finalise them first.`,
        });
      }
      const drafts = await tx.salarySlip.count({ where: { month, year, status: 'DRAFT' } });
      if (drafts > 0) {
        throw new BadRequestException({
          code: 'UNFINALISED_SLIPS',
          message: `${drafts} slip(s) for ${monthLabel(month, year)} are still DRAFT. Finalise or cancel them so the run cannot silently omit people.`,
          draftSlips: drafts,
        });
      }

      const statutory = await resolveStatutory(tx, { jurisdiction: dto.jurisdiction, asOn: bounds.end });

      const items = slips.map((s, idx) => ({
        tenantId: u.tenantId,
        employeeId: s.employeeId,
        salarySlipId: s.id,
        employeeCode: s.employee.employeeCode,
        employeeName: s.employee.name,
        designation: s.employee.designation,
        department: s.employee.department,
        daysWorked: s.daysWorked,
        daysPresent: s.daysPresent,
        otDays: s.otDays,
        basic: s.basic,
        hra: s.hra,
        da: s.da,
        specialAllowance: s.specialAllowance,
        otAmount: s.otAmount,
        bonus: s.bonus,
        grossEarnings: s.grossEarnings,
        esiEmployee: s.esiEmployee,
        pfEmployee: s.pfEmployee,
        pt: s.pt,
        tds: s.tds,
        adjustmentAmount: 0,
        totalDeductions: s.totalDeductions,
        netPay: s.netPay,
        sortOrder: idx,
      }));

      const totals = summarizePayrollRun(items, statutory.config);

      // Minimum wage floor, evaluated against the run month.
      const wageRates = await tx.minimumWageRate.findMany({});
      const floorFor = (category: string) => {
        const hit = resolveWageFloor(
          wageRates.map((r) => ({
            id: r.id, regime: r.regime, zone: r.zone, sector: r.sector,
            category: r.category, monthlyWage: Number(r.monthlyWage),
            status: r.status, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
          })) as any,
          {
            regime: 'KARNATAKA',
            zone: 'ZONE_1',
            category,
            asOn: bounds.end,
          },
        );
        return hit ? Number(hit.monthlyWage) : null;
      };

      // Category lives on the allocation; fall back to UNSKILLED-free skip when
      // there is no allocation, because guessing a category would mean guessing
      // the statutory floor.
      const allocations = await tx.employeeAllocation.findMany({
        where: {
          employeeId: { in: slips.map((s) => s.employeeId) },
          status: 'ACTIVE',
        },
        select: { employeeId: true, category: true },
      });
      const categoryByEmployee = new Map(allocations.map((a) => [a.employeeId, a.category]));

      const withCategory = slips.map((s) => ({
        id: s.employeeId,
        name: s.employee.name,
        basic: plain(s.basic),
        da: plain(s.da),
        category: String(categoryByEmployee.get(s.employeeId) ?? 'UNSKILLED'),
      }));
      const floorCheck = checkMinimumWageFloor(withCategory, floorFor);

      const bankMissing = slips
        .filter((s) => !s.employee.bankAccountHint)
        .map((s) => ({ employeeId: s.employeeId, employeeName: s.employee.name }));
      const uanMissing = slips
        .filter((s) => !s.employee.uanHint)
        .map((s) => ({ employeeId: s.employeeId, employeeName: s.employee.name, pfEmployee: plain(s.pfEmployee) }));

      const findings = collectFindings({
        items: slips.map((s) => ({
          employeeId: s.employeeId, employeeName: s.employee.name, employeeCode: s.employee.employeeCode,
          basic: plain(s.basic), da: plain(s.da), netPay: plain(s.netPay), pfEmployee: plain(s.pfEmployee),
        })),
        statutorySetCode: statutory.rateSet?.code ?? null,
        floorCheck: {
          compliant: floorCheck.compliant,
          breaches: floorCheck.checks.filter((c) => !c.compliant && c.shortfall > 0).map((c) => ({
            employeeId: c.employeeId,
            employeeName: slips.find((s) => s.employeeId === c.employeeId)?.employee.name,
            shortfall: c.shortfall,
            category: c.category,
          })),
          missingRates: floorCheck.missingRates,
        },
        missingBank: bankMissing,
        missingUan: uanMissing,
      });

      const runNumber = `PR-${year}${String(month).padStart(2, '0')}`;

      const run = await tx.payrollRun.create({
        data: {
          tenantId: u.tenantId,
          runNumber,
          month, year,
          periodStart: new Date(`${bounds.start}T00:00:00Z`),
          periodEnd: new Date(`${bounds.end}T00:00:00Z`),
          status: 'DRAFT',
          totalEmployees: totals.count,
          totalGross: totals.gross,
          totalEsiEmployee: totals.esiEmployee,
          totalEsiEmployer: totals.esiEmployer,
          totalPfEmployee: totals.pfEmployee,
          totalPfEmployerEpf: totals.pfEmployerEPF,
          totalPfEmployerEps: totals.pfEmployerEPS,
          totalPfEmployerEdlis: totals.pfEmployerEDLIS,
          totalPt: totals.pt,
          totalTds: totals.tds,
          totalDeductions: totals.totalDeductions,
          totalNet: totals.net,
          statutorySetId: statutory.rateSet?.id ?? null,
          statutorySetCode: statutory.rateSet?.code ?? null,
          findings: findings as any,
          preparedById: u.id,
          preparedAt: new Date(),
          notes: dto.notes ?? null,
          items: { create: items },
        },
        include: { items: true },
      });

      return {
        ...run,
        label: monthLabel(month, year),
        totals: { ...totals, blocking: blockingCount(findings) },
        findings,
        statutory: { source: statutory.source, rateSet: statutory.rateSet, problems: statutory.problems },
      };
    });
  }

  /** Re-price a DRAFT run after slips or adjustments changed. */
  @Post('payroll/runs/:id/recompute')
  @RequirePermission(PERMISSIONS.PAYROLL_PREPARE)
  @ApiOperation({ summary: 'Recompute the totals and findings of a DRAFT run' })
  async recomputeRun(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id }, include: { items: true } });
      if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payroll run not found.' });
      if (!isEditable(run.status)) {
        throw new ConflictException({
          code: 'RUN_LOCKED',
          message: `Only a DRAFT run can be recomputed. ${run.runNumber} is ${run.status}.`,
        });
      }

      const statutory = await resolveStatutory(tx, { asOn: dayOnly(run.periodEnd) });
      const totals = summarizePayrollRun(run.items, statutory.config);

      // Re-price the items from their slips so the run matches what it points at.
      const slips = await tx.salarySlip.findMany({
        where: { id: { in: run.items.map((i) => i.salarySlipId).filter(Boolean) as string[] } },
      });
      for (const item of run.items) {
        const slip = slips.find((s) => s.id === item.salarySlipId);
        if (!slip) continue;
        await tx.payrollRunItem.update({
          where: { id: item.id },
          data: {
            basic: slip.basic, hra: slip.hra, da: slip.da,
            specialAllowance: slip.specialAllowance, otAmount: slip.otAmount,
            bonus: slip.bonus, grossEarnings: slip.grossEarnings,
            esiEmployee: slip.esiEmployee, pfEmployee: slip.pfEmployee,
            pt: slip.pt, tds: slip.tds,
            totalDeductions: slip.totalDeductions, netPay: slip.netPay,
            daysWorked: slip.daysWorked, daysPresent: slip.daysPresent, otDays: slip.otDays,
          },
        });
      }

      const refreshed = await tx.payrollRunItem.findMany({ where: { payrollRunId: run.id } });
      const newTotals = summarizePayrollRun(refreshed, statutory.config);

      return tx.payrollRun.update({
        where: { id: run.id },
        data: {
          totalEmployees: newTotals.count,
          totalGross: newTotals.gross,
          totalEsiEmployee: newTotals.esiEmployee,
          totalEsiEmployer: newTotals.esiEmployer,
          totalPfEmployee: newTotals.pfEmployee,
          totalPfEmployerEpf: newTotals.pfEmployerEPF,
          totalPfEmployerEps: newTotals.pfEmployerEPS,
          totalPfEmployerEdlis: newTotals.pfEmployerEDLIS,
          totalPt: newTotals.pt,
          totalTds: newTotals.tds,
          totalDeductions: newTotals.totalDeductions,
          totalNet: newTotals.net,
          statutorySetId: statutory.rateSet?.id ?? null,
          statutorySetCode: statutory.rateSet?.code ?? null,
        },
        include: { items: true },
      });
    });
  }

  /**
   * Freeze the period.
   *
   * D-P5-2: legacy runs never wrote the run back onto the slips they consumed,
   * so a later `generateSalarySlip_` could silently recompute a slip for an
   * approved month. Here locking attaches every slip to the run, and
   * generation refuses anyone whose slip already belongs to a run.
   */
  @Post('payroll/runs/:id/lock')
  @RequirePermission(PERMISSIONS.PAYROLL_PREPARE)
  @ApiOperation({ summary: 'DRAFT → LOCKED: freeze the figures and attach the slips' })
  async lockRun(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id }, include: { items: true } });
      if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payroll run not found.' });
      if (!canTransition(run.status, 'LOCKED')) {
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: `Cannot lock a run in status ${run.status}.`,
        });
      }
      if (!run.items.length) {
        throw new BadRequestException({ code: 'EMPTY_RUN', message: 'An empty run cannot be locked.' });
      }
      if (!run.statutorySetCode) {
        throw new BadRequestException({
          code: 'NO_STATUTORY_SET',
          message: 'Confirm a statutory rate set for this period before locking payroll.',
        });
      }

      const slipIds = run.items.map((i) => i.salarySlipId).filter(Boolean) as string[];
      await tx.salarySlip.updateMany({
        where: { id: { in: slipIds }, payrollRunId: null },
        data: { payrollRunId: run.id },
      });

      return tx.payrollRun.update({
        where: { id: run.id },
        data: { status: 'LOCKED', lockedAt: new Date() },
        include: { items: true },
      });
    });
  }

  @Post('payroll/runs/:id/unlock')
  @RequirePermission(PERMISSIONS.PAYROLL_PREPARE)
  @ApiOperation({ summary: 'LOCKED → DRAFT: reopen for correction before approval' })
  async unlockRun(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: { reason: string },
  ) {
    if (!dto?.reason || dto.reason.trim().length < 10) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Unlocking a period requires a written reason.' });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id } });
      if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payroll run not found.' });
      if (!canTransition(run.status, 'DRAFT')) {
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: `Cannot unlock a run in status ${run.status}. An approved run cannot be reopened — raise adjustments instead.`,
        });
      }
      await tx.salarySlip.updateMany({ where: { payrollRunId: run.id }, data: { payrollRunId: null } });
      return tx.payrollRun.update({
        where: { id: run.id },
        data: { status: 'DRAFT', lockedAt: null, notes: `[Unlocked by ${u.email}] ${dto.reason}` },
      });
    });
  }

  /**
   * Approve. Rule 16: the preparer may not approve their own run.
   *
   * Legacy `updatePayrollRun_` (HR.gs:953) assigned ApprovedBy unconditionally:
   * the same person who prepared a run could approve it, and nothing recorded
   * that they had.
   */
  @Post('payroll/runs/:id/approve')
  @RequirePermission(PERMISSIONS.PAYROLL_APPROVE)
  @ApiOperation({ summary: 'LOCKED → APPROVED. Maker-checker enforced.' })
  async approveRun(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: ApproveDto,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id }, include: { items: true } });
      if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payroll run not found.' });

      const blocking = Array.isArray(run.findings)
        ? (run.findings as any[]).filter((f) => f.severity === 'BLOCKING').length
        : 0;

      const decision = canApproveRun({
        runStatus: run.status,
        preparedById: run.preparedById,
        approver: { id: u.id, email: u.email, permissions: u.permissions } as any,
        selfApprovalAllowed: dto.enableSelfApprovalException === true,
        selfApprovalReason: dto.reason,
        blockingFindings: blocking,
      });

      if (!decision.allowed) {
        throw new ConflictException({
          code: decision.code === 'SELF_APPROVAL' ? 'MAKER_CHECKER_VIOLATION' : decision.code,
          message: decision.message,
          preparedBy: run.preparedById,
        });
      }

      const selfApproved = !!run.preparedById && run.preparedById === u.id;

      const approved = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: 'APPROVED',
          approvedById: u.id,
          approvedAt: new Date(),
          selfApprovalException: selfApproved,
          selfApprovalReason: selfApproved ? dto.reason : null,
        },
        include: { items: true },
      });

      return {
        ...approved,
        makerChecker: {
          preparedById: run.preparedById,
          approvedById: u.id,
          samePerson: selfApproved,
          selfApprovalException: selfApproved,
          reason: selfApproved ? dto.reason : null,
        },
      };
    });
  }

  @Post('payroll/runs/:id/disburse')
  @RequirePermission(PERMISSIONS.PAYROLL_APPROVE)
  @ApiOperation({ summary: 'APPROVED → DISBURSED, recording the bank reference' })
  async disburseRun(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: DisburseDto,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id } });
      if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payroll run not found.' });
      if (!canTransition(run.status, 'DISBURSED')) {
        throw new ConflictException({
          code: 'NOT_APPROVED',
          message: `Only an APPROVED run can be disbursed. ${run.runNumber} is ${run.status}.`,
        });
      }
      return tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: 'DISBURSED',
          disbursedAt: new Date(),
          disbursedById: u.id,
          bankFileRef: dto.bankFileRef ?? null,
          notes: [run.notes, dto.note].filter(Boolean).join(' | ') || null,
        },
      });
    });
  }

  @Post('payroll/runs/:id/cancel')
  @RequirePermission(PERMISSIONS.PAYROLL_PREPARE)
  @ApiOperation({ summary: 'Cancel a run that has not been approved' })
  async cancelRun(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: CancelRunDto,
  ) {
    if (!dto?.reason || dto.reason.trim().length < 10) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Cancelling a run requires a written reason.' });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id } });
      if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payroll run not found.' });
      if (!canTransition(run.status, 'CANCELLED')) {
        throw new ConflictException({
          code: 'CANNOT_CANCEL',
          message: `A ${run.status} run cannot be cancelled. Approved payroll is corrected with adjustments.`,
        });
      }
      await tx.salarySlip.updateMany({ where: { payrollRunId: run.id }, data: { payrollRunId: null } });
      return tx.payrollRun.update({
        where: { id: run.id },
        data: { status: 'CANCELLED', cancelReason: dto.reason },
      });
    });
  }

  /* ------------------------------ exports ------------------------------ */

  @Get('payroll/runs/:id/export/bank-csv')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'NEFT bank transfer CSV for an approved run' })
  async exportBank(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Res({ passthrough: true }) res: any,
  ) {
    this.assertPiiExportAllowed(u);
    const { text, filename } = await this.prisma.withTenant(u.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id }, include: { items: true } });
      if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payroll run not found.' });
      if (!['APPROVED', 'DISBURSED', 'LOCKED'].includes(run.status)) {
        throw new ConflictException({
          code: 'NOT_APPROVED',
          message: 'A bank file may only be produced for a locked or approved run.',
        });
      }

      const employees = await tx.employee.findMany({
        where: { id: { in: run.items.map((i) => i.employeeId) } },
        select: { id: true, ifsc: true, bankAccountEnc: true, bankName: true },
      });
      const byId = new Map(employees.map((e) => [e.id, e]));

      // A bank file with masked account numbers is worthless, so this decrypts.
      // That is why the route additionally demands employee:pii:read and why
      // the access is written to the audit log below.
      const lines = run.items.map((i) => {
        const emp = byId.get(i.employeeId);
        return {
          beneficiaryName: i.employeeName,
          amount: plain(i.netPay),
          ifsc: emp?.ifsc ?? '',
          accountNo: decryptField(emp?.bankAccountEnc) ?? '',
          remarks: `Salary ${monthLabel(run.month, run.year)}`,
        };
      });

      await this.recordPiiExport(tx, u, {
        run, kind: 'BANK_CSV', rows: lines.length,
      });

      return {
        text: buildBankTransferCsv(lines),
        filename: `bank-transfer-${run.runNumber}.csv`,
      };
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(Buffer.from(text, 'utf8'));
  }

  @Get('payroll/runs/:id/export/ecr')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'PF ECR text for an approved run (legacy layout; verify against the portal spec)' })
  async exportEcr(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Res({ passthrough: true }) res: any,
  ) {
    this.assertPiiExportAllowed(u);
    const { text, filename, omitted } = await this.prisma.withTenant(u.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id }, include: { items: true } });
      if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payroll run not found.' });

      const employees = await tx.employee.findMany({
        where: { id: { in: run.items.map((i) => i.employeeId) } },
        select: { id: true, name: true, uanEnc: true, pfApplicable: true },
      });
      const byId = new Map(employees.map((e) => [e.id, e]));

      const statutory = await resolveStatutory(tx, { asOn: dayOnly(run.periodEnd), requireConfirmed: false });
      const epsRate = 8.33;
      const edlisRate = 0.5;

      const lines: any[] = [];
      const omitted: string[] = [];
      for (const i of run.items) {
        const emp = byId.get(i.employeeId);
        // The ECR is filed with EPFO, so it needs the real UAN, not the masked
        // hint. Decryption is gated on employee:pii:read and audited.
        const uan = decryptField(emp?.uanEnc) ?? '';
        // Legacy skipped anyone without a UAN; keep that, but report who was
        // skipped so the omission is visible rather than silent.
        if (!uan) {
          omitted.push(`${i.employeeCode} ${i.employeeName}`);
          continue;
        }
        const pfBase = Math.min(plain(i.basic) + plain(i.da), statutory.config.pfWageCap);
        lines.push({
          uan: uan.replace(/[^0-9]/g, '') || uan,
          name: i.employeeName,
          gross: plain(i.grossEarnings),
          epfWages: pfBase,
          eps: Math.round((pfBase * epsRate) / 100),
          edlis: Math.round((pfBase * edlisRate) / 100),
          epf: plain(i.pfEmployee),
          ncpDays: Math.max(0, Math.round(daysInMonthOf(run.month, run.year) - plain(i.daysWorked))),
          refundAdvances: 0,
        });
      }

      await this.recordPiiExport(tx, u, {
        run, kind: 'PF_ECR', rows: lines.length, omitted: omitted.length,
      });

      return {
        text: buildPfEcrText(lines),
        filename: `pf-ecr-${run.runNumber}.txt`,
        omitted,
      };
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Ecr-Omitted-Count', String(omitted.length));
    return new StreamableFile(Buffer.from(text, 'utf8'));
  }

  /**
   * Statutory and bank files must contain real identifiers, so producing one
   * means decrypting PII. Rule 3 is not "never decrypt" — it is "never expose
   * PII casually". The gate is the separate employee:pii:read grant, and every
   * file produced is written to the audit log with the run and row count.
   */
  private assertPiiExportAllowed(u: AuthUser) {
    if (!u.permissions.includes(PERMISSIONS.EMPLOYEE_PII_READ)) {
      throw new ForbiddenException({
        code: 'PII_EXPORT_DENIED',
        message:
          'Producing a bank or PF-ECR file decrypts employee identifiers. ' +
          'That requires the employee:pii:read permission, which is granted separately from payroll access.',
      });
    }
  }

  private async recordPiiExport(
    tx: any,
    u: AuthUser,
    info: { run: any; kind: 'BANK_CSV' | 'PF_ECR'; rows: number; omitted?: number },
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: u.tenantId,
        actorUserId: u.id,
        actorEmail: u.email,
        action: `EXPORT ${info.kind}`,
        entityType: 'payroll_run',
        entityId: info.run.id,
        after: {
          runNumber: info.run.runNumber,
          status: info.run.status,
          rows: info.rows,
          omitted: info.omitted ?? 0,
          decryptedFields: info.kind === 'PF_ECR' ? ['uan'] : ['bankAccountNo'],
        } as any,
      },
    });
  }

  /* ===================================================================== *
   * ADJUSTMENTS — Rule 16: corrections are controlled, never silent edits
   * ===================================================================== */

  @Get('payroll/adjustments')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  async listAdjustments(
    @CurrentUser() u: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const rows = await tx.payrollAdjustment.findMany({
        where: {
          ...(employeeId ? { employeeId } : {}),
          ...(status ? { status: status as any } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      const employees = await tx.employee.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.employeeId))] } },
        select: { id: true, employeeCode: true, name: true },
      });
      const byId = new Map(employees.map((e) => [e.id, e]));
      return rows.map((r) => ({
        ...r,
        amount: plain(r.amount),
        employee: byId.get(r.employeeId) ?? null,
      }));
    });
  }

  @Post('payroll/adjustments')
  @RequirePermission(PERMISSIONS.PAYROLL_PREPARE)
  @ApiOperation({ summary: 'Raise a correction against an approved or locked period' })
  async createAdjustment(@CurrentUser() u: AuthUser, @Body() dto: AdjustmentDto) {
    if (String(dto.reason ?? '').trim().length < 10) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'An adjustment must explain what went wrong, in at least a sentence.',
      });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: dto.employeeId, deletedAt: null },
        select: { id: true, name: true, employeeCode: true },
      });
      if (!employee) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Employee not found.' });

      if (dto.originalRunId) {
        const run = await tx.payrollRun.findFirst({ where: { id: dto.originalRunId } });
        if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Original payroll run not found.' });
        if (!isPeriodLocked(run.status)) {
          throw new BadRequestException({
            code: 'NOT_LOCKED',
            message: 'That period is still editable — correct the attendance or slip directly instead of raising an adjustment.',
          });
        }
        const wasPaid = await tx.payrollRunItem.findFirst({
          where: { payrollRunId: run.id, employeeId: employee.id },
        });
        if (!wasPaid) {
          throw new BadRequestException({
            code: 'NOT_IN_RUN',
            message: `${employee.name} was not paid in ${run.runNumber}, so there is nothing to adjust.`,
          });
        }
      }

      const created = await tx.payrollAdjustment.create({
        data: {
          tenantId: u.tenantId,
          employeeId: employee.id,
          originalRunId: dto.originalRunId ?? null,
          type: dto.type as any,
          amount: money(dto.amount),
          reason: dto.reason,
          status: 'PENDING',
          requestedById: u.id,
        },
      });
      return { ...created, amount: plain(created.amount), employee };
    });
  }

  /**
   * Approve an adjustment. Keeping this separate from creation preserves the
   * same maker-checker discipline as the run itself: whoever raises a
   * correction does not also authorise the money.
   */
  @Post('payroll/adjustments/:id/approve')
  @RequirePermission(PERMISSIONS.PAYROLL_APPROVE)
  async approveAdjustment(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: { reason?: string },
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const adj = await tx.payrollAdjustment.findFirst({ where: { id } });
      if (!adj) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Adjustment not found.' });
      if (adj.status !== 'PENDING') {
        throw new ConflictException({
          code: 'NOT_PENDING',
          message: `This adjustment is already ${adj.status}.`,
        });
      }
      if (adj.requestedById && adj.requestedById === u.id) {
        throw new ConflictException({
          code: 'MAKER_CHECKER_VIOLATION',
          message: 'The person who raised an adjustment cannot approve it.',
        });
      }
      return tx.payrollAdjustment.update({
        where: { id: adj.id },
        data: { status: 'APPLIED', approvedById: u.id, approvedAt: new Date() },
      });
    });
  }

  @Post('payroll/adjustments/:id/void')
  @RequirePermission(PERMISSIONS.PAYROLL_PREPARE)
  async voidAdjustment(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: { reason: string },
  ) {
    if (!dto?.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A void reason is required.' });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const adj = await tx.payrollAdjustment.findFirst({ where: { id } });
      if (!adj) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Adjustment not found.' });
      if (adj.status === 'APPLIED') {
        throw new ConflictException({
          code: 'ALREADY_APPLIED',
          message: 'An applied adjustment has already affected pay. Raise a reversing entry instead.',
        });
      }
      return tx.payrollAdjustment.update({
        where: { id: adj.id },
        data: { status: 'VOID', reason: `${adj.reason} [voided: ${dto.reason}]` },
      });
    });
  }

  /* ------------------------------ dashboard ------------------------------ */

  @Get('payroll/summary')
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  @ApiOperation({ summary: 'Payroll position for the current month and recent runs' })
  async summary(@CurrentUser() u: AuthUser) {
    const now = todayIso();
    const month = Number(now.slice(5, 7));
    const year = Number(now.slice(0, 4));

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const [slips, runs, pendingAdjustments, attendanceCount] = await Promise.all([
        tx.salarySlip.groupBy({ by: ['status'], where: { month, year }, _count: { _all: true } }),
        tx.payrollRun.findMany({
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 6,
          select: {
            id: true, runNumber: true, month: true, year: true, status: true,
            totalEmployees: true, totalGross: true, totalNet: true, preparedAt: true, approvedAt: true,
          },
        }),
        tx.payrollAdjustment.count({ where: { status: 'PENDING' } }),
        tx.attendanceRecord.count({
          where: { date: { gte: new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`) } },
        }),
      ]);

      return {
        period: { month, year, label: monthLabel(month, year), daysInMonth: daysInMonthOf(month, year) },
        slipsByStatus: Object.fromEntries(slips.map((s) => [s.status, s._count._all])),
        attendanceRowsThisMonth: attendanceCount,
        pendingAdjustments,
        recentRuns: runs.map((r) => ({
          ...r,
          totalGross: plain(r.totalGross),
          totalNet: plain(r.totalNet),
          label: monthLabel(r.month, r.year),
        })),
      };
    });
  }
}
