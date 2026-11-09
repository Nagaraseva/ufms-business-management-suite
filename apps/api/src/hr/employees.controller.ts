import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param,
  ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  IsBoolean, IsDateString, IsEmail, IsEnum, IsNumber, IsOptional,
  IsString, MaxLength, Min, MinLength,
} from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import {
  aadhaarHint, panHint, maskedHint, decryptField, encryptField,
} from '../common/field-crypto';
import {
  EMPLOYEE_STATUSES, EMPLOYEE_DOC_CATEGORIES, isValidEmployeeStatus,
  nextEmployeeCode, isDuplicateEmployeeCode, normalizePhone,
  isValidMobile, isValidAadhaar, isValidPan, hrSummary, countsAsOnRolls,
} from '@ufms/shared/hr/employee-rules';

const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

class CreateEmployeeDto {
  @IsOptional() @IsString() companyId?: string;
  /** Blank => EMP-YYYY-NNNN. */
  @IsOptional() @IsString() @MaxLength(30) employeeCode?: string;
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(100) fatherName?: string;
  @IsOptional() @IsDateString() dob?: string;
  @IsOptional() @IsEnum(GENDERS as unknown as object) gender?: (typeof GENDERS)[number];
  @IsOptional() @IsString() @MaxLength(5) bloodGroup?: string;
  @IsOptional() @IsString() @MaxLength(20) maritalStatus?: string;

  @IsOptional() @IsString() @MaxLength(20) mobile?: string;
  @IsOptional() @IsString() @MaxLength(20) alternateMobile?: string;
  @IsOptional() @IsEmail() email?: string;

  /** Sensitive — encrypted before it touches the database. */
  @IsOptional() @IsString() @MaxLength(20) aadhaarNo?: string;
  @IsOptional() @IsString() @MaxLength(15) panNo?: string;
  @IsOptional() @IsString() @MaxLength(30) uanNo?: string;
  @IsOptional() @IsString() @MaxLength(30) esiNo?: string;
  @IsOptional() @IsString() @MaxLength(40) bankAccountNo?: string;

  @IsOptional() @IsString() @MaxLength(30) pfNo?: string;
  @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @IsOptional() @IsString() @MaxLength(15) ifsc?: string;
  @IsOptional() @IsString() @MaxLength(100) branch?: string;

  @IsOptional() @IsString() @MaxLength(500) addressPermanent?: string;
  @IsOptional() @IsString() @MaxLength(500) addressCurrent?: string;

  @IsOptional() @IsString() @MaxLength(100) designation?: string;
  @IsOptional() @IsString() @MaxLength(60) department?: string;
  @IsOptional() @IsDateString() dateOfJoining?: string;
  @IsOptional() @IsEnum(EMPLOYEE_STATUSES as unknown as object) status?: string;

  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() contractId?: string;

  @IsOptional() @IsNumber() @Min(0) basic?: number;
  @IsOptional() @IsNumber() @Min(0) hra?: number;
  @IsOptional() @IsNumber() @Min(0) da?: number;
  @IsOptional() @IsNumber() @Min(0) otherAllowances?: number;

  @IsOptional() @IsBoolean() esiApplicable?: boolean;
  @IsOptional() @IsBoolean() pfApplicable?: boolean;
  @IsOptional() @IsString() @MaxLength(60) ptState?: string;

  @IsOptional() @IsString() @MaxLength(100) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(20) emergencyContactMobile?: string;
}

class DocumentDto {
  @IsEnum(EMPLOYEE_DOC_CATEGORIES as unknown as object) category: string;
  @IsString() @MinLength(1) @MaxLength(300) fileName: string;
  @IsOptional() @IsString() @MaxLength(100) mimeType?: string;
  @IsOptional() @IsNumber() @Min(0) fileSize?: number;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

/**
 * Employees.
 *
 * Two rules drive the shape of this controller:
 *
 *  1. Sensitive identifiers (Aadhaar, PAN, UAN, ESI, bank account) are encrypted
 *     with AES-256-GCM on the way in and are NEVER returned. Reads return a
 *     masked hint. A full value requires `employee:pii:read`, is audited by the
 *     audit interceptor, and is rate-limited by the global throttler.
 *
 *  2. Rows are never deleted. `deactivateEmployee` in the legacy system set
 *     Active=FALSE with a leaving date, and that history is what payroll and
 *     statutory registers depend on.
 */
@ApiTags('hr')
@Controller('api/v1/employees')
export class EmployeesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Strip every ciphertext and expose only safe hints plus a reveal flag. */
  private shape(e: any, canSeePii: boolean) {
    const {
      aadhaarEnc, panEnc, uanEnc, esiNoEnc, bankAccountEnc, ...rest
    } = e;
    return {
      ...rest,
      aadhaarHint: e.aadhaarHint ?? null,
      panHint: e.panHint ?? null,
      uanHint: e.uanHint ?? null,
      esiNoHint: e.esiNoHint ?? null,
      bankAccountHint: e.bankAccountHint ?? null,
      /** Whether this caller is allowed to request the full values. */
      piiReadable: canSeePii,
    };
  }

  @Get()
  @RequirePermission(PERMISSIONS.EMPLOYEE_READ)
  @ApiOperation({ summary: 'List employees' })
  async list(
    @CurrentUser() u: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('siteId') siteId?: string,
    @Query('department') department?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    const take = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 25));
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * take;

    const where: any = { deletedAt: null };
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (siteId) where.siteId = siteId;
    if (department) where.department = department;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { employeeCode: { contains: q, mode: 'insensitive' } },
        { mobile: { contains: q } },
        { designation: { contains: q, mode: 'insensitive' } },
        { department: { contains: q, mode: 'insensitive' } },
      ];
    }

    const canPii = u.permissions.includes(PERMISSIONS.EMPLOYEE_PII_READ);
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.employee.findMany({
          where,
          orderBy: [{ status: 'asc' }, { name: 'asc' }],
          skip, take,
        }),
        tx.employee.count({ where }),
      ]);
      return { items: items.map((e) => this.shape(e, canPii)), total, page: Number(page), pageSize: take };
    });
  }

  @Get('summary')
  @RequirePermission(PERMISSIONS.EMPLOYEE_READ)
  @ApiOperation({ summary: 'Workforce summary (legacy getHRSummary_)' })
  async summary(@CurrentUser() u: AuthUser) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const rows = await tx.employee.findMany({
        where: { deletedAt: null },
        select: { status: true, basic: true, hra: true, da: true, otherAllowances: true, department: true },
      });
      const summary = hrSummary(
        rows.map((r) => ({
          status: r.status,
          basic: Number(r.basic), hra: Number(r.hra), da: Number(r.da),
          otherAllowances: Number(r.otherAllowances), department: r.department,
        })),
      );
      const onRolls = rows.filter((r) => countsAsOnRolls(r.status)).length;
      return { ...summary, onRolls };
    });
  }

  @Get('options')
  @RequirePermission(PERMISSIONS.EMPLOYEE_READ)
  @ApiOperation({ summary: 'Employee picker — id, code, name, designation only' })
  async options(@CurrentUser() u: AuthUser, @Query('status') status = 'ACTIVE') {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.employee.findMany({
        where: { deletedAt: null, status: status.toUpperCase() as any },
        select: { id: true, employeeCode: true, name: true, designation: true, department: true },
        orderBy: { name: 'asc' },
        take: 2000,
      }),
    );
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.EMPLOYEE_READ)
  async detail(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
  ) {
    const canPii = u.permissions.includes(PERMISSIONS.EMPLOYEE_PII_READ);
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const e = await tx.employee.findFirst({
        where: { id, deletedAt: null },
        include: {
          documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
          allocations: { orderBy: { startDate: 'desc' }, take: 20 },
        },
      });
      if (!e) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Employee not found.' });
      return this.shape(e, canPii);
    });
  }

  /**
   * Explicit reveal of the full statutory identifiers.
   * Requires a separate permission, a stated reason, and is audited.
   */
  @Post(':id/reveal-pii')
  @RequirePermission(PERMISSIONS.EMPLOYEE_PII_READ)
  @ApiOperation({ summary: 'Reveal decrypted identifiers — permission- and audit-gated' })
  async revealPii(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() body: { reason?: string },
  ) {
    const reason = String(body?.reason ?? '').trim();
    if (reason.length < 10) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'State why you need the full values (at least 10 characters). This is recorded in the audit log.',
      });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const e = await tx.employee.findFirst({ where: { id, deletedAt: null } });
      if (!e) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Employee not found.' });
      return {
        employeeId: e.id,
        employeeCode: e.employeeCode,
        aadhaarNo: decryptField(e.aadhaarEnc),
        panNo: decryptField(e.panEnc),
        uanNo: decryptField(e.uanEnc),
        esiNo: decryptField(e.esiNoEnc),
        bankAccountNo: decryptField(e.bankAccountEnc),
        auditedReason: reason,
      };
    });
  }

  @Post()
  @RequirePermission(PERMISSIONS.EMPLOYEE_WRITE)
  @ApiOperation({ summary: 'Create an employee; code auto-allocates when blank' })
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateEmployeeDto) {
    const mobile = dto.mobile ? normalizePhone(dto.mobile) : '';
    if (!isValidMobile(dto.mobile ?? '')) {
      throw new BadRequestException({ code: 'INVALID_MOBILE', message: 'Enter a valid 10-digit mobile number.' });
    }
    if (!isValidAadhaar(dto.aadhaarNo ?? '')) {
      throw new BadRequestException({ code: 'INVALID_AADHAAR', message: 'Aadhaar number must be 12 digits.' });
    }
    if (!isValidPan(dto.panNo ?? '')) {
      throw new BadRequestException({ code: 'INVALID_PAN', message: 'PAN must be in the format AAAAA9999A.' });
    }
    if (dto.status && !isValidEmployeeStatus(dto.status)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: 'Invalid employee status.' });
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.employee.findMany({
        where: { deletedAt: null },
        select: { id: true, employeeCode: true, name: true, active: true },
      });

      const manual = String(dto.employeeCode ?? '').trim().toUpperCase();
      const year = new Date().getUTCFullYear();
      const code = manual || nextEmployeeCode(existing.map((e) => e.employeeCode), year);

      const dup = isDuplicateEmployeeCode(code, existing);
      if (dup.duplicate) {
        throw new BadRequestException({
          code: 'DUPLICATE_EMPLOYEE_CODE',
          message: `Employee code ${code} is already used by ${dup.usedBy ?? 'another employee'}.`,
        });
      }

      const company = await tx.company.findFirst({
        where: { deletedAt: null, active: true }, orderBy: { code: 'asc' },
      });

      const aadhaar = String(dto.aadhaarNo ?? '').replace(/\s/g, '') || null;
      const pan = String(dto.panNo ?? '').trim().toUpperCase() || null;
      const uan = String(dto.uanNo ?? '').trim() || null;
      const esiNo = String(dto.esiNo ?? '').trim() || null;
      const bank = String(dto.bankAccountNo ?? '').replace(/\s/g, '') || null;

      const created = await tx.employee.create({
        data: {
          tenantId: u.tenantId,
          companyId: dto.companyId ?? company?.id ?? null,
          employeeCode: code,
          employeeCodeIsManual: !!manual,
          name: dto.name.trim(),
          fatherName: dto.fatherName ?? null,
          dob: dto.dob ? new Date(dto.dob) : null,
          gender: dto.gender ?? null,
          bloodGroup: dto.bloodGroup ?? null,
          maritalStatus: dto.maritalStatus ?? null,
          mobile: mobile || null,
          alternateMobile: dto.alternateMobile ? normalizePhone(dto.alternateMobile) : null,
          email: dto.email ?? null,

          aadhaarEnc: encryptField(aadhaar),
          panEnc: encryptField(pan),
          uanEnc: encryptField(uan),
          esiNoEnc: encryptField(esiNo),
          bankAccountEnc: encryptField(bank),
          aadhaarHint: aadhaarHint(aadhaar),
          panHint: panHint(pan),
          uanHint: maskedHint(uan),
          esiNoHint: maskedHint(esiNo),
          bankAccountHint: maskedHint(bank),

          pfNo: dto.pfNo ?? null,
          bankName: dto.bankName ?? null,
          ifsc: dto.ifsc ? dto.ifsc.toUpperCase() : null,
          branch: dto.branch ?? null,
          addressPermanent: dto.addressPermanent ?? null,
          addressCurrent: dto.addressCurrent ?? null,

          designation: dto.designation ?? null,
          department: dto.department ?? null,
          dateOfJoining: dto.dateOfJoining ? new Date(dto.dateOfJoining) : null,
          status: (dto.status ?? 'ACTIVE') as any,

          siteId: dto.siteId ?? null,
          clientId: dto.clientId ?? null,
          contractId: dto.contractId ?? null,

          basic: dto.basic ?? 0,
          hra: dto.hra ?? 0,
          da: dto.da ?? 0,
          otherAllowances: dto.otherAllowances ?? 0,
          // Legacy default: applicable unless explicitly turned off.
          esiApplicable: dto.esiApplicable !== false,
          pfApplicable: dto.pfApplicable !== false,
          ptState: dto.ptState ?? null,

          emergencyContactName: dto.emergencyContactName ?? null,
          emergencyContactMobile: dto.emergencyContactMobile
            ? normalizePhone(dto.emergencyContactMobile) : null,

          createdById: u.id,
        },
      });

      const canPii = u.permissions.includes(PERMISSIONS.EMPLOYEE_PII_READ);
      return this.shape(created, canPii);
    });
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.EMPLOYEE_WRITE)
  async update(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: Partial<CreateEmployeeDto> & { dateOfLeaving?: string },
  ) {
    if (dto.mobile !== undefined && !isValidMobile(dto.mobile)) {
      throw new BadRequestException({ code: 'INVALID_MOBILE', message: 'Enter a valid 10-digit mobile number.' });
    }
    if (dto.aadhaarNo !== undefined && !isValidAadhaar(dto.aadhaarNo)) {
      throw new BadRequestException({ code: 'INVALID_AADHAAR', message: 'Aadhaar number must be 12 digits.' });
    }
    if (dto.panNo !== undefined && !isValidPan(dto.panNo)) {
      throw new BadRequestException({ code: 'INVALID_PAN', message: 'PAN must be in the format AAAAA9999A.' });
    }
    if (dto.status !== undefined && !isValidEmployeeStatus(dto.status)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: 'Invalid employee status.' });
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.employee.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Employee not found.' });

      const data: any = {};
      for (const k of [
        'name', 'fatherName', 'gender', 'bloodGroup', 'maritalStatus', 'email',
        'pfNo', 'bankName', 'branch', 'addressPermanent', 'addressCurrent',
        'designation', 'department', 'ptState', 'emergencyContactName',
        'siteId', 'clientId', 'contractId', 'status',
      ] as const) {
        if ((dto as any)[k] !== undefined) data[k] = (dto as any)[k];
      }
      for (const k of ['basic', 'hra', 'da', 'otherAllowances'] as const) {
        if ((dto as any)[k] !== undefined) data[k] = (dto as any)[k];
      }
      for (const k of ['esiApplicable', 'pfApplicable'] as const) {
        if ((dto as any)[k] !== undefined) data[k] = (dto as any)[k];
      }
      if (dto.ifsc !== undefined) data.ifsc = dto.ifsc ? dto.ifsc.toUpperCase() : null;
      if (dto.mobile !== undefined) data.mobile = dto.mobile ? normalizePhone(dto.mobile) : null;
      if (dto.alternateMobile !== undefined) {
        data.alternateMobile = dto.alternateMobile ? normalizePhone(dto.alternateMobile) : null;
      }
      if (dto.emergencyContactMobile !== undefined) {
        data.emergencyContactMobile = dto.emergencyContactMobile
          ? normalizePhone(dto.emergencyContactMobile) : null;
      }
      for (const k of ['dob', 'dateOfJoining'] as const) {
        if ((dto as any)[k] !== undefined) {
          data[k] = (dto as any)[k] ? new Date((dto as any)[k]) : null;
        }
      }
      if (dto.dateOfLeaving !== undefined) {
        data.dateOfLeaving = dto.dateOfLeaving ? new Date(dto.dateOfLeaving) : null;
      }
      if (dto.status === 'LEFT' && !existing.dateOfLeaving && !dto.dateOfLeaving) {
        data.dateOfLeaving = new Date();
      }

      // Re-encrypt any supplied identifier; the old ciphertext is replaced.
      if (dto.aadhaarNo !== undefined) {
        const v = String(dto.aadhaarNo).replace(/\s/g, '') || null;
        data.aadhaarEnc = encryptField(v);
        data.aadhaarHint = aadhaarHint(v);
      }
      if (dto.panNo !== undefined) {
        const v = String(dto.panNo).trim().toUpperCase() || null;
        data.panEnc = encryptField(v);
        data.panHint = panHint(v);
      }
      if (dto.uanNo !== undefined) {
        const v = String(dto.uanNo).trim() || null;
        data.uanEnc = encryptField(v);
        data.uanHint = maskedHint(v);
      }
      if (dto.esiNo !== undefined) {
        const v = String(dto.esiNo).trim() || null;
        data.esiNoEnc = encryptField(v);
        data.esiNoHint = maskedHint(v);
      }
      if (dto.bankAccountNo !== undefined) {
        const v = String(dto.bankAccountNo).replace(/\s/g, '') || null;
        data.bankAccountEnc = encryptField(v);
        data.bankAccountHint = maskedHint(v);
      }

      const code = String(dto.employeeCode ?? '').trim().toUpperCase();
      if (code && code !== existing.employeeCode) {
        const siblings = await tx.employee.findMany({
          where: { deletedAt: null },
          select: { id: true, employeeCode: true, name: true, active: true },
        });
        const dup = isDuplicateEmployeeCode(code, siblings, id);
        if (dup.duplicate) {
          throw new BadRequestException({
            code: 'DUPLICATE_EMPLOYEE_CODE',
            message: `Employee code ${code} is already used by ${dup.usedBy ?? 'another employee'}.`,
          });
        }
        data.employeeCode = code;
        data.employeeCodeIsManual = true;
      }

      data.updatedById = u.id;
      const updated = await tx.employee.update({ where: { id }, data });
      return this.shape(updated, u.permissions.includes(PERMISSIONS.EMPLOYEE_PII_READ));
    });
  }

  /**
   * Legacy deactivateEmployee_: Status -> LEFT, leaving date defaults to today,
   * Active -> false. The row stays for payroll and statutory history.
   */
  @Post(':id/deactivate')
  @RequirePermission(PERMISSIONS.EMPLOYEE_WRITE)
  @ApiOperation({ summary: 'Mark an employee as left (never deletes the row)' })
  async deactivate(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() body: { dateOfLeaving?: string; reason?: string },
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.employee.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Employee not found.' });
      if (!existing.active) {
        throw new BadRequestException({
          code: 'ALREADY_INACTIVE', message: 'This employee is already marked as left.',
        });
      }

      const leaving = body?.dateOfLeaving ? new Date(body.dateOfLeaving) : new Date();
      if (existing.dateOfJoining && leaving < new Date(existing.dateOfJoining)) {
        throw new BadRequestException({
          code: 'INVALID_LEAVING_DATE',
          message: 'The leaving date cannot be before the date of joining.',
        });
      }

      const updated = await tx.employee.update({
        where: { id },
        data: {
          status: 'LEFT',
          dateOfLeaving: leaving,
          active: false,
          updatedById: u.id,
        },
      });

      // Close any live deployment for this employee on the leaving date.
      await tx.employeeAllocation.updateMany({
        where: { employeeId: id, status: 'ACTIVE' },
        data: {
          status: 'RELEASED',
          endDate: leaving,
          releaseReason: body?.reason ?? 'Employee left the organisation',
        },
      });

      return this.shape(updated, u.permissions.includes(PERMISSIONS.EMPLOYEE_PII_READ));
    });
  }

  /* ------------------------- documents ------------------------- */

  @Get(':id/documents')
  @RequirePermission(PERMISSIONS.EMPLOYEE_READ)
  documents(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.employeeDocument.findMany({
        where: { employeeId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /**
   * Registers document metadata. The binary is NOT accepted here: uploads go
   * to object storage via a signed URL, and this row records what exists.
   * Storing files on the application server's disk is not permitted (Rule 4).
   */
  @Post(':id/documents')
  @RequirePermission(PERMISSIONS.EMPLOYEE_WRITE)
  @ApiOperation({ summary: 'Register an employee document (metadata; binary lives in object storage)' })
  async addDocument(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: DocumentDto,
  ) {
    if (!EMPLOYEE_DOC_CATEGORIES.includes(dto.category as any)) {
      throw new BadRequestException({ code: 'INVALID_CATEGORY', message: 'Unknown document category.' });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const emp = await tx.employee.findFirst({ where: { id, deletedAt: null } });
      if (!emp) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Employee not found.' });
      return tx.employeeDocument.create({
        data: {
          tenantId: u.tenantId,
          employeeId: id,
          category: dto.category as any,
          fileName: dto.fileName.trim(),
          mimeType: dto.mimeType ?? null,
          fileSize: dto.fileSize ?? null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          notes: dto.notes ?? null,
          status: 'PENDING_UPLOAD',
          uploadedById: u.id,
        },
      });
    });
  }

  @Post(':id/documents/:docId/delete')
  @RequirePermission(PERMISSIONS.EMPLOYEE_WRITE)
  async deleteDocument(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Param('docId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) docId: string,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const doc = await tx.employeeDocument.findFirst({
        where: { id: docId, employeeId: id, deletedAt: null },
      });
      if (!doc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found.' });
      // Soft delete: statutory retention outlives an employee's time on site.
      return tx.employeeDocument.update({ where: { id: docId }, data: { deletedAt: new Date() } });
    });
  }

  /** Documents expiring inside N days — drives the compliance alerts panel. */
  @Get(':id/documents/expiring')
  @RequirePermission(PERMISSIONS.EMPLOYEE_READ)
  async expiringDocuments(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Query('days') days = '30',
  ) {
    const horizon = new Date();
    horizon.setUTCDate(horizon.getUTCDate() + Math.max(1, parseInt(days, 10) || 30));
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.employeeDocument.findMany({
        where: {
          employeeId: id, deletedAt: null,
          expiryDate: { not: null, lte: horizon },
        },
        orderBy: { expiryDate: 'asc' },
      }),
    );
  }
}
