import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength, IsNumber, IsBoolean } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import { canTransitionCreative } from '@ufms/shared/marketing/marketing-rules';

class CreativeProjectDto {
  @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() contentJson?: any;
  @IsOptional() @IsString() thumbnail?: string;
}

class CreativeAssetDto {
  @IsString() fileName: string;
  @IsOptional() @IsString() mimeType?: string;
  @IsOptional() @IsNumber() sizeBytes?: number;
  @IsOptional() @IsString() storageKey?: string; // object storage key (Rule 4: never local fs)
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

@ApiTags('Creative Studio')
@Controller('creative')
export class CreativeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('projects')
  @RequirePermission(PERMISSIONS.CREATIVE_READ)
  async listProjects(@CurrentUser() user: AuthUser, @Query('type') type?: string, @Query('status') status?: string) {
    const where: any = { tenantId: user.tenantId, deletedAt: null };
    if (type) where.type = type;
    if (status) where.status = status;
    return this.prisma.creativeProject.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100, include: { assets: true } as any });
  }

  @Get('projects/:id')
  @RequirePermission(PERMISSIONS.CREATIVE_READ)
  async getProject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.prisma.creativeProject.findFirst({ where: { id, tenantId: user.tenantId }, include: { assets: { orderBy: { sortOrder: 'asc' } } } as any });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  @Post('projects')
  @RequirePermission(PERMISSIONS.CREATIVE_WRITE)
  async createProject(@CurrentUser() user: AuthUser, @Body() dto: CreativeProjectDto) {
    return this.prisma.creativeProject.create({ data: { tenantId: user.tenantId, name: dto.name, type: dto.type ?? 'OTHER', templateId: dto.templateId ?? null, contentJson: dto.contentJson ?? null, thumbnail: dto.thumbnail ?? null, createdById: user.id } as any });
  }

  @Patch('projects/:id')
  @RequirePermission(PERMISSIONS.CREATIVE_WRITE)
  async updateProject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<CreativeProjectDto>) {
    const ex = await this.prisma.creativeProject.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Project not found');
    return this.prisma.creativeProject.update({ where: { id }, data: { name: dto.name, type: dto.type as any, templateId: dto.templateId, contentJson: dto.contentJson, thumbnail: dto.thumbnail } as any });
  }

  @Delete('projects/:id')
  @RequirePermission(PERMISSIONS.CREATIVE_WRITE)
  async deleteProject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const ex = await this.prisma.creativeProject.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Project not found');
    return this.prisma.creativeProject.update({ where: { id }, data: { deletedAt: new Date() } as any });
  }

  @Post('projects/:id/publish')
  @ApiOperation({ summary: 'Transition creative project through approval workflow' })
  @RequirePermission(PERMISSIONS.CREATIVE_WRITE)
  async transitionProject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: { status: string }) {
    const ex = await this.prisma.creativeProject.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Project not found');
    if (!canTransitionCreative((ex as any).status, body.status)) throw new BadRequestException(`Cannot transition ${(ex as any).status} → ${body.status}`);
    return this.prisma.creativeProject.update({ where: { id }, data: { status: body.status as any } as any });
  }

  @Post('projects/:id/duplicate')
  @RequirePermission(PERMISSIONS.CREATIVE_WRITE)
  async duplicateProject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const ex = await this.prisma.creativeProject.findFirst({ where: { id, tenantId: user.tenantId }, include: { assets: true } as any });
    if (!ex) throw new NotFoundException('Project not found');
    const dup = await this.prisma.creativeProject.create({ data: { tenantId: user.tenantId, name: `${(ex as any).name} (copy)`, type: (ex as any).type, contentJson: (ex as any).contentJson, thumbnail: (ex as any).thumbnail, templateId: (ex as any).templateId, createdById: user.id } as any });
    for (const a of ((ex as any).assets ?? [])) {
      await this.prisma.creativeAsset.create({ data: { tenantId: user.tenantId, projectId: (dup as any).id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, storageKey: a.storageKey, url: a.url, sortOrder: a.sortOrder } as any });
    }
    return dup;
  }

  // Assets

  @Post('projects/:id/assets')
  @RequirePermission(PERMISSIONS.CREATIVE_WRITE)
  async addAsset(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreativeAssetDto) {
    const proj = await this.prisma.creativeProject.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!proj) throw new NotFoundException('Project not found');
    // Rule 4: storageKey must be an object-storage key, not a local filesystem path
    if (dto.storageKey?.startsWith('/') || dto.storageKey?.includes('..')) throw new BadRequestException('storageKey must be an object-storage key, not a filesystem path');
    return this.prisma.creativeAsset.create({ data: { tenantId: user.tenantId, projectId: id, fileName: dto.fileName, mimeType: dto.mimeType, sizeBytes: dto.sizeBytes, storageKey: dto.storageKey, url: dto.url, sortOrder: dto.sortOrder ?? 0, createdById: user.id } as any });
  }

  @Delete('assets/:id')
  @RequirePermission(PERMISSIONS.CREATIVE_WRITE)
  async deleteAsset(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const ex = await this.prisma.creativeAsset.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Asset not found');
    return this.prisma.creativeAsset.delete({ where: { id } });
  }

  // Templates (reuse MarketingTemplate with category filter)

  @Get('templates')
  @RequirePermission(PERMISSIONS.CREATIVE_READ)
  async listTemplates(@CurrentUser() user: AuthUser, @Query('category') category?: string) {
    const where: any = { tenantId: user.tenantId, deletedAt: null };
    if (category) where.category = category;
    else where.category = { in: ['PRESENTATION', 'PROPOSAL', 'SOCIAL'] };
    return this.prisma.marketingTemplate.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  @Post('templates')
  @RequirePermission(PERMISSIONS.CREATIVE_WRITE)
  async createTemplate(@CurrentUser() user: AuthUser, @Body() body: { name: string; category?: string; bodyHtml?: string; variables?: string; thumbnail?: string }) {
    if (!body.name?.trim()) throw new BadRequestException('name required');
    return this.prisma.marketingTemplate.create({ data: { tenantId: user.tenantId, name: body.name, category: body.category ?? 'PRESENTATION', bodyHtml: body.bodyHtml, variables: body.variables, thumbnail: body.thumbnail, createdById: user.id } as any });
  }
}
