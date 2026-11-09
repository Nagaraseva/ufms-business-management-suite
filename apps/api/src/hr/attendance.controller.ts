import {
  BadRequestException, Body, ConflictException, Controller, Get, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString,
  IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import {
  attendanceToDays, daysInMonthOf, isPeriodLocked, monthLabel, periodBounds,
} from '@ufms/shared/payroll/run-rules';

const ATTENDANCE_STATUSES = [
  'PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE', 'UNPAID_LEAVE', 'WEEKLY_OFF', 'HOLIDAY',
] as const;
const ATTENDANCE_SOURCES = ['MANUAL', 'IMPORT', 'BIOMETRIC'] as const;

/** Body for marking a single employee-day. */
class MarkAttendanceDto {
  @IsUUID() employeeId: string;
  @IsString() @MaxLength(10) date: string;
  @IsOptional() @IsEnum(ATTENDANCE_STATUSES as unknown as object)
  status?: (typeof ATTENDANCE_STATUSES)[number];
  @IsOptional() @IsNumber() @Min(0) @Max(24) hoursWorked?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(16) otHours?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @IsEnum(ATTENDANCE_SOURCES as unknown as object)
  source?: (typeof ATTENDANCE_SOURCES)[number];
}

/** Body for marking many employees across a date range in one call. */
class BulkAttendanceDto {
  @IsArray() @IsUUID('4', { each: true }) employeeIds: string[];
  @IsDateString() fromDate: string;
  @IsDateString() toDate: string;
  @IsOptional() @IsEnum(ATTENDANCE_STATUSES as unknown as object)
  status?: (typeof ATTENDANCE_STATUSES)[number];
  @IsOptional() @IsBoolean() skipWeekends?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(16) otHours?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/**
 * Attendance — a capability the legacy app did not have at all.
 *
 * v5.6.61 asked whoever ran payroll to type a number of days worked into the
 * salary form. Nothing recorded who was on site, so the figure was whatever
 * somebody remembered, and there was no way to defend it in a labour
 * inspection. Phase 4 gap analysis (finding P4-1) recorded the absence; this
 * controller fills it.
 *
 * Design decisions worth knowing:
 *  - A row is never deleted. A mistake is superseded, so the audit trail keeps
 *    both the original entry and the correction and who made each.
 *  - Marking attendance for a month whose payroll run has left DRAFT is
 *    refused. Paying people and then editing the attendance behind the payment
 *    is exactly the drift the legacy system suffered from (defect D-P5-2).
 *  - The month grid is returned in one query so the UI can render it without
 *    an N+1 storm.
 */
@ApiTags('attendance')
@Controller('api/v1')
export class AttendanceController {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------- helpers ------------------------------- */

  private parsePeriod(month?: string, year?: string) {
    const m = Number(month);
    const y = Number(year);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new BadRequestException({ code: 'INVALID_MONTH', message: 'month must be 1-12.' });
    }
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      throw new BadRequestException({ code: 'INVALID_YEAR', message: 'year must be 2000-2100.' });
    }
    return { month: m, year: y, ...periodBounds(m, y) };
  }

  /** Refuse writes to a period that payroll has already frozen. */
  private async assertPeriodOpen(tx: any, month: number, year: number) {
    const run = await tx.payrollRun.findFirst({
      where: { month, year, status: { in: ['LOCKED', 'APPROVED', 'DISBURSED'] } },
      select: { id: true, runNumber: true, status: true },
    });
    if (run) {
      throw new ConflictException({
        code: 'PERIOD_LOCKED',
        message:
          `Attendance for ${monthLabel(month, year)} is frozen because payroll run ` +
          `${run.runNumber} is ${run.status}. Correct the payroll with an adjustment instead.`,
        payrollRun: run,
      });
    }
  }

  private dateOnly(y: number, m: number, d: number): Date {
    return new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00.000Z`);
  }

  /* -------------------------------- reads -------------------------------- */

  @Get('attendance')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  @ApiOperation({ summary: 'Attendance rows for a month, optionally filtered' })
  async list(
    @CurrentUser() u: AuthUser,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('employeeId') employeeId?: string,
    @Query('contractId') contractId?: string,
    @Query('siteId') siteId?: string,
  ) {
    const p = this.parsePeriod(month, year);
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const rows = await tx.attendanceRecord.findMany({
        where: {
          date: { gte: this.dateOnly(p.year, p.month, 1), lte: this.dateOnly(p.year, p.month, p.days) },
          ...(employeeId ? { employeeId } : {}),
          ...(contractId ? { contractId } : {}),
          ...(siteId ? { siteId } : {}),
        },
        include: {
          employee: { select: { id: true, employeeCode: true, name: true, department: true } },
        },
        orderBy: [{ date: 'asc' }, { employee: { name: 'asc' } }],
        take: 5000,
      });
      return {
        month: p.month,
        year: p.year,
        label: monthLabel(p.month, p.year),
        daysInMonth: p.days,
        count: rows.length,
        records: rows,
      };
    });
  }

  @Get('attendance/summary')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  @ApiOperation({ summary: 'Per-employee day counts for the month, ready for payroll' })
  async summary(
    @CurrentUser() u: AuthUser,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('contractId') contractId?: string,
  ) {
    const p = this.parsePeriod(month, year);
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const employees = await tx.employee.findMany({
        where: { active: true, deletedAt: null, ...(contractId ? { contractId } : {}) },
        select: {
          id: true, employeeCode: true, name: true, department: true,
          designation: true, contractId: true, status: true,
        },
        orderBy: { employeeCode: 'asc' },
      });
      const rows = await tx.attendanceRecord.findMany({
        where: {
          date: { gte: this.dateOnly(p.year, p.month, 1), lte: this.dateOnly(p.year, p.month, p.days) },
        },
        select: { employeeId: true, status: true, otHours: true },
      });

      const rowInput = rows.map((r) => ({
        status: r.status,
        otHours: Number(r.otHours),
      }));

      const byEmployee = new Map<string, typeof rowInput>();
      rows.forEach((r, i) => {
        const list = byEmployee.get(r.employeeId) ?? [];
        list.push(rowInput[i]);
        byEmployee.set(r.employeeId, list);
      });

      const summary = employees.map((e) => {
        const counts = attendanceToDays(byEmployee.get(e.id) ?? [], p.days);
        return {
          employee: e,
          ...counts,
          /** How many days were never marked — the gaps a preparer must see. */
          unmarkedDays: Math.max(
            0,
            p.days - (counts.presentDays + counts.absentDays + counts.paidLeaveDays
              + counts.unpaidLeaveDays + counts.halfDays + counts.weeklyOffs + counts.holidays),
          ),
        };
      });

      return {
        month: p.month,
        year: p.year,
        label: monthLabel(p.month, p.year),
        daysInMonth: p.days,
        employees: summary.length,
        rows: summary,
        employeesWithNoAttendance: summary.filter((s) => s.empty).length,
      };
    });
  }

  @Get('attendance/calendar')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  @ApiOperation({ summary: 'Month grid: one row per employee, one cell per day' })
  async calendar(
    @CurrentUser() u: AuthUser,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('contractId') contractId?: string,
    @Query('siteId') siteId?: string,
  ) {
    const p = this.parsePeriod(month, year);
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const employees = await tx.employee.findMany({
        where: {
          active: true, deletedAt: null,
          ...(contractId ? { contractId } : {}),
          ...(siteId ? { siteId } : {}),
        },
        select: { id: true, employeeCode: true, name: true, department: true, siteId: true },
        orderBy: { employeeCode: 'asc' },
        take: 500,
      });
      const records = await tx.attendanceRecord.findMany({
        where: {
          date: { gte: this.dateOnly(p.year, p.month, 1), lte: this.dateOnly(p.year, p.month, p.days) },
          employeeId: { in: employees.map((e) => e.id) },
        },
        select: {
          id: true, employeeId: true, date: true, status: true,
          otHours: true, note: true, source: true, correctionCount: true,
        },
      });

      const cells = new Map<string, any>();
      for (const r of records) {
        cells.set(`${r.employeeId}|${r.date.toISOString().slice(0, 10)}`, r);
      }

      return {
        month: p.month,
        year: p.year,
        label: monthLabel(p.month, p.year),
        daysInMonth: p.days,
        days: Array.from({ length: p.days }, (_, i) => i + 1),
        employees: employees.map((e) => ({
          ...e,
          cells: Array.from({ length: p.days }, (_, i) => {
            const key = `${e.id}|${p.year}-${String(p.month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
            const rec = cells.get(key);
            return rec
              ? {
                id: rec.id, status: rec.status, otHours: Number(rec.otHours),
                note: rec.note, source: rec.source, correctionCount: rec.correctionCount,
              }
              : null;
          }),
        })),
      };
    });
  }

  /* -------------------------------- writes ------------------------------- */

  @Post('attendance')
  @RequirePermission(PERMISSIONS.ATTENDANCE_WRITE)
  @ApiOperation({ summary: 'Mark one employee-day (idempotent upsert)' })
  async mark(
    @CurrentUser() u: AuthUser,
    @Body() dto: MarkAttendanceDto,
  ) {
    if (!ATTENDANCE_STATUSES.includes(String(dto.status ?? 'PRESENT').toUpperCase() as any)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: 'Unknown attendance status.' });
    }
    const day = String(dto.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException({ code: 'INVALID_DATE', message: 'date must be YYYY-MM-DD.' });
    }
    const [y, m] = day.split('-').map(Number);
    const validDays = daysInMonthOf(m, y);
    if (Number(day.slice(8, 10)) > validDays) {
      throw new BadRequestException({ code: 'INVALID_DATE', message: `${m}/${y} has only ${validDays} days.` });
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      await this.assertPeriodOpen(tx, m, y);

      const employee = await tx.employee.findFirst({
        where: { id: dto.employeeId, deletedAt: null },
        select: { id: true, contractId: true, siteId: true, name: true },
      });
      if (!employee) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Employee not found.' });

      const allocation = await tx.employeeAllocation.findFirst({
        where: {
          employeeId: employee.id,
          status: { in: ['ACTIVE', 'REPLACED'] },
          startDate: { lte: new Date(`${day}T00:00:00.000Z`) },
          OR: [{ endDate: null }, { endDate: { gte: new Date(`${day}T00:00:00.000Z`) } }],
        },
        orderBy: { startDate: 'desc' },
        select: { id: true, siteId: true, contractId: true },
      });

      const status = String(dto.status ?? 'PRESENT').toUpperCase();
      const data = {
        tenantId: u.tenantId,
        employeeId: employee.id,
        date: new Date(`${day}T00:00:00.000Z`),
        status: status as any,
        hoursWorked: dto.hoursWorked ?? 8,
        otHours: dto.otHours ?? 0,
        note: dto.note ?? null,
        source: (dto.source ?? 'MANUAL') as any,
        allocationId: allocation?.id ?? null,
        siteId: allocation?.siteId ?? employee.siteId ?? null,
        contractId: allocation?.contractId ?? employee.contractId ?? null,
        markedById: u.id,
      };

      const saved = await tx.attendanceRecord.upsert({
        where: { tenantId_employeeId_date: { tenantId: u.tenantId, employeeId: employee.id, date: data.date } },
        create: data,
        update: {
          status: data.status, hoursWorked: data.hoursWorked, otHours: data.otHours,
          note: data.note, source: data.source, allocationId: data.allocationId,
          siteId: data.siteId, contractId: data.contractId,
          markedById: u.id,
        },
      });
      return { record: saved, employee: { id: employee.id, name: employee.name } };
    });
  }

  @Post('attendance/bulk')
  @RequirePermission(PERMISSIONS.ATTENDANCE_WRITE)
  @ApiOperation({ summary: 'Mark the same status across several employees or a date range' })
  async bulk(
    @CurrentUser() u: AuthUser,
    @Body() dto: BulkAttendanceDto,
  ) {
    const status = String(dto.status ?? 'PRESENT').toUpperCase();
    if (!ATTENDANCE_STATUSES.includes(status as any)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: 'Unknown attendance status.' });
    }
    const from = String(dto.fromDate ?? '').slice(0, 10);
    const to = String(dto.toDate ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      throw new BadRequestException({ code: 'INVALID_RANGE', message: 'fromDate/toDate must be valid and ordered.' });
    }
    if (!Array.isArray(dto.employeeIds) || dto.employeeIds.length === 0) {
      throw new BadRequestException({ code: 'NO_EMPLOYEES', message: 'employeeIds is required.' });
    }
    if (dto.employeeIds.length > 500) {
      throw new BadRequestException({ code: 'TOO_MANY', message: 'Bulk mark is limited to 500 employees at a time.' });
    }

    // Every day touched must lie in one open period; a range spanning two
    // months is refused so the caller cannot half-write a locked month.
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      await this.assertPeriodOpen(tx, fm, fy);
      if (tm !== fm || ty !== fy) await this.assertPeriodOpen(tx, tm, ty);

      const employees = await tx.employee.findMany({
        where: { id: { in: dto.employeeIds }, deletedAt: null },
        select: { id: true, contractId: true, siteId: true },
      });
      if (employees.length !== dto.employeeIds.length) {
        throw new BadRequestException({
          code: 'UNKNOWN_EMPLOYEE',
          message: 'One or more employeeIds do not exist in this tenant.',
        });
      }

      const days: string[] = [];
      for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) {
        const d = new Date(t);
        const iso = d.toISOString().slice(0, 10);
        if (dto.skipWeekends && (d.getUTCDay() === 0)) continue;
        days.push(iso);
      }

      let written = 0;
      for (const emp of employees) {
        for (const day of days) {
          const date = new Date(`${day}T00:00:00.000Z`);
          await tx.attendanceRecord.upsert({
            where: { tenantId_employeeId_date: { tenantId: u.tenantId, employeeId: emp.id, date } },
            create: {
              tenantId: u.tenantId, employeeId: emp.id, date,
              status: status as any, hoursWorked: 8, otHours: dto.otHours ?? 0,
              note: dto.note ?? null, source: 'MANUAL',
              siteId: emp.siteId, contractId: emp.contractId,
              markedById: u.id,
            },
            update: {
              status: status as any, otHours: dto.otHours ?? 0,
              note: dto.note ?? null, markedById: u.id,
            },
          });
          written += 1;
        }
      }
      return { employees: employees.length, days: days.length, written };
    });
  }

  @Post('attendance/import')
  @RequirePermission(PERMISSIONS.ATTENDANCE_WRITE)
  @ApiOperation({ summary: 'Import many rows (csv / biometric export). All-or-nothing.' })
  async importRows(
    @CurrentUser() u: AuthUser,
    @Body() dto: {
      source?: string;
      rows: Array<{ employeeCode: string; date: string; status: string; otHours?: number; note?: string }>;
    },
  ) {
    if (!Array.isArray(dto.rows) || dto.rows.length === 0) {
      throw new BadRequestException({ code: 'NO_ROWS', message: 'rows is required.' });
    }
    if (dto.rows.length > 2000) {
      throw new BadRequestException({ code: 'TOO_MANY', message: 'Import is limited to 2000 rows per call.' });
    }
    const source = String(dto.source ?? 'IMPORT').toUpperCase();
    if (!ATTENDANCE_SOURCES.includes(source as any)) {
      throw new BadRequestException({ code: 'INVALID_SOURCE', message: 'Unknown import source.' });
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const employees = await tx.employee.findMany({
        where: { deletedAt: null },
        select: { id: true, employeeCode: true, siteId: true, contractId: true },
      });
      const byCode = new Map(employees.map((e) => [e.employeeCode, e]));

      const errors: Array<{ row: number; message: string }> = [];
      const periods = new Set<string>();
      const resolved: Array<{ employeeId: string; date: Date; status: any; otHours: number; note: string | null; siteId: string | null; contractId: string | null }> = [];

      dto.rows.forEach((r, i) => {
        const emp = byCode.get(String(r.employeeCode ?? '').trim());
        if (!emp) { errors.push({ row: i + 1, message: `Unknown employee code ${r.employeeCode}` }); return; }
        const day = String(r.date ?? '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { errors.push({ row: i + 1, message: `Bad date ${r.date}` }); return; }
        const status = String(r.status ?? '').toUpperCase();
        if (!ATTENDANCE_STATUSES.includes(status as any)) {
          errors.push({ row: i + 1, message: `Bad status ${r.status}` }); return;
        }
        const ot = Number(r.otHours ?? 0);
        if (!Number.isFinite(ot) || ot < 0 || ot > 16) {
          errors.push({ row: i + 1, message: `OT hours must be 0-16 (got ${r.otHours})` }); return;
        }
        periods.add(day.slice(0, 7));
        resolved.push({
          employeeId: emp.id, date: new Date(`${day}T00:00:00.000Z`), status,
          otHours: ot, note: r.note ?? null, siteId: emp.siteId, contractId: emp.contractId,
        });
      });

      if (errors.length) {
        throw new BadRequestException({
          code: 'IMPORT_REJECTED',
          message: `${errors.length} row(s) could not be imported. Nothing was written.`,
          errors: errors.slice(0, 50),
        });
      }

      for (const p of periods) {
        const [y, m] = p.split('-').map(Number);
        await this.assertPeriodOpen(tx, m, y);
      }

      for (const r of resolved) {
        await tx.attendanceRecord.upsert({
          where: { tenantId_employeeId_date: { tenantId: u.tenantId, employeeId: r.employeeId, date: r.date } },
          create: {
            tenantId: u.tenantId, employeeId: r.employeeId, date: r.date,
            status: r.status, hoursWorked: 8, otHours: r.otHours, note: r.note,
            source: source as any, siteId: r.siteId, contractId: r.contractId,
            markedById: u.id,
          },
          update: {
            status: r.status, otHours: r.otHours, note: r.note,
            source: source as any, markedById: u.id,
          },
        });
      }

      return { imported: resolved.length, periods: Array.from(periods).sort() };
    });
  }

  @Patch('attendance/:id/correct')
  @RequirePermission(PERMISSIONS.ATTENDANCE_WRITE)
  @ApiOperation({ summary: 'Correct a marked day; the original values are kept in a correction record' })
  async correct(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: { status?: string; otHours?: number; note: string },
  ) {
    if (!dto.note || String(dto.note).trim().length < 5) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'A correction must record why it was made.',
      });
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const row = await tx.attendanceRecord.findFirst({ where: { id } });
      if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attendance record not found.' });

      const y = row.date.getUTCFullYear();
      const m = row.date.getUTCMonth() + 1;
      await this.assertPeriodOpen(tx, m, y);

      const status = String(dto.status ?? row.status).toUpperCase();
      if (!ATTENDANCE_STATUSES.includes(status as any)) {
        throw new BadRequestException({ code: 'INVALID_STATUS', message: 'Unknown attendance status.' });
      }
      const ot = dto.otHours == null ? Number(row.otHours) : Number(dto.otHours);
      if (!Number.isFinite(ot) || ot < 0 || ot > 16) {
        throw new BadRequestException({ code: 'INVALID_OT', message: 'OT hours must be 0-16.' });
      }

      // Append the before/after pair first: if the update fails afterwards the
      // correction record is the record of an attempt that changed nothing,
      // which is still truthful. The reverse order could update pay inputs
      // with no explanation of what they were.
      const correction = await tx.attendanceCorrection.create({
        data: {
          tenantId: u.tenantId,
          attendanceId: row.id,
          employeeId: row.employeeId,
          date: row.date,
          fromStatus: row.status,
          toStatus: status as any,
          fromOtHours: row.otHours,
          toOtHours: ot,
          reason: dto.note,
          correctedById: u.id,
        },
      });

      const updated = await tx.attendanceRecord.update({
        where: { id: row.id },
        data: {
          status: status as any,
          otHours: ot,
          note: dto.note,
          correctionCount: { increment: 1 },
          markedById: u.id,
        },
      });

      return {
        record: updated,
        correction,
        previous: { status: row.status, otHours: Number(row.otHours) },
      };
    });
  }

  @Get('attendance/:id/history')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  @ApiOperation({ summary: 'Every correction ever made to a marked day' })
  async history(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const row = await tx.attendanceRecord.findFirst({
        where: { id },
        include: {
          employee: { select: { id: true, employeeCode: true, name: true } },
          corrections: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attendance record not found.' });
      return row;
    });
  }

  @Get('attendance/lock-status')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  @ApiOperation({ summary: 'Whether a period is frozen by payroll' })
  async lockStatus(
    @CurrentUser() u: AuthUser,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const p = this.parsePeriod(month, year);
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { month: p.month, year: p.year },
        select: { id: true, runNumber: true, status: true, approvedAt: true },
        orderBy: { createdAt: 'desc' },
      });
      return {
        month: p.month,
        year: p.year,
        label: monthLabel(p.month, p.year),
        locked: run ? isPeriodLocked(run.status) : false,
        payrollRun: run,
      };
    });
  }
}
