-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'WON', 'LOST', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FeeMode" AS ENUM ('NONE', 'PERCENTAGE', 'LUMPSUM', 'BASIC_VDA_PCT', 'ST2_PCT', 'CTC_PCT');

-- CreateTable
CREATE TABLE "lead_followups" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "createdById" UUID,
    "type" TEXT NOT NULL,
    "outcome" TEXT,
    "notes" TEXT NOT NULL,
    "nextFollowupAt" TIMESTAMPTZ(3),
    "newStatus" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_followups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surveys" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "executiveId" UUID,
    "scheduledDate" DATE NOT NULL,
    "scheduledTime" TEXT,
    "status" "SurveyStatus" NOT NULL DEFAULT 'SCHEDULED',
    "siteContact" TEXT,
    "siteMobile" TEXT,
    "address" TEXT,
    "inspectionSummary" TEXT,
    "manpowerRequired" INTEGER,
    "materialsRequired" TEXT,
    "areaSqFt" DECIMAL(12,2),
    "scopeOfWork" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID,
    "quotationNo" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "leadId" UUID,
    "surveyId" UUID,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATE NOT NULL,
    "validUntil" DATE,
    "customerName" TEXT NOT NULL,
    "companyName" TEXT,
    "billingAddress" TEXT,
    "serviceType" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "managementFeeMode" "FeeMode" NOT NULL DEFAULT 'NONE',
    "managementFeeValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "managementFeeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountBeforeTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "wageBreakupJson" JSONB,
    "notes" TEXT,
    "terms" TEXT,
    "createdById" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_versions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedById" UUID,
    "changeSummary" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_followups_tenantId_leadId_idx" ON "lead_followups"("tenantId", "leadId");

-- CreateIndex
CREATE INDEX "surveys_tenantId_leadId_idx" ON "surveys"("tenantId", "leadId");

-- CreateIndex
CREATE INDEX "quotations_tenantId_status_idx" ON "quotations"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_tenantId_quotationNo_revision_key" ON "quotations"("tenantId", "quotationNo", "revision");

-- CreateIndex
CREATE INDEX "quotation_items_tenantId_quotationId_idx" ON "quotation_items"("tenantId", "quotationId");

-- CreateIndex
CREATE INDEX "quotation_versions_tenantId_quotationId_idx" ON "quotation_versions"("tenantId", "quotationId");

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
