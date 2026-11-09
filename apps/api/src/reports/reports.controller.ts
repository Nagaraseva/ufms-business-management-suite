import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import { isOverdueAction } from '@ufms/shared/marketing/marketing-rules';

class DailyReportDto {
  @IsDateString() reportDate: string;
  @IsString() @MinLength(2) @MaxLength(160) title: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() metricsJson?: any;
}

class MomMeetingDto {
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsDateString() meetingDate: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() chairpersonId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() templateId?: string;
}

class MomParticipantDto {
  @IsString() name: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() present?: boolean;
}

class MomAgendaDto {
  @IsString() topic: string;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() sortOrder?: number;
}

class MomDecisionDto {
  @IsString() decision: string;
  @IsOptional() @IsString() owner?: string;
}

class MomActionDto {
  @IsString() title: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() assigneeName?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
}

class ReportSnapshotDto {
  @IsString() reportType: string;
  @IsOptional() @IsDateString() periodFrom?: string;
  @IsOptional() @IsDateString() periodTo?: string;
  dataJson: any;
}

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  // -----------------------------------------------------------------------
  // OVERVIEW — exec dashboard snapshot
  // -----------------------------------------------------------------------

  @Get('overview')
  @ApiOperation({ summary: 'Executive dashboard overview (non-sensitive KPIs)' })
  @RequirePermission(PERMISSIONS.REPORT_READ)
  async overview(@CurrentUser() user: AuthUser) {
    const tenantId = user.tenantId;
    // Parallel counts — all tenant-scoped. Never return PII.
    const [leadCount, tenderCount, clientCount, invoiceTotal, momCount, openActions] = await Promise.all([
      this.prisma.lead.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.tender.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.client.count({ where: { tenantId } }).catch(() => 0),
      (async () => { try { const agg = await (this.prisma as any).invoice.aggregate({ where: { tenantId }, _sum: { grandTotal: true } }); return agg._sum?.grandTotal ?? 0; } catch (_e) { return 0; } })(),
      this.prisma.momMeeting.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.momAction.count({ where: { tenantId, status: { in: ['OPEN', 'OVERDUE'] } } }).catch(() => 0),
    ].map(p => p.catch(() => 0)));
    const today = new Date().toISOString().slice(0, 10);
    return {
      tenantId,
      generatedAt: new Date().toISOString(),
      kpis: { leads: leadCount, tenders: tenderCount, clients: clientCount, invoicesValue: invoiceTotal, moms: momCount, openActions },
      period: { from: `${today.slice(0, 7)}-01`, to: today },
      disclaimer: 'Figures are tenant-local; no cross-tenant data included. Sensitive PII excluded.',
    };
  }

  // -----------------------------------------------------------------------
  // DAILY REPORTS
  // -----------------------------------------------------------------------

  @Get('daily')
  @RequirePermission(PERMISSIONS.DAILY_REPORT_READ)
  async listDaily(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const where: any = { tenantId: user.tenantId };
    if (from || to) where.reportDate = { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined };
    return this.prisma.dailyReport.findMany({ where, orderBy: { reportDate: 'desc' }, take: 100 });
  }

  @Get('daily/:id')
  @RequirePermission(PERMISSIONS.DAILY_REPORT_READ)
  async getDaily(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.prisma.dailyReport.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!r) throw new NotFoundException('Daily report not found');
    return r;
  }

  @Post('daily')
  @RequirePermission(PERMISSIONS.DAILY_REPORT_WRITE)
  async createDaily(@CurrentUser() user: AuthUser, @Body() dto: DailyReportDto) {
    return this.prisma.dailyReport.create({ data: { tenantId: user.tenantId, reportDate: new Date(dto.reportDate), title: dto.title, summary: dto.summary, metricsJson: dto.metricsJson ?? null, createdById: user.id } as any });
  }

  @Patch('daily/:id')
  @RequirePermission(PERMISSIONS.DAILY_REPORT_WRITE)
  async updateDaily(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<DailyReportDto>) {
    const ex = await this.prisma.dailyReport.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Daily report not found');
    return this.prisma.dailyReport.update({ where: { id }, data: { title: dto.title, summary: dto.summary, metricsJson: dto.metricsJson } as any });
  }

  @Delete('daily/:id')
  @RequirePermission(PERMISSIONS.DAILY_REPORT_WRITE)
  async deleteDaily(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const ex = await this.prisma.dailyReport.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Daily report not found');
    return this.prisma.dailyReport.delete({ where: { id } });
  }

  // -----------------------------------------------------------------------
  // MOM — Meetings
  // -----------------------------------------------------------------------

  @Get('moms')
  @RequirePermission(PERMISSIONS.MOM_READ)
  async listMoms(@CurrentUser() user: AuthUser) {
    return this.prisma.momMeeting.findMany({ where: { tenantId: user.tenantId }, orderBy: { meetingDate: 'desc' }, take: 100, include: { participants: true, agendas: true, decisions: true, actions: true } as any });
  }

  @Get('moms/:id')
  @RequirePermission(PERMISSIONS.MOM_READ)
  async getMom(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const m = await this.prisma.momMeeting.findFirst({ where: { id, tenantId: user.tenantId }, include: { participants: true, agendas: { orderBy: { sortOrder: 'asc' } }, decisions: true, actions: true } as any });
    if (!m) throw new NotFoundException('MOM not found');
    // Decorate overdue actions
    const today = new Date().toISOString().slice(0, 10);
    const actions = (m as any).actions as any[];
    const decorated = actions.map(a => ({ ...a, isOverdue: isOverdueAction(a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 10) : null, a.status, today) }));
    return { ...(m as any), actions: decorated };
  }

  @Post('moms')
  @RequirePermission(PERMISSIONS.MOM_WRITE)
  async createMom(@CurrentUser() user: AuthUser, @Body() dto: MomMeetingDto) {
    return this.prisma.momMeeting.create({ data: { tenantId: user.tenantId, title: dto.title, meetingDate: new Date(dto.meetingDate), location: dto.location, chairpersonId: dto.chairpersonId ?? null, notes: dto.notes, templateId: dto.templateId ?? null, createdById: user.id } as any });
  }

  @Patch('moms/:id')
  @RequirePermission(PERMISSIONS.MOM_WRITE)
  async updateMom(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<MomMeetingDto & { status: string }>) {
    const ex = await this.prisma.momMeeting.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('MOM not found');
    return this.prisma.momMeeting.update({ where: { id }, data: { title: dto.title, meetingDate: dto.meetingDate ? new Date(dto.meetingDate) : undefined, location: dto.location, notes: dto.notes, status: dto.status as any } as any });
  }

  @Delete('moms/:id')
  @RequirePermission(PERMISSIONS.MOM_WRITE)
  async deleteMom(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const ex = await this.prisma.momMeeting.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('MOM not found');
    return this.prisma.momMeeting.delete({ where: { id } });
  }

  @Post('moms/:id/participants')
  @RequirePermission(PERMISSIONS.MOM_WRITE)
  async addParticipant(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MomParticipantDto) {
    const mom = await this.prisma.momMeeting.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!mom) throw new NotFoundException('MOM not found');
    return this.prisma.momParticipant.create({ data: { tenantId: user.tenantId, meetingId: id, name: dto.name, email: dto.email, role: dto.role, present: dto.present ?? true } as any });
  }

  @Delete('moms/:meetingId/participants/:participantId')
  @RequirePermission(PERMISSIONS.MOM_WRITE)
  async removeParticipant(@CurrentUser() user: AuthUser, @Param('meetingId', ParseUUIDPipe) meetingId: string, @Param('participantId', ParseUUIDPipe) participantId: string) {
    const ex = await this.prisma.momParticipant.findFirst({ where: { id: participantId, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Participant not found');
    return this.prisma.momParticipant.delete({ where: { id: participantId } });
  }

  @Post('moms/:id/agendas')
  @RequirePermission(PERMISSIONS.MOM_WRITE)
  async addAgenda(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MomAgendaDto) {
    const mom = await this.prisma.momMeeting.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!mom) throw new NotFoundException('MOM not found');
    return this.prisma.momAgenda.create({ data: { tenantId: user.tenantId, meetingId: id, topic: dto.topic, owner: dto.owner, notes: dto.notes, sortOrder: dto.sortOrder ?? 0 } as any });
  }

  @Post('moms/:id/decisions')
  @RequirePermission(PERMISSIONS.MOM_WRITE)
  async addDecision(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MomDecisionDto) {
    const mom = await this.prisma.momMeeting.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!mom) throw new NotFoundException('MOM not found');
    return this.prisma.momDecision.create({ data: { tenantId: user.tenantId, meetingId: id, decision: dto.decision, owner: dto.owner } as any });
  }

  @Post('moms/:id/actions')
  @RequirePermission(PERMISSIONS.MOM_WRITE)
  async addAction(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MomActionDto) {
    const mom = await this.prisma.momMeeting.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!mom) throw new NotFoundException('MOM not found');
    return this.prisma.momAction.create({ data: { tenantId: user.tenantId, meetingId: id, title: dto.title, assigneeId: dto.assigneeId ?? null, assigneeName: dto.assigneeName, dueDate: dto.dueDate ? new Date(dto.dueDate) : null, status: dto.status ?? 'OPEN', notes: dto.notes, createdById: user.id } as any });
  }

  @Patch('moms/:meetingId/actions/:actionId')
  @RequirePermission(PERMISSIONS.MOM_WRITE)
  async updateAction(@CurrentUser() user: AuthUser, @Param('meetingId', ParseUUIDPipe) _meetingId: string, @Param('actionId', ParseUUIDPipe) actionId: string, @Body() dto: Partial<MomActionDto>) {
    const ex = await this.prisma.momAction.findFirst({ where: { id: actionId, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Action not found');
    const data: any = { updatedAt: new Date() };
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.assigneeName !== undefined) data.assigneeName = dto.assigneeName;
    if (dto.notes !== undefined) data.notes = dto.notes;
    return this.prisma.momAction.update({ where: { id: actionId }, data });
  }

  @Get('moms/actions/open')
  @RequirePermission(PERMISSIONS.MOM_READ)
  async openActions(@CurrentUser() user: AuthUser) {
    const actions = await this.prisma.momAction.findMany({ where: { tenantId: user.tenantId, status: { in: ['OPEN', 'IN_PROGRESS', 'OVERDUE'] } }, orderBy: { dueDate: 'asc' }, take: 100 });
    const today = new Date().toISOString().slice(0, 10);
    return (actions as any[]).map(a => ({ ...a, isOverdue: isOverdueAction(a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 10) : null, a.status, today) }));
  }

  // -----------------------------------------------------------------------
  // REPORT SNAPSHOTS — generic exec dashboards
  // -----------------------------------------------------------------------

  @Get('snapshots')
  @RequirePermission(PERMISSIONS.REPORT_READ)
  async listSnapshots(@CurrentUser() user: AuthUser, @Query('reportType') reportType?: string) {
    const where: any = { tenantId: user.tenantId };
    if (reportType) where.reportType = reportType;
    return this.prisma.reportSnapshot.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  @Post('snapshots')
  @RequirePermission(PERMISSIONS.REPORT_WRITE)
  async createSnapshot(@CurrentUser() user: AuthUser, @Body() dto: ReportSnapshotDto) {
    return this.prisma.reportSnapshot.create({ data: { tenantId: user.tenantId, reportType: dto.reportType, periodFrom: dto.periodFrom ? new Date(dto.periodFrom) : null, periodTo: dto.periodTo ? new Date(dto.periodTo) : null, dataJson: dto.dataJson ?? {}, createdById: user.id } as any });
  }

  @Post('snapshots/generate')
  @ApiOperation({ summary: 'Generate a snapshot from live tenant data (non-sensitive aggregates only)' })
  @RequirePermission(PERMISSIONS.REPORT_WRITE)
  async generateSnapshot(@CurrentUser() user: AuthUser, @Body() body: { reportType: string; periodFrom?: string; periodTo?: string }) {
    const tenantId = user.tenantId;
    let dataJson: any = {};
    try {
      switch (body.reportType) {
        case 'EXEC_DASHBOARD':
          dataJson = await this.buildExecDashboard(tenantId);
          break;
        case 'LEAD_FUNNEL':
          dataJson = await this.buildLeadFunnel(tenantId);
          break;
        default:
          dataJson = { message: `Report type ${body.reportType} snapshot with tenant ${tenantId}`, generatedAt: new Date().toISOString() };
      }
    } catch (e: any) {
      dataJson = { error: e.message, generatedAt: new Date().toISOString() };
    }
    return this.prisma.reportSnapshot.create({ data: { tenantId, reportType: body.reportType, periodFrom: body.periodFrom ? new Date(body.periodFrom) : null, periodTo: body.periodTo ? new Date(body.periodTo) : null, dataJson, createdById: user.id } as any });
  }

  @Get('export/:reportType')
  @RequirePermission(PERMISSIONS.REPORT_READ)
  async exportCsv(@CurrentUser() user: AuthUser, @Param('reportType') reportType: string, @Res() res: Response) {
    const snaps = await this.prisma.reportSnapshot.findMany({ where: { tenantId: user.tenantId, reportType }, orderBy: { createdAt: 'desc' }, take: 20 });
    const headers = ['id', 'reportType', 'periodFrom', 'periodTo', 'createdAt'];
    const rows = snaps.map((s: any) => [s.id, s.reportType, s.periodFrom ?? '', s.periodTo ?? '', new Date(s.createdAt).toISOString()]);
    const csv = [headers.join(','), ...rows.map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${reportType}-${Date.now()}.csv"`);
    res.send(csv);
  }

  private async buildExecDashboard(tenantId: string): Promise<any> {
    const [leadCount, tenderCount] = await Promise.all([
      this.prisma.lead.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.tender.count({ where: { tenantId } }).catch(() => 0),
    ]);
    return { leads: leadCount, tenders: tenderCount, generatedAt: new Date().toISOString() };
  }

  private async buildLeadFunnel(tenantId: string): Promise<any> {
    try {
      const leads = await this.prisma.lead.findMany({ where: { tenantId }, select: { status: true } }) as any[];
      const byStatus: Record<string, number> = {};
      for (const l of leads) byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
      return { byStatus, total: leads.length, generatedAt: new Date().toISOString() };
    } catch (_e) { return { total: 0 }; }
  }
}
