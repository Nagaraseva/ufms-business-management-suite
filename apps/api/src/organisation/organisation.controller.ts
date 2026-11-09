import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Patch, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';

class CompanyDto {
  @IsString() @MinLength(1) @MaxLength(20) code: string;
  @IsString() @MinLength(1) @MaxLength(200) legalName: string;
  @IsString() @MinLength(1) @MaxLength(200) displayName: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() pan?: string;
}

class BranchDto {
  @IsString() companyId: string;
  @IsString() @MinLength(1) @MaxLength(20) code: string;
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
}

class SiteDto {
  @IsString() companyId: string;
  @IsOptional() @IsString() branchId?: string;
  @IsString() @MinLength(1) @MaxLength(20) code: string;
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
}

class DepartmentDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
}

@ApiTags('organisation')
@Controller('api/v1/organisation')
export class OrganisationController {
  constructor(private readonly prisma: PrismaService) {}

  // ---- companies ----
  @Get('companies')
  @RequirePermission(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'List companies in the current tenant' })
  listCompanies(@CurrentUser() u: AuthUser) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.company.findMany({ where: { deletedAt: null }, orderBy: { code: 'asc' } }),
    );
  }

  @Post('companies')
  @RequirePermission(PERMISSIONS.ORG_WRITE)
  createCompany(@CurrentUser() u: AuthUser, @Body() dto: CompanyDto) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.company.create({ data: { tenantId: u.tenantId, ...dto } }),
    );
  }

  @Patch('companies/:id')
  @RequirePermission(PERMISSIONS.ORG_WRITE)
  updateCompany(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string, @Body() dto: Partial<CompanyDto>) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.company.update({ where: { id }, data: dto }),
    );
  }

  @Delete('companies/:id')
  @RequirePermission(PERMISSIONS.ORG_WRITE)
  async archiveCompany(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    await this.prisma.withTenant(u.tenantId, (tx) =>
      tx.company.update({ where: { id }, data: { active: false, deletedAt: new Date() } }),
    );
    return { ok: true };
  }

  // ---- branches ----
  @Get('branches')
  @RequirePermission(PERMISSIONS.ORG_READ)
  listBranches(@CurrentUser() u: AuthUser, @Query('companyId') companyId?: string) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.branch.findMany({
        where: { ...(companyId ? { companyId } : {}) },
        orderBy: { code: 'asc' },
      }),
    );
  }

  @Post('branches')
  @RequirePermission(PERMISSIONS.ORG_WRITE)
  createBranch(@CurrentUser() u: AuthUser, @Body() dto: BranchDto) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.branch.create({ data: { tenantId: u.tenantId, ...dto } }),
    );
  }

  // ---- sites ----
  @Get('sites')
  @RequirePermission(PERMISSIONS.ORG_READ)
  listSites(@CurrentUser() u: AuthUser, @Query('companyId') companyId?: string, @Query('branchId') branchId?: string) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.site.findMany({
        where: { ...(companyId ? { companyId } : {}), ...(branchId ? { branchId } : {}) },
        orderBy: { code: 'asc' },
      }),
    );
  }

  @Post('sites')
  @RequirePermission(PERMISSIONS.ORG_WRITE)
  createSite(@CurrentUser() u: AuthUser, @Body() dto: SiteDto) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.site.create({ data: { tenantId: u.tenantId, ...dto } }),
    );
  }

  // ---- departments ----
  @Get('departments')
  @RequirePermission(PERMISSIONS.ORG_READ)
  listDepartments(@CurrentUser() u: AuthUser) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.department.findMany({ orderBy: { name: 'asc' } }),
    );
  }

  @Post('departments')
  @RequirePermission(PERMISSIONS.ORG_WRITE)
  createDepartment(@CurrentUser() u: AuthUser, @Body() dto: DepartmentDto) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.department.create({ data: { tenantId: u.tenantId, name: dto.name } }),
    );
  }
}
