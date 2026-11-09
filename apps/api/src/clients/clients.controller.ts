import {
  BadRequestException, Body, Controller, Get, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';

class CreateClientDto {
  @IsOptional() @IsString() companyId?: string;
  /** Leave blank to allocate CLT-NNNN. */
  @IsOptional() @IsString() @MaxLength(60) clientCode?: string;
  @IsString() @MinLength(1) @MaxLength(200) companyName: string;
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MaxLength(20) gstin?: string;
  @IsOptional() @IsString() @MaxLength(20) pan?: string;
  @IsOptional() @IsString() @MaxLength(1000) billingAddress?: string;
  @IsOptional() @IsString() @MaxLength(1000) serviceAddress?: string;
  @IsOptional() @IsEmail() primaryEmail?: string;
  @IsOptional() @IsString() @MaxLength(30) primaryPhone?: string;
  @IsOptional() @IsString() @MaxLength(100) paymentTerms?: string;
}

class CreateContactDto {
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(100) designation?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
  @IsOptional() @IsString() @MaxLength(30) mobile?: string;
  @IsOptional() isPrimary?: boolean;
}

/**
 * Clients come into existence three ways in the legacy app: manually, from a
 * won lead, and from an accepted quotation. All three land here with an
 * allocated client code; nothing requires a Lead to exist.
 */
@ApiTags('clients')
@Controller('api/v1/clients')
export class ClientsController {
  constructor(private readonly prisma: PrismaService) {}

  private async nextClientCode(tenantId: string, tx: any): Promise<string> {
    const rows = await tx.client.findMany({ where: { deletedAt: null }, select: { clientCode: true } });
    let max = 0;
    for (const r of rows) {
      const m = /^CLT-(\d+)$/i.exec(String(r.clientCode ?? '').trim());
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `CLT-${String(max + 1).padStart(4, '0')}`;
  }

  @Get()
  @RequirePermission(PERMISSIONS.CLIENT_READ)
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
    if (q) {
      where.OR = [
        { companyName: { contains: q, mode: 'insensitive' } },
        { clientCode: { contains: q, mode: 'insensitive' } },
        { gstin: { contains: q, mode: 'insensitive' } },
        { primaryEmail: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.client.findMany({
          where, orderBy: { companyName: 'asc' }, skip, take,
          include: { _count: { select: { contracts: true, contacts: true } } },
        }),
        tx.client.count({ where }),
      ]);
      return { items, total, page: Number(page), pageSize: take };
    });
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.CLIENT_READ)
  async detail(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id, deletedAt: null },
        include: {
          contacts: true,
          contracts: { where: { deletedAt: null }, orderBy: { startDate: 'desc' } },
        },
      });
      if (!client) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Client not found.' });
      return client;
    });
  }

  @Post()
  @RequirePermission(PERMISSIONS.CLIENT_WRITE)
  @ApiOperation({ summary: 'Create a client (no Lead required)' })
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateClientDto) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      let companyId = dto.companyId ?? null;
      if (!companyId) {
        const company = await tx.company.findFirst({
          where: { deletedAt: null, active: true }, orderBy: { code: 'asc' },
        });
        companyId = company?.id ?? null;
      }

      const code = String(dto.clientCode ?? '').trim() || (await this.nextClientCode(u.tenantId, tx));
      const clash = await tx.client.findFirst({
        where: { clientCode: { equals: code, mode: 'insensitive' }, deletedAt: null },
      });
      if (clash) {
        throw new BadRequestException({
          code: 'DUPLICATE_CLIENT_CODE',
          message: 'This client code is already in use.',
        });
      }

      return tx.client.create({
        data: {
          tenantId: u.tenantId,
          companyId,
          clientCode: code,
          companyName: dto.companyName.trim(),
          legalName: dto.legalName?.trim() || null,
          gstin: dto.gstin?.trim()?.toUpperCase() || null,
          pan: dto.pan?.trim()?.toUpperCase() || null,
          billingAddress: dto.billingAddress ?? null,
          serviceAddress: dto.serviceAddress ?? null,
          primaryEmail: dto.primaryEmail?.trim() || null,
          primaryPhone: dto.primaryPhone?.trim() || null,
          paymentTerms: dto.paymentTerms ?? null,
          status: 'ACTIVE',
        },
      });
    });
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.CLIENT_WRITE)
  async update(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: Partial<CreateClientDto> & { status?: string },
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.client.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Client not found.' });

      const data: any = {};
      for (const k of [
        'companyName', 'legalName', 'gstin', 'pan', 'billingAddress',
        'serviceAddress', 'primaryEmail', 'primaryPhone', 'paymentTerms', 'status',
      ] as const) {
        if ((dto as any)[k] !== undefined) data[k] = (dto as any)[k];
      }
      if (data.gstin) data.gstin = String(data.gstin).toUpperCase();
      if (data.pan) data.pan = String(data.pan).toUpperCase();

      return tx.client.update({ where: { id }, data });
    });
  }

  @Get(':id/contacts')
  @RequirePermission(PERMISSIONS.CLIENT_READ)
  contacts(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.clientContact.findMany({ where: { clientId: id }, orderBy: { createdAt: 'asc' } }),
    );
  }

  @Post(':id/contacts')
  @RequirePermission(PERMISSIONS.CLIENT_WRITE)
  async addContact(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: CreateContactDto,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const client = await tx.client.findFirst({ where: { id, deletedAt: null } });
      if (!client) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Client not found.' });
      return tx.clientContact.create({
        data: {
          tenantId: u.tenantId,
          clientId: id,
          name: dto.name.trim(),
          designation: dto.designation ?? null,
          department: dto.department ?? null,
          email: dto.email ?? null,
          mobile: dto.mobile ?? null,
          isPrimary: dto.isPrimary === true,
        },
      });
    });
  }
}
