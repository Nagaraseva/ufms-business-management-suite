-- DropForeignKey
ALTER TABLE "ai_messages" DROP CONSTRAINT "ai_messages_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "ai_tool_calls" DROP CONSTRAINT "ai_tool_calls_messageId_fkey";

-- DropForeignKey
ALTER TABLE "asset_history" DROP CONSTRAINT "asset_history_assetId_fkey";

-- DropForeignKey
ALTER TABLE "creative_assets" DROP CONSTRAINT "creative_assets_projectId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_items" DROP CONSTRAINT "invoice_items_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_payments" DROP CONSTRAINT "invoice_payments_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_accountId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_list_members" DROP CONSTRAINT "marketing_list_members_contactId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_list_members" DROP CONSTRAINT "marketing_list_members_listId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_segments" DROP CONSTRAINT "marketing_segments_listId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_sends" DROP CONSTRAINT "marketing_sends_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_suppressions" DROP CONSTRAINT "marketing_suppressions_contactId_fkey";

-- DropForeignKey
ALTER TABLE "mom_actions" DROP CONSTRAINT "mom_actions_meetingId_fkey";

-- DropForeignKey
ALTER TABLE "mom_agendas" DROP CONSTRAINT "mom_agendas_meetingId_fkey";

-- DropForeignKey
ALTER TABLE "mom_decisions" DROP CONSTRAINT "mom_decisions_meetingId_fkey";

-- DropForeignKey
ALTER TABLE "mom_participants" DROP CONSTRAINT "mom_participants_meetingId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_purchaseOrderId_fkey";

-- DropForeignKey
ALTER TABLE "social_posts" DROP CONSTRAINT "social_posts_accountId_fkey";

-- DropForeignKey
ALTER TABLE "stock_distribution_items" DROP CONSTRAINT "stock_distribution_items_stockDistributionId_fkey";

-- DropForeignKey
ALTER TABLE "stock_purchase_items" DROP CONSTRAINT "stock_purchase_items_stockPurchaseId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_bill_items" DROP CONSTRAINT "vendor_bill_items_vendorBillId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_payments" DROP CONSTRAINT "vendor_payments_vendorBillId_fkey";

-- AlterTable
ALTER TABLE "ai_conversations" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ai_messages" ALTER COLUMN "tokensIn" DROP NOT NULL,
ALTER COLUMN "tokensOut" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ai_provider_configs" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "assets" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "bank_accounts" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "creative_projects" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "daily_reports" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "indents" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "jobs" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "marketing_campaigns" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "marketing_contacts" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "marketing_lists" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "marketing_mailboxes" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "marketing_segments" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "marketing_templates" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "mom_actions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "mom_meetings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "purchase_orders" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "purchase_requests" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "social_accounts" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "social_posts" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "stock_items" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vendor_bill_items" ALTER COLUMN "taxPercent" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vendor_bills" ALTER COLUMN "subTotal" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vendors" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_items" ADD CONSTRAINT "vendor_bill_items_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "vendor_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "vendor_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_history" ADD CONSTRAINT "asset_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_purchase_items" ADD CONSTRAINT "stock_purchase_items_stockPurchaseId_fkey" FOREIGN KEY ("stockPurchaseId") REFERENCES "stock_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_distribution_items" ADD CONSTRAINT "stock_distribution_items_stockDistributionId_fkey" FOREIGN KEY ("stockDistributionId") REFERENCES "stock_distributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_list_members" ADD CONSTRAINT "marketing_list_members_listId_fkey" FOREIGN KEY ("listId") REFERENCES "marketing_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_list_members" ADD CONSTRAINT "marketing_list_members_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "marketing_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_segments" ADD CONSTRAINT "marketing_segments_listId_fkey" FOREIGN KEY ("listId") REFERENCES "marketing_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_sends" ADD CONSTRAINT "marketing_sends_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_suppressions" ADD CONSTRAINT "marketing_suppressions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "marketing_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_participants" ADD CONSTRAINT "mom_participants_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "mom_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_agendas" ADD CONSTRAINT "mom_agendas_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "mom_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_decisions" ADD CONSTRAINT "mom_decisions_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "mom_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_actions" ADD CONSTRAINT "mom_actions_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "mom_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ai_conversations_tenant_status_idx" RENAME TO "ai_conversations_tenantId_status_idx";

-- RenameIndex
ALTER INDEX "ai_conversations_tenant_user_idx" RENAME TO "ai_conversations_tenantId_userId_idx";

-- RenameIndex
ALTER INDEX "ai_messages_tenant_conversation_idx" RENAME TO "ai_messages_tenantId_conversationId_idx";

-- RenameIndex
ALTER INDEX "ai_provider_configs_tenant_provider_unique" RENAME TO "ai_provider_configs_tenantId_provider_key";

-- RenameIndex
ALTER INDEX "ai_tool_calls_tenant_conversation_idx" RENAME TO "ai_tool_calls_tenantId_conversationId_idx";

-- RenameIndex
ALTER INDEX "ai_tool_calls_tenant_status_idx" RENAME TO "ai_tool_calls_tenantId_status_idx";

-- RenameIndex
ALTER INDEX "creative_assets_tenant_project_idx" RENAME TO "creative_assets_tenantId_projectId_idx";

-- RenameIndex
ALTER INDEX "creative_projects_tenant_status_idx" RENAME TO "creative_projects_tenantId_status_idx";

-- RenameIndex
ALTER INDEX "creative_projects_tenant_type_idx" RENAME TO "creative_projects_tenantId_type_idx";

-- RenameIndex
ALTER INDEX "daily_reports_tenant_date_idx" RENAME TO "daily_reports_tenantId_reportDate_idx";

-- RenameIndex
ALTER INDEX "daily_reports_tenant_date_unique" RENAME TO "daily_reports_tenantId_reportDate_key";

-- RenameIndex
ALTER INDEX "jobs_tenant_status_runAt_idx" RENAME TO "jobs_tenantId_status_runAt_idx";

-- RenameIndex
ALTER INDEX "marketing_campaigns_tenant_channel_idx" RENAME TO "marketing_campaigns_tenantId_channel_idx";

-- RenameIndex
ALTER INDEX "marketing_campaigns_tenant_status_idx" RENAME TO "marketing_campaigns_tenantId_status_idx";

-- RenameIndex
ALTER INDEX "marketing_contacts_tenant_email_unique" RENAME TO "marketing_contacts_tenantId_email_key";

-- RenameIndex
ALTER INDEX "marketing_contacts_tenant_source_idx" RENAME TO "marketing_contacts_tenantId_source_idx";

-- RenameIndex
ALTER INDEX "marketing_contacts_tenant_status_idx" RENAME TO "marketing_contacts_tenantId_status_idx";

-- RenameIndex
ALTER INDEX "marketing_list_members_list_contact_unique" RENAME TO "marketing_list_members_listId_contactId_key";

-- RenameIndex
ALTER INDEX "marketing_list_members_tenant_list_idx" RENAME TO "marketing_list_members_tenantId_listId_idx";

-- RenameIndex
ALTER INDEX "marketing_lists_tenant_idx" RENAME TO "marketing_lists_tenantId_idx";

-- RenameIndex
ALTER INDEX "marketing_lists_tenant_name_unique" RENAME TO "marketing_lists_tenantId_name_key";

-- RenameIndex
ALTER INDEX "marketing_mailboxes_tenant_email_unique" RENAME TO "marketing_mailboxes_tenantId_email_key";

-- RenameIndex
ALTER INDEX "marketing_mailboxes_tenant_idx" RENAME TO "marketing_mailboxes_tenantId_idx";

-- RenameIndex
ALTER INDEX "marketing_segments_tenant_list_idx" RENAME TO "marketing_segments_tenantId_listId_idx";

-- RenameIndex
ALTER INDEX "marketing_segments_tenant_name_unique" RENAME TO "marketing_segments_tenantId_name_key";

-- RenameIndex
ALTER INDEX "marketing_sends_tenant_campaign_idx" RENAME TO "marketing_sends_tenantId_campaignId_idx";

-- RenameIndex
ALTER INDEX "marketing_sends_tenant_email_idx" RENAME TO "marketing_sends_tenantId_email_idx";

-- RenameIndex
ALTER INDEX "marketing_suppressions_tenant_email_unique" RENAME TO "marketing_suppressions_tenantId_email_key";

-- RenameIndex
ALTER INDEX "marketing_suppressions_tenant_idx" RENAME TO "marketing_suppressions_tenantId_idx";

-- RenameIndex
ALTER INDEX "marketing_templates_tenant_category_idx" RENAME TO "marketing_templates_tenantId_category_idx";

-- RenameIndex
ALTER INDEX "marketing_templates_tenant_name_unique" RENAME TO "marketing_templates_tenantId_name_key";

-- RenameIndex
ALTER INDEX "mom_actions_tenant_assignee_idx" RENAME TO "mom_actions_tenantId_assigneeId_idx";

-- RenameIndex
ALTER INDEX "mom_actions_tenant_meeting_idx" RENAME TO "mom_actions_tenantId_meetingId_idx";

-- RenameIndex
ALTER INDEX "mom_agendas_tenant_meeting_idx" RENAME TO "mom_agendas_tenantId_meetingId_idx";

-- RenameIndex
ALTER INDEX "mom_decisions_tenant_meeting_idx" RENAME TO "mom_decisions_tenantId_meetingId_idx";

-- RenameIndex
ALTER INDEX "mom_meetings_tenant_date_idx" RENAME TO "mom_meetings_tenantId_meetingDate_idx";

-- RenameIndex
ALTER INDEX "mom_meetings_tenant_status_idx" RENAME TO "mom_meetings_tenantId_status_idx";

-- RenameIndex
ALTER INDEX "mom_participants_tenant_meeting_idx" RENAME TO "mom_participants_tenantId_meetingId_idx";

-- RenameIndex
ALTER INDEX "report_snapshots_tenant_type_created_idx" RENAME TO "report_snapshots_tenantId_reportType_createdAt_idx";

-- RenameIndex
ALTER INDEX "social_accounts_tenant_idx" RENAME TO "social_accounts_tenantId_idx";

-- RenameIndex
ALTER INDEX "social_accounts_tenant_platform_handle_unique" RENAME TO "social_accounts_tenantId_platform_handle_key";

-- RenameIndex
ALTER INDEX "social_posts_tenant_platform_idx" RENAME TO "social_posts_tenantId_platform_idx";

-- RenameIndex
ALTER INDEX "social_posts_tenant_status_idx" RENAME TO "social_posts_tenantId_status_idx";
