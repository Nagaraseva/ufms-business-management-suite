import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';

class ScheduleSurveyDto {
  @IsString() leadId: string;
  @IsISO8601() scheduledDate: string;
  @IsOptional() @IsString() scheduledTime?: string;
  @IsOptional() @IsString() executiveId?: string;
  @IsOptional() @IsString() siteContact?: string;
  @IsOptional() @IsString() siteMobile?: string;
  @IsOptional() @IsString() address?: string;
}

class InspectionDto {
  @IsOptional() @IsString() inspectionSummary?: string;
  @IsOptional() @IsNumber() manpowerRequired?: number;
  @IsOptional() @IsString() materialsRequired?: string;
  @IsOptional() @IsNumber() areaSqFt?: number;
  @IsOptional() @IsString() scopeOfWork?: string;
  @IsOptional() @IsString() status?: string;
}

const SURVEY_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

@ApiTags('surveys')
@Controller('api/v1/surveys')
export class SurveysController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission(PERMISSIONS.SURVEY_READ)
  list(@CurrentUser() u: AuthUser) {
    return this.prisma.withTenant(u.tenantId, (tx) =>
      tx.$queryRawUnsafe(
        `SELECT s.*, l."customerName", l."leadNo"
           FROM surveys s JOIN leads l ON l.id = s."leadId"
          WHERE s."tenantId" = $1::uuid
          ORDER BY s."scheduledDate" DESC LIMIT 500`,
        u.tenantId,
      ),
    );
  }

  @Post()
  @RequirePermission(PERMISSIONS.SURVEY_WRITE)
  @ApiOperation({ summary: 'Schedule a site survey for a lead' })
  async schedule(@CurrentUser() u: AuthUser, @Body() dto: ScheduleSurveyDto) {
    return this.prisma.withTenant(u.tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id: dto.leadId } });
      if (!lead) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Lead not found.' });

      const rows = await tx.$queryRawUnsafe(
        `INSERT INTO surveys ("id","tenantId","leadId","executiveId","scheduledDate","scheduledTime","status",
                              "siteContact","siteMobile","address","createdById","createdAt","updatedAt")
         VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3::uuid,$4::date,$5,'SCHEDULED',$6,$7,$8,$9::uuid,now(),now())
         RETURNING *`,
        u.tenantId, dto.leadId, dto.executiveId ?? null, dto.scheduledDate,
        dto.scheduledTime ?? null, dto.siteContact ?? null, dto.siteMobile ?? null,
        dto.address ?? null, u.id,
      );

      await tx.lead.update({ where: { id: dto.leadId }, data: { status: 'SURVEY_SCHEDULED' } });
      return Array.isArray(rows) ? rows[0] : rows;
    });
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.SURVEY_READ)
  async detail(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string) {
    const rows: any[] = await this.prisma.withTenant(u.tenantId, (tx) =>
      tx.$queryRawUnsafe(
        `SELECT s.*, l."customerName", l."leadNo" FROM surveys s
           JOIN leads l ON l.id = s."leadId"
          WHERE s."tenantId" = $1::uuid AND s.id = $2::uuid`,
        u.tenantId, id,
      ),
    );
    if (!rows.length) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Survey not found.' });
    return rows[0];
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.SURVEY_WRITE)
  async update(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string, @Body() dto: InspectionDto) {
    if (dto.status && !SURVEY_STATUSES.includes(dto.status as any)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', message: `Status must be one of ${SURVEY_STATUSES.join(', ')}.` });
    }
    const rows: any[] = await this.prisma.withTenant(u.tenantId, (tx) =>
      tx.$queryRawUnsafe(
        `UPDATE surveys SET
           "inspectionSummary" = COALESCE($3, "inspectionSummary"),
           "manpowerRequired"  = COALESCE($4::int, "manpowerRequired"),
           "materialsRequired" = COALESCE($5, "materialsRequired"),
           "areaSqFt"          = COALESCE($6::numeric, "areaSqFt"),
           "scopeOfWork"       = COALESCE($7, "scopeOfWork"),
           status              = COALESCE($8::"SurveyStatus", status),
           "updatedAt"         = now()
         WHERE "tenantId" = $1::uuid AND id = $2::uuid
         RETURNING *`,
        u.tenantId, id,
        dto.inspectionSummary ?? null, dto.manpowerRequired ?? null,
        dto.materialsRequired ?? null, dto.areaSqFt ?? null,
        dto.scopeOfWork ?? null, dto.status ?? null,
      ),
    );
    if (!rows.length) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Survey not found.' });
    return rows[0];
  }
}
