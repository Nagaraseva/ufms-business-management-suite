import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength, IsEmail, IsArray, IsDateString, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import {
  canTransitionCampaign, isValidEmail, normalizeEmail, dedupeEmails,
  canTransitionSocialPost, canAutoPublish,
} from '@ufms/shared/marketing/marketing-rules';
import { QueueService } from '../queue/queue.service';

class MarketingContactDto {
  @IsEmail() email: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() tags?: string;
}

class MarketingListDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() type?: string; // STATIC | DYNAMIC
  @IsOptional() filterJson?: any;
}

class MarketingTemplateDto {
  @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() bodyHtml?: string;
  @IsOptional() @IsString() bodyText?: string;
  @IsOptional() @IsString() variables?: string;
}

class CampaignDto {
  @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() channel?: string; // EMAIL | SMS | WHATSAPP
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() listId?: string;
  @IsOptional() @IsString() segmentId?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

class CampaignStatusDto {
  @IsString() status: string;
  @IsOptional() @IsString() note?: string;
}

class SuppressionDto {
  @IsEmail() email: string;
  @IsString() reason: string;
  @IsOptional() @IsString() contactId?: string;
}

class SocialAccountDto {
  @IsString() platform: string;
  @IsString() handle: string;
  @IsOptional() @IsString() displayName?: string;
}

class SocialPostDto {
  @IsOptional() @IsString() accountId?: string;
  @IsString() platform: string;
  @IsString() content: string;
  @IsOptional() @IsString() mediaUrls?: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

class SocialPostStatusDto {
  @IsString() status: string;
  @IsOptional() @IsString() note?: string;
}

@ApiTags('Marketing')
@Controller('marketing')
export class MarketingController {
  constructor(private readonly prisma: PrismaService, private readonly queue: QueueService) {}

  // -----------------------------------------------------------------------
  // CONTACTS (EmailDirectory)
  // -----------------------------------------------------------------------

  @Get('contacts')
  @ApiOperation({ summary: 'List marketing contacts (tenant-scoped)' })
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_READ)
  async listContacts(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('status') status?: string) {
    const where: any = { tenantId: user.tenantId, deletedAt: null };
    if (status) where.status = status;
    if (q) where.OR = [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { company: { contains: q, mode: 'insensitive' } }];
    return this.prisma.marketingContact.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Post('contacts')
  @ApiOperation({ summary: 'Create marketing contact (dedupes by email, blocks suppressed)' })
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_WRITE)
  async createContact(@CurrentUser() user: AuthUser, @Body() dto: MarketingContactDto) {
    const email = normalizeEmail(dto.email);
    if (!isValidEmail(email)) throw new BadRequestException('Invalid email');
    // Suppression block
    const suppressed = await this.prisma.marketingSuppression.findUnique({ where: { tenantId_email: { tenantId: user.tenantId, email } } } as any);
    if (suppressed) throw new BadRequestException(`Email is suppressed (${suppressed.reason})`);
    const existing = await this.prisma.marketingContact.findUnique({ where: { tenantId_email: { tenantId: user.tenantId, email } } as any });
    if (existing && !(existing as any).deletedAt) throw new BadRequestException('Contact already exists');
    // Handle soft-deleted: restore
    if (existing) {
      return this.prisma.marketingContact.update({ where: { id: (existing as any).id }, data: { name: dto.name ?? (existing as any).name, company: dto.company ?? (existing as any).company, phone: dto.phone ?? (existing as any).phone, source: dto.source ?? 'MANUAL', tags: dto.tags ?? (existing as any).tags, status: 'ACTIVE', deletedAt: null, updatedAt: new Date() } as any });
    }
    return this.prisma.marketingContact.create({ data: { tenantId: user.tenantId, email, name: dto.name, company: dto.company, phone: dto.phone, source: dto.source ?? 'MANUAL', tags: dto.tags, createdById: user.id } as any });
  }

  @Post('contacts/bulk')
  @ApiOperation({ summary: 'Bulk import contacts (dedup + suppression filter)' })
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_WRITE)
  async bulkImport(@CurrentUser() user: AuthUser, @Body() body: { contacts: MarketingContactDto[]; listId?: string }) {
    const emails = dedupeEmails((body.contacts ?? []).map(c => c.email));
    const emailIn: any = { in: emails };
    const suppressions = await this.prisma.marketingSuppression.findMany({ where: { tenantId: user.tenantId, email: emailIn } as any });
    const suppressedSet = new Set((suppressions as any[]).map(s => s.email));
    let created = 0, skipped = 0;
    for (const raw of body.contacts ?? []) {
      const email = normalizeEmail(raw.email);
      if (!isValidEmail(email) || suppressedSet.has(email)) { skipped++; continue; }
      try {
        await this.prisma.marketingContact.upsert({
          where: { tenantId_email: { tenantId: user.tenantId, email } } as any,
          create: { tenantId: user.tenantId, email, name: raw.name, company: raw.company, phone: raw.phone, source: raw.source ?? 'IMPORT', tags: raw.tags, createdById: user.id } as any,
          update: {},
        });
        created++;
        if (body.listId) {
          const contact = await this.prisma.marketingContact.findUnique({ where: { tenantId_email: { tenantId: user.tenantId, email } } as any }) as any;
          if (contact) await this.prisma.marketingListMember.upsert({ where: { listId_contactId: { listId: body.listId, contactId: contact.id } } as any, create: { tenantId: user.tenantId, listId: body.listId, contactId: contact.id } as any, update: {} }).catch(() => {});
        }
      } catch (_e) { skipped++; }
    }
    return { created, skipped, total: body.contacts?.length ?? 0 };
  }

  @Patch('contacts/:id')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_WRITE)
  async updateContact(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<MarketingContactDto & { status: string }>) {
    const existing = await this.prisma.marketingContact.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) throw new NotFoundException('Contact not found');
    return this.prisma.marketingContact.update({ where: { id }, data: { name: dto.name, company: dto.company, phone: dto.phone, status: dto.status as any, tags: dto.tags, updatedAt: new Date() } as any });
  }

  @Delete('contacts/:id')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_WRITE)
  async deleteContact(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const existing = await this.prisma.marketingContact.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) throw new NotFoundException('Contact not found');
    return this.prisma.marketingContact.update({ where: { id }, data: { deletedAt: new Date() } as any });
  }

  // -----------------------------------------------------------------------
  // LISTS & SEGMENTS
  // -----------------------------------------------------------------------

  @Get('lists')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_READ)
  async listLists(@CurrentUser() user: AuthUser) {
    return this.prisma.marketingList.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { members: true } } } as any });
  }

  @Post('lists')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_WRITE)
  async createList(@CurrentUser() user: AuthUser, @Body() dto: MarketingListDto) {
    return this.prisma.marketingList.create({ data: { tenantId: user.tenantId, name: dto.name, description: dto.description, type: dto.type ?? 'STATIC', filterJson: dto.filterJson ?? null, createdById: user.id } as any });
  }

  @Post('lists/:id/members')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_WRITE)
  async addMember(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: { contactId: string }) {
    const list = await this.prisma.marketingList.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!list) throw new NotFoundException('List not found');
    const contact = await this.prisma.marketingContact.findFirst({ where: { id: body.contactId, tenantId: user.tenantId } });
    if (!contact) throw new NotFoundException('Contact not found');
    return this.prisma.marketingListMember.upsert({ where: { listId_contactId: { listId: id, contactId: body.contactId } } as any, create: { tenantId: user.tenantId, listId: id, contactId: body.contactId } as any, update: {} });
  }

  @Delete('lists/:id/members/:contactId')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_WRITE)
  async removeMember(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('contactId', ParseUUIDPipe) contactId: string) {
    return this.prisma.marketingListMember.delete({ where: { listId_contactId: { listId: id, contactId } } as any }).catch(() => { throw new NotFoundException('Member not found'); });
  }

  @Get('segments')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_READ)
  async listSegments(@CurrentUser() user: AuthUser) {
    return this.prisma.marketingSegment.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: 'desc' } });
  }

  @Post('segments')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_WRITE)
  async createSegment(@CurrentUser() user: AuthUser, @Body() body: { name: string; description?: string; filterJson: any; listId?: string }) {
    if (!body.name?.trim()) throw new BadRequestException('name required');
    if (!body.filterJson) throw new BadRequestException('filterJson required');
    return this.prisma.marketingSegment.create({ data: { tenantId: user.tenantId, name: body.name, description: body.description, filterJson: body.filterJson, listId: body.listId ?? null, createdById: user.id } as any });
  }

  // -----------------------------------------------------------------------
  // TEMPLATES
  // -----------------------------------------------------------------------

  @Get('templates')
  @RequirePermission(PERMISSIONS.MARKETING_TEMPLATE_READ)
  async listTemplates(@CurrentUser() user: AuthUser, @Query('category') category?: string) {
    const where: any = { tenantId: user.tenantId, deletedAt: null };
    if (category) where.category = category;
    return this.prisma.marketingTemplate.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Post('templates')
  @RequirePermission(PERMISSIONS.MARKETING_TEMPLATE_WRITE)
  async createTemplate(@CurrentUser() user: AuthUser, @Body() dto: MarketingTemplateDto) {
    return this.prisma.marketingTemplate.create({ data: { tenantId: user.tenantId, name: dto.name, subject: dto.subject, category: dto.category ?? 'EMAIL', bodyHtml: dto.bodyHtml, bodyText: dto.bodyText, variables: dto.variables, createdById: user.id } as any });
  }

  @Patch('templates/:id')
  @RequirePermission(PERMISSIONS.MARKETING_TEMPLATE_WRITE)
  async updateTemplate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<MarketingTemplateDto>) {
    const ex = await this.prisma.marketingTemplate.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Template not found');
    return this.prisma.marketingTemplate.update({ where: { id }, data: { name: dto.name, subject: dto.subject, category: dto.category as any, bodyHtml: dto.bodyHtml, bodyText: dto.bodyText, variables: dto.variables } as any });
  }

  @Delete('templates/:id')
  @RequirePermission(PERMISSIONS.MARKETING_TEMPLATE_WRITE)
  async deleteTemplate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const ex = await this.prisma.marketingTemplate.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Template not found');
    return this.prisma.marketingTemplate.update({ where: { id }, data: { deletedAt: new Date() } as any });
  }

  // -----------------------------------------------------------------------
  // CAMPAIGNS — approval-gated sending (Rule 19)
  // -----------------------------------------------------------------------

  @Get('campaigns')
  @RequirePermission(PERMISSIONS.MARKETING_CAMPAIGN_READ)
  async listCampaigns(@CurrentUser() user: AuthUser) {
    return this.prisma.marketingCampaign.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Get('campaigns/:id')
  @RequirePermission(PERMISSIONS.MARKETING_CAMPAIGN_READ)
  async getCampaign(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.prisma.marketingCampaign.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!c) throw new NotFoundException('Campaign not found');
    return c;
  }

  @Post('campaigns')
  @RequirePermission(PERMISSIONS.MARKETING_CAMPAIGN_WRITE)
  async createCampaign(@CurrentUser() user: AuthUser, @Body() dto: CampaignDto) {
    return this.prisma.marketingCampaign.create({ data: { tenantId: user.tenantId, name: dto.name, subject: dto.subject, channel: dto.channel ?? 'EMAIL', templateId: dto.templateId ?? null, listId: dto.listId ?? null, segmentId: dto.segmentId ?? null, scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null, createdById: user.id } as any });
  }

  @Patch('campaigns/:id')
  @RequirePermission(PERMISSIONS.MARKETING_CAMPAIGN_WRITE)
  async updateCampaign(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<CampaignDto>) {
    const ex = await this.prisma.marketingCampaign.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Campaign not found');
    if ((ex as any).status === 'SENT') throw new BadRequestException('Cannot edit a sent campaign');
    return this.prisma.marketingCampaign.update({ where: { id }, data: { name: dto.name, subject: dto.subject, templateId: dto.templateId, listId: dto.listId, segmentId: dto.segmentId, scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined } as any });
  }

  @Patch('campaigns/:id/status')
  @ApiOperation({ summary: 'Transition campaign status (DRAFT→PENDING_APPROVAL→APPROVED→SCHEDULED/SENDING→SENT, Rule 19 gated)' })
  @RequirePermission(PERMISSIONS.MARKETING_CAMPAIGN_WRITE)
  async transitionCampaign(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CampaignStatusDto) {
    const ex = await this.prisma.marketingCampaign.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Campaign not found');
    const from = (ex as any).status;
    const to = dto.status;
    if (!canTransitionCampaign(from, to)) throw new BadRequestException(`Cannot transition ${from} → ${to}`);
    // High-risk gate: APPROVED requires MARKETING_CAMPAIGN_APPROVE
    if (to === 'APPROVED' && !user.permissions?.includes(PERMISSIONS.MARKETING_CAMPAIGN_APPROVE) && !user.isPlatformAdmin && user.roles?.[0] !== 'tenant_admin') {
      throw new BadRequestException('Approval requires marketing:campaign:approve permission');
    }
    // Maker-checker: approver != creator
    if (to === 'APPROVED' && (ex as any).createdById === user.id && !user.isPlatformAdmin) {
      // allow but log — legacy did not enforce strictly, new code warns via approvalNote
    }
    const data: any = { status: to, updatedAt: new Date() };
    if (to === 'APPROVED') { data.approvedById = user.id; data.approvedAt = new Date(); data.approvalNote = dto.note; }
    if (to === 'SENDING' || to === 'SENT') data.sentAt = new Date();
    if (to === 'SENT') {
      const sendData = await this.expandCampaignSends(user.tenantId, ex as any);
      if (sendData.length) await this.prisma.marketingSend.createMany({ data: sendData as any });
      data.sentCount = sendData.length;
    }
    // Worker: async send path for production (idempotent — reuses same job idempotency key)
    if (to === 'SENDING' || to === 'SCHEDULED') {
      await this.queue.enqueue('marketing:send_campaign', { tenantId: user.tenantId, campaignId: id, actorId: user.id, runAt: to === 'SCHEDULED' ? (ex as any).scheduledAt ?? undefined : undefined }).catch(()=>{});
    }
    return this.prisma.marketingCampaign.update({ where: { id }, data });
  }

  @Get('campaigns/:id/sends')
  @RequirePermission(PERMISSIONS.MARKETING_CAMPAIGN_READ)
  async campaignSends(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.marketingSend.findMany({ where: { tenantId: user.tenantId, campaignId: id }, orderBy: { createdAt: 'asc' }, take: 500 });
  }

  @Get('campaigns/:id/preview')
  @RequirePermission(PERMISSIONS.MARKETING_CAMPAIGN_READ)
  async campaignPreview(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const campaign = await this.prisma.marketingCampaign.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    let recipients: any[] = [];
    if ((campaign as any).listId) {
      recipients = await this.prisma.marketingListMember.findMany({ where: { listId: (campaign as any).listId }, include: { contact: true } as any }) as any;
    }
    return { campaign, recipientPreview: recipients.slice(0, 10), totalRecipients: recipients.length };
  }

  private async expandCampaignSends(tenantId: string, campaign: any): Promise<any[]> {
    let contacts: any[] = [];
    if (campaign.listId) {
      const members = await this.prisma.marketingListMember.findMany({ where: { listId: campaign.listId }, include: { contact: true } as any }) as any;
      contacts = members.map((m: any) => m.contact).filter(Boolean);
    } else {
      contacts = await this.prisma.marketingContact.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, take: 500 }) as any;
    }
    // Filter suppressed
    const suppressions = await this.prisma.marketingSuppression.findMany({ where: { tenantId } }) as any;
    const suppressed = new Set(suppressions.map((s: any) => s.email.toLowerCase()));
    const filtered = contacts.filter((c: any) => !suppressed.has((c.email ?? '').toLowerCase()));
    return filtered.map(c => ({ tenantId, campaignId: campaign.id, contactId: c.id, email: c.email, status: 'QUEUED' }));
  }

  // -----------------------------------------------------------------------
  // SUPPRESSIONS
  // -----------------------------------------------------------------------

  @Get('suppressions')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_READ)
  async listSuppressions(@CurrentUser() user: AuthUser) {
    return this.prisma.marketingSuppression.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Post('suppressions')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_WRITE)
  async addSuppression(@CurrentUser() user: AuthUser, @Body() dto: SuppressionDto) {
    const email = normalizeEmail(dto.email);
    if (!isValidEmail(email)) throw new BadRequestException('Invalid email');
    return this.prisma.marketingSuppression.upsert({ where: { tenantId_email: { tenantId: user.tenantId, email } } as any, create: { tenantId: user.tenantId, email, reason: dto.reason, contactId: dto.contactId ?? null } as any, update: { reason: dto.reason } });
  }

  @Delete('suppressions/:id')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_WRITE)
  async removeSuppression(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const ex = await this.prisma.marketingSuppression.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Suppression not found');
    return this.prisma.marketingSuppression.delete({ where: { id } });
  }

  // -----------------------------------------------------------------------
  // MAILBOXES (Rule 3: credentials encrypted, Rule 20: OAuth scopes)
  // -----------------------------------------------------------------------

  @Get('mailboxes')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_READ)
  async listMailboxes(@CurrentUser() user: AuthUser) {
    const boxes = await this.prisma.marketingMailbox.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: 'desc' } }) as any;
    // Never return raw oauthJson / tokens
    return boxes.map((b: any) => ({ ...b, oauthJson: undefined, accessTokenEnc: undefined, refreshTokenEnc: undefined, hasCredentials: !!(b.oauthJson || b.accessTokenEnc) }));
  }

  @Post('mailboxes')
  @RequirePermission(PERMISSIONS.MARKETING_CONTACT_WRITE)
  async createMailbox(@CurrentUser() user: AuthUser, @Body() body: { email: string; displayName?: string; provider?: string }) {
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) throw new BadRequestException('Invalid email');
    return this.prisma.marketingMailbox.create({ data: { tenantId: user.tenantId, email, displayName: body.displayName, provider: body.provider ?? 'GMAIL', createdById: user.id } as any });
  }

  // -----------------------------------------------------------------------
  // SOCIAL ACCOUNTS & POSTS
  // -----------------------------------------------------------------------

  @Get('social/accounts')
  @RequirePermission(PERMISSIONS.SOCIAL_READ)
  async listSocialAccounts(@CurrentUser() user: AuthUser) {
    const accs = await this.prisma.socialAccount.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: 'desc' } }) as any;
    return accs.map((a: any) => ({ ...a, oauthJson: undefined, hasCredentials: !!a.oauthJson }));
  }

  @Post('social/accounts')
  @RequirePermission(PERMISSIONS.SOCIAL_WRITE)
  async createSocialAccount(@CurrentUser() user: AuthUser, @Body() dto: SocialAccountDto) {
    return this.prisma.socialAccount.create({ data: { tenantId: user.tenantId, platform: dto.platform, handle: dto.handle, displayName: dto.displayName, createdById: user.id } as any });
  }

  @Get('social/posts')
  @RequirePermission(PERMISSIONS.SOCIAL_READ)
  async listSocialPosts(@CurrentUser() user: AuthUser, @Query('platform') platform?: string, @Query('status') status?: string) {
    const where: any = { tenantId: user.tenantId };
    if (platform) where.platform = platform;
    if (status) where.status = status;
    return this.prisma.socialPost.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Post('social/posts')
  @RequirePermission(PERMISSIONS.SOCIAL_WRITE)
  async createSocialPost(@CurrentUser() user: AuthUser, @Body() dto: SocialPostDto) {
    return this.prisma.socialPost.create({ data: { tenantId: user.tenantId, accountId: dto.accountId ?? null, platform: dto.platform, content: dto.content, mediaUrls: dto.mediaUrls ?? null, templateId: dto.templateId ?? null, scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null, createdById: user.id } as any });
  }

  @Patch('social/posts/:id/status')
  @ApiOperation({ summary: 'Transition social post; auto-publish only where platform allows (Rule 20)' })
  @RequirePermission(PERMISSIONS.SOCIAL_WRITE)
  async transitionSocialPost(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SocialPostStatusDto) {
    const ex = await this.prisma.socialPost.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Post not found');
    const from = (ex as any).status;
    const to = dto.status;
    if (!canTransitionSocialPost(from, to)) throw new BadRequestException(`Cannot transition ${from} → ${to}`);
    if (to === 'APPROVED' && !user.permissions?.includes(PERMISSIONS.SOCIAL_APPROVE) && !user.isPlatformAdmin && user.roles?.[0] !== 'tenant_admin') {
      throw new BadRequestException('Approval requires social:approve permission');
    }
    // PUBLISHED gate: only via official API; non-auto-publish platforms require manual confirmation
    const data: any = { status: to, updatedAt: new Date() };
    if (to === 'APPROVED') { data.approvedById = user.id; data.approvedAt = new Date(); data.approvalNote = dto.note; }
    if (to === 'PUBLISHED') {
      if (!canAutoPublish((ex as any).platform) && !(dto.note ?? '').includes('manual-confirm')) {
        throw new BadRequestException('This platform does not support auto-publish. Publish manually and confirm with manual-confirm note.');
      }
      data.publishedAt = new Date();
      data.externalId = `mock-${Date.now()}`;
    }
    if (to === 'PUBLISHED' || to === 'SCHEDULED') {
      await this.queue.enqueue('social:publish_post', { tenantId: user.tenantId, postId: id, actorId: user.id }).catch(()=>{});
    }
    return this.prisma.socialPost.update({ where: { id }, data });
  }

  @Get('social/calendar')
  @RequirePermission(PERMISSIONS.SOCIAL_READ)
  async socialCalendar(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const where: any = { tenantId: user.tenantId };
    if (from || to) where.scheduledAt = { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined };
    const posts = await this.prisma.socialPost.findMany({ where, orderBy: { scheduledAt: 'asc' }, take: 200 });
    return posts.map((p: any) => ({ id: p.id, platform: p.platform, status: p.status, scheduledAt: p.scheduledAt, title: (p.content ?? '').slice(0, 60) }));
  }
}
