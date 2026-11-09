-- Phase 7: Marketing, Reports, AI & Creative Studio
-- All tables tenant-isolated. Enums match Prisma schema.

CREATE TYPE "MarketingContactStatus" AS ENUM ('ACTIVE','UNSUBSCRIBED','BOUNCED','INVALID');
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','SCHEDULED','SENDING','SENT','CANCELLED');
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','SCHEDULED','PUBLISHED','FAILED','CANCELLED');
CREATE TYPE "MomStatus" AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
CREATE TYPE "AiToolStatus" AS ENUM ('PENDING_APPROVAL','APPROVED','REJECTED','EXECUTED','FAILED');
CREATE TYPE "CreativeStatus" AS ENUM ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','ARCHIVED');

-- Marketing Contacts
CREATE TABLE "marketing_contacts" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "company" TEXT,
  "phone" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "status" "MarketingContactStatus" NOT NULL DEFAULT 'ACTIVE',
  "tags" TEXT,
  "customJson" JSONB,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ(3)
);
CREATE UNIQUE INDEX "marketing_contacts_tenant_email_unique" ON "marketing_contacts"("tenantId","email");
CREATE INDEX "marketing_contacts_tenant_status_idx" ON "marketing_contacts"("tenantId","status");
CREATE INDEX "marketing_contacts_tenant_source_idx" ON "marketing_contacts"("tenantId","source");

-- Marketing Lists
CREATE TABLE "marketing_lists" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL DEFAULT 'STATIC',
  "filterJson" JSONB,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "marketing_lists_tenant_name_unique" ON "marketing_lists"("tenantId","name");
CREATE INDEX "marketing_lists_tenant_idx" ON "marketing_lists"("tenantId");

-- List Members
CREATE TABLE "marketing_list_members" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "listId" UUID NOT NULL REFERENCES "marketing_lists"("id") ON DELETE CASCADE,
  "contactId" UUID NOT NULL REFERENCES "marketing_contacts"("id") ON DELETE CASCADE,
  "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "marketing_list_members_list_contact_unique" ON "marketing_list_members"("listId","contactId");
CREATE INDEX "marketing_list_members_tenant_list_idx" ON "marketing_list_members"("tenantId","listId");

-- Segments
CREATE TABLE "marketing_segments" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "listId" UUID REFERENCES "marketing_lists"("id") ON DELETE SET NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "filterJson" JSONB NOT NULL,
  "countCache" INTEGER NOT NULL DEFAULT 0,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "marketing_segments_tenant_name_unique" ON "marketing_segments"("tenantId","name");
CREATE INDEX "marketing_segments_tenant_list_idx" ON "marketing_segments"("tenantId","listId");

-- Templates
CREATE TABLE "marketing_templates" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT,
  "category" TEXT NOT NULL DEFAULT 'EMAIL',
  "bodyHtml" TEXT,
  "bodyText" TEXT,
  "variables" TEXT,
  "thumbnail" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ(3)
);
CREATE UNIQUE INDEX "marketing_templates_tenant_name_unique" ON "marketing_templates"("tenantId","name");
CREATE INDEX "marketing_templates_tenant_category_idx" ON "marketing_templates"("tenantId","category");

-- Campaigns
CREATE TABLE "marketing_campaigns" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'EMAIL',
  "templateId" UUID,
  "listId" UUID,
  "segmentId" UUID,
  "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMPTZ(3),
  "sentAt" TIMESTAMPTZ(3),
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "openCount" INTEGER NOT NULL DEFAULT 0,
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "bounceCount" INTEGER NOT NULL DEFAULT 0,
  "approvalNote" TEXT,
  "approvedById" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "marketing_campaigns_tenant_status_idx" ON "marketing_campaigns"("tenantId","status");
CREATE INDEX "marketing_campaigns_tenant_channel_idx" ON "marketing_campaigns"("tenantId","channel");

-- Sends
CREATE TABLE "marketing_sends" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "campaignId" UUID NOT NULL REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE,
  "contactId" UUID,
  "email" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "sentAt" TIMESTAMPTZ(3),
  "openedAt" TIMESTAMPTZ(3),
  "clickedAt" TIMESTAMPTZ(3),
  "errorMsg" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "marketing_sends_tenant_campaign_idx" ON "marketing_sends"("tenantId","campaignId");
CREATE INDEX "marketing_sends_tenant_email_idx" ON "marketing_sends"("tenantId","email");

-- Suppressions
CREATE TABLE "marketing_suppressions" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "contactId" UUID REFERENCES "marketing_contacts"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "marketing_suppressions_tenant_email_unique" ON "marketing_suppressions"("tenantId","email");
CREATE INDEX "marketing_suppressions_tenant_idx" ON "marketing_suppressions"("tenantId");

-- Mailboxes
CREATE TABLE "marketing_mailboxes" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'GMAIL',
  "oauthJson" TEXT,
  "accessTokenEnc" TEXT,
  "refreshTokenEnc" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "lastSyncAt" TIMESTAMPTZ(3),
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "marketing_mailboxes_tenant_email_unique" ON "marketing_mailboxes"("tenantId","email");
CREATE INDEX "marketing_mailboxes_tenant_idx" ON "marketing_mailboxes"("tenantId");

-- Social Accounts
CREATE TABLE "social_accounts" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "platform" TEXT NOT NULL,
  "handle" TEXT NOT NULL,
  "displayName" TEXT,
  "oauthJson" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "social_accounts_tenant_platform_handle_unique" ON "social_accounts"("tenantId","platform","handle");
CREATE INDEX "social_accounts_tenant_idx" ON "social_accounts"("tenantId");

-- Social Posts
CREATE TABLE "social_posts" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "accountId" UUID REFERENCES "social_accounts"("id") ON DELETE SET NULL,
  "platform" TEXT NOT NULL DEFAULT 'LINKEDIN',
  "content" TEXT NOT NULL,
  "mediaUrls" TEXT,
  "templateId" UUID,
  "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMPTZ(3),
  "publishedAt" TIMESTAMPTZ(3),
  "externalId" TEXT,
  "approvalNote" TEXT,
  "approvedById" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "social_posts_tenant_status_idx" ON "social_posts"("tenantId","status");
CREATE INDEX "social_posts_tenant_platform_idx" ON "social_posts"("tenantId","platform");

-- Daily Reports
CREATE TABLE "daily_reports" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "reportDate" DATE NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "metricsJson" JSONB,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "daily_reports_tenant_date_unique" ON "daily_reports"("tenantId","reportDate");
CREATE INDEX "daily_reports_tenant_date_idx" ON "daily_reports"("tenantId","reportDate");

-- MOM Meetings
CREATE TABLE "mom_meetings" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "meetingDate" DATE NOT NULL,
  "location" TEXT,
  "chairpersonId" UUID,
  "status" "MomStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "templateId" UUID,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "mom_meetings_tenant_date_idx" ON "mom_meetings"("tenantId","meetingDate");
CREATE INDEX "mom_meetings_tenant_status_idx" ON "mom_meetings"("tenantId","status");

-- MOM Participants
CREATE TABLE "mom_participants" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "meetingId" UUID NOT NULL REFERENCES "mom_meetings"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "role" TEXT,
  "present" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "mom_participants_tenant_meeting_idx" ON "mom_participants"("tenantId","meetingId");

-- MOM Agendas
CREATE TABLE "mom_agendas" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "meetingId" UUID NOT NULL REFERENCES "mom_meetings"("id") ON DELETE CASCADE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "topic" TEXT NOT NULL,
  "owner" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "mom_agendas_tenant_meeting_idx" ON "mom_agendas"("tenantId","meetingId");

-- MOM Decisions
CREATE TABLE "mom_decisions" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "meetingId" UUID NOT NULL REFERENCES "mom_meetings"("id") ON DELETE CASCADE,
  "decision" TEXT NOT NULL,
  "owner" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "mom_decisions_tenant_meeting_idx" ON "mom_decisions"("tenantId","meetingId");

-- MOM Actions
CREATE TABLE "mom_actions" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "meetingId" UUID NOT NULL REFERENCES "mom_meetings"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "assigneeId" UUID,
  "assigneeName" TEXT,
  "dueDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "mom_actions_tenant_meeting_idx" ON "mom_actions"("tenantId","meetingId");
CREATE INDEX "mom_actions_tenant_assignee_idx" ON "mom_actions"("tenantId","assigneeId");

-- Report Snapshots
CREATE TABLE "report_snapshots" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "reportType" TEXT NOT NULL,
  "periodFrom" DATE,
  "periodTo" DATE,
  "dataJson" JSONB NOT NULL,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "report_snapshots_tenant_type_created_idx" ON "report_snapshots"("tenantId","reportType","createdAt");

-- AI Conversations
CREATE TABLE "ai_conversations" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "title" TEXT,
  "userId" UUID NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'OPENAI',
  "model" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "ai_conversations_tenant_user_idx" ON "ai_conversations"("tenantId","userId");
CREATE INDEX "ai_conversations_tenant_status_idx" ON "ai_conversations"("tenantId","status");

-- AI Messages
CREATE TABLE "ai_messages" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "conversationId" UUID NOT NULL REFERENCES "ai_conversations"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "toolName" TEXT,
  "toolArgsJson" JSONB,
  "tokensIn" INTEGER NOT NULL DEFAULT 0,
  "tokensOut" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "ai_messages_tenant_conversation_idx" ON "ai_messages"("tenantId","conversationId");

-- AI Tool Calls
CREATE TABLE "ai_tool_calls" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "messageId" UUID REFERENCES "ai_messages"("id") ON DELETE SET NULL,
  "toolName" TEXT NOT NULL,
  "argsJson" JSONB NOT NULL,
  "resultJson" JSONB,
  "status" "AiToolStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "requestedById" UUID,
  "approvedById" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "rejectedById" UUID,
  "rejectedAt" TIMESTAMPTZ(3),
  "rejectReason" TEXT,
  "executedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "ai_tool_calls_tenant_status_idx" ON "ai_tool_calls"("tenantId","status");
CREATE INDEX "ai_tool_calls_tenant_conversation_idx" ON "ai_tool_calls"("tenantId","conversationId");

-- AI Provider Configs
CREATE TABLE "ai_provider_configs" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID,
  "provider" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "apiKeyEnc" TEXT,
  "model" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "configJson" JSONB,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "ai_provider_configs_tenant_provider_unique" ON "ai_provider_configs"("tenantId","provider");

-- Creative Projects
CREATE TABLE "creative_projects" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'OTHER',
  "status" "CreativeStatus" NOT NULL DEFAULT 'DRAFT',
  "contentJson" JSONB,
  "thumbnail" TEXT,
  "templateId" UUID,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ(3)
);
CREATE INDEX "creative_projects_tenant_status_idx" ON "creative_projects"("tenantId","status");
CREATE INDEX "creative_projects_tenant_type_idx" ON "creative_projects"("tenantId","type");

-- Creative Assets
CREATE TABLE "creative_assets" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "projectId" UUID REFERENCES "creative_projects"("id") ON DELETE SET NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "storageKey" TEXT,
  "url" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "creative_assets_tenant_project_idx" ON "creative_assets"("tenantId","projectId");
