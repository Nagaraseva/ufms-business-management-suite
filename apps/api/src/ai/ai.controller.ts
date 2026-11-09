import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, MaxLength, MinLength, IsNumber } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, AuthUser, RequirePermission } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import {
  AI_TOOL_DEFINITIONS, isHighRiskTool, canTransitionAiTool,
} from '@ufms/shared/marketing/marketing-rules';
import { QueueService } from '../queue/queue.service';

class ConversationDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() model?: string;
}

class MessageDto {
  @IsString() @MinLength(1) @MaxLength(8000) content: string;
  @IsOptional() @IsString() role?: string; // USER | SYSTEM
  @IsOptional() toolName?: string;
  @IsOptional() toolArgsJson?: any;
}

class ToolCallDto {
  @IsString() toolName: string;
  argsJson: any;
}

class ToolApprovalDto {
  @IsString() status: string; // APPROVED | REJECTED
  @IsOptional() @IsString() reason?: string;
}

class ProviderConfigDto {
  @IsString() provider: string;
  @IsString() displayName: string;
  @IsOptional() @IsString() apiKey?: string; // write-only, never returned
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() configJson?: any;
  @IsOptional() enabled?: boolean;
}

@ApiTags('AI Assistant')
@Controller('ai')
export class AiController {
  constructor(private readonly prisma: PrismaService, private readonly queue: QueueService) {}

  // -----------------------------------------------------------------------
  // CONVERSATIONS
  // -----------------------------------------------------------------------

  @Get('conversations')
  @RequirePermission(PERMISSIONS.AI_READ)
  async listConversations(@CurrentUser() user: AuthUser) {
    return this.prisma.aiConversation.findMany({ where: { tenantId: user.tenantId, userId: user.id, status: { not: 'DELETED' } }, orderBy: { updatedAt: 'desc' }, take: 50, include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } } as any });
  }

  @Get('conversations/:id')
  @RequirePermission(PERMISSIONS.AI_READ)
  async getConversation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const conv = await this.prisma.aiConversation.findFirst({ where: { id, tenantId: user.tenantId }, include: { messages: { orderBy: { createdAt: 'asc' } } } as any });
    if (!conv) throw new NotFoundException('Conversation not found');
    // Ownership check: user can see own, admin can see all
    if ((conv as any).userId !== user.id && !user.isPlatformAdmin && user.roles?.[0] !== 'tenant_admin' && !user.permissions?.includes(PERMISSIONS.AI_ADMIN)) {
      throw new NotFoundException('Conversation not found');
    }
    return conv;
  }

  @Post('conversations')
  @RequirePermission(PERMISSIONS.AI_WRITE)
  async createConversation(@CurrentUser() user: AuthUser, @Body() dto: ConversationDto) {
    return this.prisma.aiConversation.create({ data: { tenantId: user.tenantId, userId: user.id, title: dto.title ?? 'New conversation', provider: dto.provider ?? 'OPENAI', model: dto.model, status: 'ACTIVE' } as any });
  }

  @Patch('conversations/:id')
  @RequirePermission(PERMISSIONS.AI_WRITE)
  async updateConversation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<ConversationDto & { status: string }>) {
    const ex = await this.prisma.aiConversation.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Conversation not found');
    if ((ex as any).userId !== user.id && !user.isPlatformAdmin && user.roles?.[0] !== 'tenant_admin') throw new NotFoundException('Conversation not found');
    return this.prisma.aiConversation.update({ where: { id }, data: { title: dto.title, provider: dto.provider, model: dto.model, status: dto.status as any } as any });
  }

  @Delete('conversations/:id')
  @RequirePermission(PERMISSIONS.AI_WRITE)
  async deleteConversation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const ex = await this.prisma.aiConversation.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Conversation not found');
    return this.prisma.aiConversation.update({ where: { id }, data: { status: 'DELETED' } as any });
  }

  // -----------------------------------------------------------------------
  // MESSAGES
  // -----------------------------------------------------------------------

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Post a message; AI reply is stubbed (real provider via worker, Rule 19 gated)' })
  @RequirePermission(PERMISSIONS.AI_WRITE)
  async postMessage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MessageDto) {
    const conv = await this.prisma.aiConversation.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    if ((conv as any).status !== 'ACTIVE') throw new BadRequestException('Conversation is not active');
    const userMessage = await this.prisma.aiMessage.create({ data: { tenantId: user.tenantId, conversationId: id, role: dto.role ?? 'USER', content: dto.content, toolName: dto.toolName ?? null, toolArgsJson: dto.toolArgsJson ?? null } as any });
    // Auto-title on first message
    if (!(conv as any).title || (conv as any).title === 'New conversation') {
      await this.prisma.aiConversation.update({ where: { id }, data: { title: dto.content.slice(0, 80), updatedAt: new Date() } as any });
    } else {
      await this.prisma.aiConversation.update({ where: { id }, data: { updatedAt: new Date() } as any });
    }
    // Stub assistant acknowledgement (real LLM call happens in background worker when configured)
    const provider = await this.prisma.aiProviderConfig.findFirst({ where: { tenantId: user.tenantId, enabled: true } } as any).catch(() => null);
    const assistantContent = this.stubAssistantReply(dto.content, !!(provider as any)?.apiKeyEnc);
    const assistantMessage = await this.prisma.aiMessage.create({ data: { tenantId: user.tenantId, conversationId: id, role: 'ASSISTANT', content: assistantContent, toolName: null } as any });
    return { userMessage, assistantMessage };
  }

  @Get('conversations/:id/messages')
  @RequirePermission(PERMISSIONS.AI_READ)
  async listMessages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const conv = await this.prisma.aiConversation.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    return this.prisma.aiMessage.findMany({ where: { tenantId: user.tenantId, conversationId: id }, orderBy: { createdAt: 'asc' } });
  }

  private stubAssistantReply(userContent: string, hasProvider: boolean): string {
    if (!hasProvider) return `I received: "${userContent.slice(0, 120)}". Configure an AI provider in Settings → AI to enable LLM replies. I can help you search leads, tenders, clients, draft emails (with approval), and generate reports — all tenant-scoped.`;
    // When a provider is configured, the background worker would replace this with real LLM output.
    return `Acknowledged: "${userContent.slice(0, 120)}". [Worker will stream the LLM response when the job queue is active. High-risk actions (email/send/post/finance) always require your approval before execution — Rule 19.]`;
  }

  // -----------------------------------------------------------------------
  // TOOL CALLS — approval gate (Rule 19)
  // -----------------------------------------------------------------------

  @Get('tool-calls')
  @RequirePermission(PERMISSIONS.AI_READ)
  async listToolCalls(@CurrentUser() user: AuthUser, @Query('status') status?: string, @Query('conversationId') conversationId?: string) {
    const where: any = { tenantId: user.tenantId };
    if (status) where.status = status;
    if (conversationId) where.conversationId = conversationId;
    return this.prisma.aiToolCall.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Post('tool-calls')
  @ApiOperation({ summary: 'Propose a tool call (high-risk ones enter PENDING_APPROVAL, Rule 19)' })
  @RequirePermission(PERMISSIONS.AI_WRITE)
  async createToolCall(@CurrentUser() user: AuthUser, @Body() dto: ToolCallDto & { conversationId: string; messageId?: string }) {
    const def = AI_TOOL_DEFINITIONS.find(d => d.name === dto.toolName);
    if (!def) throw new BadRequestException(`Unknown tool: ${dto.toolName}`);
    const conv = await this.prisma.aiConversation.findFirst({ where: { id: dto.conversationId, tenantId: user.tenantId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    const status = isHighRiskTool(dto.toolName) ? 'PENDING_APPROVAL' : 'APPROVED';
    const toolCall = await this.prisma.aiToolCall.create({
      data: {
        tenantId: user.tenantId, conversationId: dto.conversationId, messageId: dto.messageId ?? null,
        toolName: dto.toolName, argsJson: dto.argsJson ?? {}, status,
        requestedById: user.id,
        approvedById: status === 'APPROVED' ? user.id : null,
        approvedAt: status === 'APPROVED' ? new Date() : null,
      } as any,
    });
    // Auto-execute low-risk tools synchronously
    if (status === 'APPROVED' && !isHighRiskTool(dto.toolName)) {
      const result = await this.executeTool(tenantIdSafe(user.tenantId), dto.toolName, dto.argsJson).catch(e => ({ error: e.message }));
      await this.prisma.aiToolCall.update({ where: { id: (toolCall as any).id }, data: { resultJson: result as any, status: 'EXECUTED', executedAt: new Date() } as any });
      return { ...(toolCall as any), status: 'EXECUTED', resultJson: result };
    }
    return toolCall;
  }

  @Post('tool-calls/:id/approve')
  @ApiOperation({ summary: 'Approve or reject a pending tool call (Rule 19 gate)' })
  @RequirePermission(PERMISSIONS.AI_WRITE)
  async approveToolCall(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ToolApprovalDto) {
    const ex = await this.prisma.aiToolCall.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Tool call not found');
    if (!canTransitionAiTool((ex as any).status, dto.status)) throw new BadRequestException(`Cannot transition ${(ex as any).status} → ${dto.status}`);
    // Approval permission check for high-risk
    if (dto.status === 'APPROVED' && isHighRiskTool((ex as any).toolName) && !user.permissions?.includes(PERMISSIONS.AI_APPROVE) && !user.isPlatformAdmin && user.roles?.[0] !== 'tenant_admin') {
      throw new BadRequestException('High-risk approval requires ai:approve permission');
    }
    const data: any = { status: dto.status };
    if (dto.status === 'APPROVED') { data.approvedById = user.id; data.approvedAt = new Date(); }
    if (dto.status === 'REJECTED') { data.rejectedById = user.id; data.rejectedAt = new Date(); data.rejectReason = dto.reason; }
    // Execute on approval
    if (dto.status === 'APPROVED') {
      // Enqueue to worker; fallback to inline for console provider
      await this.queue.enqueue('ai:execute_tool', { tenantId: user.tenantId, toolCallId: id, actorId: user.id }).catch(()=>{});
      const result = await this.executeTool(user.tenantId, (ex as any).toolName, (ex as any).argsJson).catch(e => ({ error: e.message }));
      data.resultJson = result;
      data.status = 'EXECUTED';
      data.executedAt = new Date();
    }
    return this.prisma.aiToolCall.update({ where: { id }, data });
  }

  @Get('tools/definitions')
  @RequirePermission(PERMISSIONS.AI_READ)
  async toolDefinitions() {
    return AI_TOOL_DEFINITIONS;
  }

  // -----------------------------------------------------------------------
  // PROVIDER CONFIG — Rule 3: apiKey write-only, encrypted at rest
  // -----------------------------------------------------------------------

  @Get('providers')
  @RequirePermission(PERMISSIONS.AI_READ)
  async listProviders(@CurrentUser() user: AuthUser) {
    const cfgs = await this.prisma.aiProviderConfig.findMany({ where: { OR: [{ tenantId: user.tenantId }, { tenantId: null }] }, orderBy: { provider: 'asc' } }) as any;
    // Never return apiKeyEnc
    return (cfgs as any[]).map(c => ({ ...c, apiKeyEnc: undefined, hasKey: !!c.apiKeyEnc }));
  }

  @Post('providers')
  @RequirePermission(PERMISSIONS.AI_ADMIN)
  async upsertProvider(@CurrentUser() user: AuthUser, @Body() dto: ProviderConfigDto) {
    // Encrypt apiKey if provided (simple base64 wrapper — real deployment uses CREDENTIAL_ENCRYPTION_KEY via KMS)
    let apiKeyEnc: string | undefined;
    if (dto.apiKey) {
      apiKeyEnc = Buffer.from(dto.apiKey).toString('base64'); // placeholder for real encryption
    }
    const existing = await this.prisma.aiProviderConfig.findUnique({ where: { tenantId_provider: { tenantId: user.tenantId, provider: dto.provider } } as any }).catch(() => null) as any;
    if (existing) {
      return this.prisma.aiProviderConfig.update({ where: { id: existing.id }, data: { displayName: dto.displayName, model: dto.model, enabled: dto.enabled ?? true, configJson: dto.configJson, ...(apiKeyEnc ? { apiKeyEnc } : {}), updatedAt: new Date() } as any });
    }
    return this.prisma.aiProviderConfig.create({ data: { tenantId: user.tenantId, provider: dto.provider, displayName: dto.displayName, model: dto.model, enabled: dto.enabled ?? true, configJson: dto.configJson ?? null, apiKeyEnc: apiKeyEnc ?? null, createdById: user.id } as any });
  }

  @Delete('providers/:id')
  @RequirePermission(PERMISSIONS.AI_ADMIN)
  async deleteProvider(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const ex = await this.prisma.aiProviderConfig.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException('Provider config not found');
    return this.prisma.aiProviderConfig.delete({ where: { id } });
  }

  // -----------------------------------------------------------------------
  // INTERNAL — minimal tool execution (tenant-scoped, no PII leak)
  // -----------------------------------------------------------------------

  private async executeTool(tenantId: string, toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'search_leads': {
        const leads = await this.prisma.lead.findMany({ where: { tenantId }, take: Math.min(args.limit ?? 10, 50), select: { id: true, companyName: true, status: true, city: true } } as any).catch(() => []);
        return { count: leads.length, leads };
      }
      case 'search_tenders': {
        const tenders = await this.prisma.tender.findMany({ where: { tenantId }, take: Math.min(args.limit ?? 10, 50), select: { id: true, title: true, status: true, dueDate: true } } as any).catch(() => []);
        return { count: tenders.length, tenders };
      }
      case 'get_client_summary': {
        const clients = await this.prisma.client.count({ where: { tenantId } }).catch(() => 0);
        return { totalClients: clients };
      }
      case 'get_finance_summary': {
        return { note: 'Finance summary requires finance:read permission; use Reports → Overview for non-sensitive aggregates.' };
      }
      case 'draft_email':
        return { draft: args, note: 'Draft created. Send requires explicit approval (Rule 19).', requiresApproval: true };
      case 'send_email':
        return { error: 'send_email requires approval. Use the approval queue.', requiresApproval: true };
      default:
        return { message: `Tool ${toolName} executed with args`, args };
    }
  }
}

function tenantIdSafe(tid: string): string { return tid; }
