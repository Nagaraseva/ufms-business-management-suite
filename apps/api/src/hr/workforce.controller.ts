import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param,
  ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import { findAssignmentConflict, reconcileStrength } from '@ufms/shared/hr/employee-rules';

const CATEGORIES = ['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED'] as const;

const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

class AllocationDto {
  @IsString() employeeId: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() contractId?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() @MaxLength(100) designation?: string;
  @IsOptional() @IsEnum(CATEGORIES as unknown as object) category?: (typeof CATEGORIES)[number];
  @IsDateString() startDate: string;
  @IsOptional() @IsDateString() endDate?: string;
}

class RequirementDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() contractId?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsString() @MaxLength(100) designation: string;
  @IsOptional() @IsEnum(CATEGORIES as unknown as object) category?: (typeof CATEGORIES)[number];
  @IsInt() @Min(1) requiredCount: number;
  @IsOptional() @IsString() basis?: string;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsString() notes?: string;
}

/**
 * Workforce: deployment allocations, manpower requirements and the strength
 * reconciliation that is Phase 4's exit criterion.
 */
@ApiTags('workforce')
@Controller('api/v1')
export class WorkforceController {
  constructor(private readonly prisma: PrismaService) {}

  /* ----------------------------- allocations ----------------------------- */

  @Get('allocations')
  @RequirePermission(PERMISSIONS.ALLOCATION_READ)
  async listAllocations(
    @CurrentUser() u: AuthUser,
    @Query('contractId') contractId?: string,
    @Query('siteId') siteId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('asOn') asOn?: string,
  ) {
    const where: any = {};
    if (contractId) where.contractId = contractId;
    if (siteId) where.siteId = siteId;
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;
    if (asOn) {
      const d = new Date(asOn);
      where.startDate = { lte: d };
      where.OR = [{ endDate: null }, { endDate: { gte: d } }];
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const items = await tx.employeeAllocation.findMany({
        where,
        orderBy: { startDate: 'desc' },
        take: 500,
        include: { employee: { select: { id: true, employeeCode: true, name: true, designation: true } } },
      });
      return items;
    });
  }

  @Post('allocations')
  @RequirePermission(PERMISSIONS.ALLOCATION_WRITE)
  @ApiOperation({ summary: 'Deploy an employee; rejects double deployment' })
  async createAllocation(@CurrentUser() u: AuthUser, @Body() dto: AllocationDto) {
    const start = new Date(dto.startDate);
    const end = dto.endDate ? new Date(dto.endDate) : null;
    if (end && end < start) {
      throw new BadRequestException({ code: 'INVALID_PERIOD', message: 'End date must be on or after the start date.' });
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const emp = await tx.employee.findFirst({ where: { id: dto.employeeId, deletedAt: null } });
      if (!emp) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Employee not found.' });
      if (!emp.active || emp.status === 'LEFT') {
        throw new BadRequestException({
          code: 'EMPLOYEE_NOT_ON_ROLLS',
          message: 'This employee has left and cannot be deployed.',
        });
      }

      // One person, one place. The pure rule decides; the service supplies rows.
      const live = await tx.employeeAllocation.findMany({
        where: { employeeId: dto.employeeId, status: 'ACTIVE' },
      });
      const clash = findAssignmentConflict(
        { employeeId: dto.employeeId, startDate: start, endDate: end },
        live.map((a) => ({
          id: a.id, employeeId: a.employeeId,
          startDate: a.startDate, endDate: a.endDate, status: a.status,
        })),
      );
      if (clash) {
        throw new BadRequestException({
          code: 'ALREADY_DEPLOYED',
          message: `This employee is already deployed from ${String(clash.startDate).slice(0, 10)}` +
            `${clash.endDate ? ` to ${String(clash.endDate).slice(0, 10)}` : ' with no end date'}.`,
        });
      }

      if (dto.contractId) {
        const contract = await tx.contract.findFirst({ where: { id: dto.contractId, deletedAt: null } });
        if (!contract) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Contract not found.' });
        if (!['ACTIVE', 'EXPIRING'].includes(contract.status)) {
          throw new BadRequestException({
            code: 'CONTRACT_NOT_ACTIVE',
            message: `Contract ${contract.contractNo} is ${contract.status}. Activate it before deploying staff.`,
          });
        }
      }

      const allocation = await tx.employeeAllocation.create({
        data: {
          tenantId: u.tenantId,
          employeeId: dto.employeeId,
          clientId: dto.clientId ?? null,
          contractId: dto.contractId ?? null,
          siteId: dto.siteId ?? null,
          designation: dto.designation ?? emp.designation ?? null,
          category: (dto.category ?? 'UNSKILLED') as any,
          startDate: start,
          endDate: end,
          status: 'ACTIVE',
          createdById: u.id,
        },
      });

      // Keep the employee's headline posting in step with the deployment.
      await tx.employee.update({
        where: { id: dto.employeeId },
        data: {
          siteId: dto.siteId ?? emp.siteId,
          clientId: dto.clientId ?? emp.clientId,
          contractId: dto.contractId ?? emp.contractId,
        },
      });

      return allocation;
    });
  }

  @Post('allocations/:id/release')
  @RequirePermission(PERMISSIONS.ALLOCATION_WRITE)
  @ApiOperation({ summary: 'Release an employee from a site' })
  async release(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() body: { endDate?: string; reason?: string },
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const a = await tx.employeeAllocation.findFirst({ where: { id } });
      if (!a) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Allocation not found.' });
      if (a.status !== 'ACTIVE') {
        throw new BadRequestException({ code: 'NOT_ACTIVE', message: 'This allocation is no longer active.' });
      }
      const end = body?.endDate ? new Date(body.endDate) : new Date();
      if (end < new Date(a.startDate)) {
        throw new BadRequestException({
          code: 'INVALID_PERIOD', message: 'The release date cannot be before the deployment start date.',
        });
      }
      return tx.employeeAllocation.update({
        where: { id },
        data: { status: 'RELEASED', endDate: end, releaseReason: body?.reason ?? null },
      });
    });
  }

  /** Replace one person with another, preserving the deployment history. */
  @Post('allocations/:id/replace')
  @RequirePermission(PERMISSIONS.ALLOCATION_WRITE)
  @ApiOperation({ summary: 'Replace a deployed employee with a successor' })
  async replace(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() body: { replacementEmployeeId: string; effectiveDate?: string; reason?: string },
  ) {
    if (!body?.replacementEmployeeId) {
      throw new BadRequestException({ code: 'REPLACEMENT_REQUIRED', message: 'replacementEmployeeId is required.' });
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const original = await tx.employeeAllocation.findFirst({ where: { id } });
      if (!original) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Allocation not found.' });
      if (original.status !== 'ACTIVE') {
        throw new BadRequestException({ code: 'NOT_ACTIVE', message: 'Only an active deployment can be replaced.' });
      }
      if (body.replacementEmployeeId === original.employeeId) {
        throw new BadRequestException({
          code: 'SAME_EMPLOYEE', message: 'The replacement must be a different employee.',
        });
      }

      const successor = await tx.employee.findFirst({
        where: { id: body.replacementEmployeeId, deletedAt: null },
      });
      if (!successor) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Replacement employee not found.' });
      if (!successor.active || successor.status === 'LEFT') {
        throw new BadRequestException({
          code: 'EMPLOYEE_NOT_ON_ROLLS', message: 'The replacement has left and cannot be deployed.',
        });
      }

      const handover = body.effectiveDate ? new Date(body.effectiveDate) : new Date();

      const live = await tx.employeeAllocation.findMany({
        where: { employeeId: body.replacementEmployeeId, status: 'ACTIVE' },
      });
      const clash = findAssignmentConflict(
        { employeeId: body.replacementEmployeeId, startDate: handover, endDate: original.endDate },
        live.map((a) => ({
          id: a.id, employeeId: a.employeeId,
          startDate: a.startDate, endDate: a.endDate, status: a.status,
        })),
      );
      if (clash) {
        throw new BadRequestException({
          code: 'ALREADY_DEPLOYED',
          message: 'The replacement employee is already deployed for an overlapping period.',
        });
      }

      // The day before hand-over is the last day of the original deployment.
      const lastDay = new Date(handover);
      lastDay.setUTCDate(lastDay.getUTCDate() - 1);

      const closed = await tx.employeeAllocation.update({
        where: { id },
        data: {
          status: 'REPLACED',
          endDate: lastDay,
          replacedByIdString: body.replacementEmployeeId,
          releaseReason: body.reason ?? 'Replaced on site',
        },
      });

      const created = await tx.employeeAllocation.create({
        data: {
          tenantId: u.tenantId,
          employeeId: body.replacementEmployeeId,
          clientId: original.clientId,
          contractId: original.contractId,
          siteId: original.siteId,
          designation: original.designation,
          category: original.category,
          startDate: handover,
          endDate: original.endDate,
          status: 'ACTIVE',
          replacedAllocationId: original.id,
          createdById: u.id,
        },
      });

      return { replaced: closed, replacement: created };
    });
  }

  /* -------------------------- manpower requirements -------------------------- */

  @Get('manpower-requirements')
  @RequirePermission(PERMISSIONS.MANPOWER_READ)
  async listRequirements(
    @CurrentUser() u: AuthUser,
    @Query('contractId') contractId?: string,
    @Query('siteId') siteId?: string,
  ) {
    const where: any = {};
    if (contractId) where.contractId = contractId;
    if (siteId) where.siteId = siteId;
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.manpowerRequirement.findMany({ where, orderBy: [{ designation: 'asc' }], take: 500 }),
    );
  }

  @Post('manpower-requirements')
  @RequirePermission(PERMISSIONS.MANPOWER_WRITE)
  @ApiOperation({ summary: 'Record contracted headcount for a site' })
  async createRequirement(@CurrentUser() u: AuthUser, @Body() dto: RequirementDto) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      if (!dto.contractId && !dto.siteId && !dto.clientId) {
        throw new BadRequestException({
          code: 'TARGET_REQUIRED',
          message: 'A requirement must name a contract, a site or a client.',
        });
      }
      return tx.manpowerRequirement.create({
        data: {
          tenantId: u.tenantId,
          clientId: dto.clientId ?? null,
          contractId: dto.contractId ?? null,
          siteId: dto.siteId ?? null,
          designation: dto.designation.trim(),
          category: (dto.category ?? 'UNSKILLED') as any,
          requiredCount: dto.requiredCount,
          basis: dto.basis ?? 'HEADCOUNT',
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
          notes: dto.notes ?? null,
          createdById: u.id,
        },
      });
    });
  }

  @Patch('manpower-requirements/:id')
  @RequirePermission(PERMISSIONS.MANPOWER_WRITE)
  async updateRequirement(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: Partial<RequirementDto>,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.manpowerRequirement.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Requirement not found.' });
      const data: any = {};
      for (const k of ['designation', 'basis', 'notes', 'category'] as const) {
        if ((dto as any)[k] !== undefined) data[k] = (dto as any)[k];
      }
      if (dto.requiredCount !== undefined) data.requiredCount = dto.requiredCount;
      if (dto.effectiveFrom !== undefined) data.effectiveFrom = new Date(dto.effectiveFrom);
      if (dto.effectiveTo !== undefined) {
        data.effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
      }
      return tx.manpowerRequirement.update({ where: { id }, data });
    });
  }

  /* ------------------------- strength reconciliation ------------------------- */

  /**
   * Phase 4 exit criterion: deployed strength reconciled to contracted
   * requirement, per designation, for one contract (or the whole tenant).
   */
  @Get('workforce/strength')
  @RequirePermission([PERMISSIONS.MANPOWER_READ, PERMISSIONS.ALLOCATION_READ])
  @ApiOperation({ summary: 'Reconcile contracted headcount against deployed staff' })
  async strength(
    @CurrentUser() u: AuthUser,
    @Query('contractId') contractId?: string,
    @Query('siteId') siteId?: string,
    @Query('asOn') asOn?: string,
  ) {
    const date = asOn || todayIso();
    if (Number.isNaN(new Date(date).getTime())) {
      throw new BadRequestException({ code: 'INVALID_DATE', message: 'asOn must be a valid date.' });
    }
    const scope: any = {};
    if (contractId) scope.contractId = contractId;
    if (siteId) scope.siteId = siteId;

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const [requirements, allocations] = await Promise.all([
        tx.manpowerRequirement.findMany({ where: scope }),
        tx.employeeAllocation.findMany({
          where: { ...scope, status: 'ACTIVE' },
          select: { id: true, employeeId: true, designation: true, category: true, startDate: true, endDate: true, status: true },
        }),
      ]);

      const report = reconcileStrength(
        requirements.map((r) => ({
          designation: r.designation,
          category: r.category,
          requiredCount: r.requiredCount,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo,
        })),
        allocations.map((a) => ({
          id: a.id, employeeId: a.employeeId, designation: a.designation,
          category: a.category, startDate: a.startDate, endDate: a.endDate, status: a.status,
        })),
        date,
      );
      return report;
    });
  }

  /** Per-contract strength board for the workforce dashboard. */
  @Get('workforce/strength-by-contract')
  @RequirePermission([PERMISSIONS.MANPOWER_READ, PERMISSIONS.ALLOCATION_READ])
  async strengthByContract(@CurrentUser() u: AuthUser, @Query('asOn') asOn?: string) {
    const date = asOn || todayIso();
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const contracts = await tx.contract.findMany({
        where: { deletedAt: null, status: { in: ['ACTIVE', 'EXPIRING'] } },
        include: { client: { select: { companyName: true } } },
      });
      const rows = [];
      for (const c of contracts) {
        const [requirements, allocations] = await Promise.all([
          tx.manpowerRequirement.findMany({ where: { contractId: c.id } }),
          tx.employeeAllocation.findMany({
            where: { contractId: c.id, status: 'ACTIVE' },
            select: { id: true, employeeId: true, designation: true, category: true, startDate: true, endDate: true, status: true },
          }),
        ]);
        const report = reconcileStrength(
          requirements.map((r) => ({
            designation: r.designation, category: r.category, requiredCount: r.requiredCount,
            effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
          })),
          allocations.map((a) => ({
            id: a.id, employeeId: a.employeeId, designation: a.designation,
            category: a.category, startDate: a.startDate, endDate: a.endDate, status: a.status,
          })),
          date,
        );
        rows.push({
          contractId: c.id,
          contractNo: c.contractNo,
          clientName: c.client?.companyName ?? null,
          serviceType: c.serviceType,
          contractStatus: c.status,
          ...report,
        });
      }
      return rows.sort((a, b) => a.variance - b.variance);
    });
  }
}
