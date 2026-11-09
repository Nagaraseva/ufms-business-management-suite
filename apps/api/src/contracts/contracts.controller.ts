import {
  BadRequestException, Body, Controller, Get, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength,
} from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';

const CONTRACT_STATUSES = ['DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED', 'RENEWED'] as const;
type ContractStatusT = (typeof CONTRACT_STATUSES)[number];

class CreateContractDto {
  @IsString() @MinLength(1) clientId: string;
  @IsOptional() @IsString() @MaxLength(60) contractNo?: string;
  @IsOptional() @IsString() quotationId?: string;
  @IsOptional() @IsString() serviceType?: string;
  @IsOptional() @IsNumber() @Min(0) contractValue?: number;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() serviceScope?: string;
  @IsOptional() @IsInt() @Min(1) renewalAlertDays?: number;
}

/**
 * Contracts and mobilisation.
 * Legacy rule kept: a contract cannot be mobilised before it is ACTIVE, and
 * the mobilisation stamp is written once (operations hand-over).
 */
@ApiTags('contracts')
@Controller('api/v1/contracts')
export class ContractsController {
  constructor(private readonly prisma: PrismaService) {}

  private async nextContractNo(tx: any): Promise<string> {
    const rows = await tx.contract.findMany({ where: { deletedAt: null }, select: { contractNo: true } });
    const year = new Date().getFullYear();
    let max = 0;
    const re = new RegExp(`^CTR-${year}-(\\d+)$`, 'i');
    for (const r of rows) {
      const m = re.exec(String(r.contractNo ?? '').trim());
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `CTR-${year}-${String(max + 1).padStart(4, '0')}`;
  }

  @Get()
  @RequirePermission(PERMISSIONS.CONTRACT_READ)
  async list(
    @CurrentUser() u: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    const take = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * take;
    const where: any = { deletedAt: null };
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (q) {
      where.OR = [
        { contractNo: { contains: q, mode: 'insensitive' } },
        { serviceType: { contains: q, mode: 'insensitive' } },
        { client: { companyName: { contains: q, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.contract.findMany({
          where, orderBy: { startDate: 'desc' }, skip, take,
          include: { client: { select: { id: true, companyName: true, clientCode: true } } },
        }),
        tx.contract.count({ where }),
      ]);
      return { items, total, page: Number(page), pageSize: take };
    });
  }

  /** Renewals due inside the alert window — drives the dashboard widget. */
  @Get('expiring')
  @RequirePermission(PERMISSIONS.CONTRACT_READ)
  @ApiOperation({ summary: 'Contracts whose end date falls inside their renewal alert window' })
  async expiring(@CurrentUser() u: AuthUser) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const rows = await tx.contract.findMany({
        where: { deletedAt: null, status: { in: ['ACTIVE', 'EXPIRING'] } },
        include: { client: { select: { id: true, companyName: true } } },
      });
      const today = new Date();
      return rows
        .filter((c) => {
          const end = new Date(c.endDate);
          const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
          return daysLeft <= (c.renewalAlertDays ?? 60);
        })
        .map((c) => ({
          ...c,
          daysLeft: Math.ceil((new Date(c.endDate).getTime() - today.getTime()) / 86_400_000),
        }))
        .sort((a, b) => a.daysLeft - b.daysLeft);
    });
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.CONTRACT_READ)
  async detail(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const c = await tx.contract.findFirst({
        where: { id, deletedAt: null },
        include: { client: true },
      });
      if (!c) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Contract not found.' });
      return c;
    });
  }

  @Post()
  @RequirePermission(PERMISSIONS.CONTRACT_WRITE)
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateContractDto) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) {
      throw new BadRequestException({
        code: 'INVALID_PERIOD', message: 'End date must be after the start date.',
      });
    }

    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const client = await tx.client.findFirst({ where: { id: dto.clientId, deletedAt: null } });
      if (!client) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Client not found.' });

      const contractNo = String(dto.contractNo ?? '').trim() || (await this.nextContractNo(tx));
      const clash = await tx.contract.findFirst({ where: { contractNo } });
      if (clash) {
        throw new BadRequestException({
          code: 'DUPLICATE_CONTRACT_NO', message: 'This contract number already exists.',
        });
      }

      return tx.contract.create({
        data: {
          tenantId: u.tenantId,
          clientId: dto.clientId,
          companyId: client.companyId,
          contractNo,
          quotationId: dto.quotationId ?? null,
          serviceType: dto.serviceType ?? null,
          contractValue: dto.contractValue ?? 0,
          startDate: start,
          endDate: end,
          paymentTerms: dto.paymentTerms ?? null,
          serviceScope: dto.serviceScope ?? null,
          renewalAlertDays: dto.renewalAlertDays ?? 60,
          status: 'DRAFT',
        },
      });
    });
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.CONTRACT_WRITE)
  async update(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() dto: Partial<CreateContractDto>,
  ) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.contract.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Contract not found.' });
      if (existing.status === 'TERMINATED') {
        throw new BadRequestException({
          code: 'LOCKED', message: 'A terminated contract cannot be edited.',
        });
      }
      const data: any = {};
      for (const k of ['serviceType', 'paymentTerms', 'serviceScope', 'quotationId'] as const) {
        if ((dto as any)[k] !== undefined) data[k] = (dto as any)[k];
      }
      if (dto.contractValue !== undefined) data.contractValue = dto.contractValue;
      if (dto.renewalAlertDays !== undefined) data.renewalAlertDays = dto.renewalAlertDays;
      if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
      if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
      return tx.contract.update({ where: { id }, data });
    });
  }

  @Patch(':id/status')
  @RequirePermission(PERMISSIONS.CONTRACT_WRITE)
  @ApiOperation({ summary: 'Move a contract through its lifecycle' })
  async setStatus(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() body: { status: string },
  ) {
    const status = String(body?.status ?? '').toUpperCase() as ContractStatusT;
    if (!CONTRACT_STATUSES.includes(status)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS', message: `Status must be one of ${CONTRACT_STATUSES.join(', ')}.`,
      });
    }
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.contract.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Contract not found.' });
      return tx.contract.update({ where: { id }, data: { status } });
    });
  }

  /** Operations hand-over. Only an ACTIVE contract can be mobilised, once. */
  @Post(':id/mobilise')
  @RequirePermission(PERMISSIONS.CONTRACT_WRITE)
  async mobilise(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const existing = await tx.contract.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Contract not found.' });
      if (existing.status !== 'ACTIVE') {
        throw new BadRequestException({
          code: 'NOT_ACTIVE', message: 'Activate the contract before mobilising.',
        });
      }
      if (existing.mobilisedAt) {
        throw new BadRequestException({
          code: 'ALREADY_MOBILISED',
          message: `This contract was mobilised on ${existing.mobilisedAt.toISOString().slice(0, 10)}.`,
        });
      }
      return tx.contract.update({
        where: { id },
        data: { mobilisedAt: new Date(), mobilisedById: u.id },
      });
    });
  }
}
