-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('DRAFT', 'NEW', 'ON_HOLD', 'DOCUMENTS_PENDING', 'READY_TO_SUBMIT', 'SUBMITTED', 'TECHNICALLY_QUALIFIED', 'FINANCIALLY_WON', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SecurityDepositForm" AS ENUM ('PBG', 'TD', 'FDR');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED', 'RENEWED');

-- CreateEnum
CREATE TYPE "ComplaintPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED', 'REOPENED');

-- CreateTable
CREATE TABLE "tenders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "legacyTenderId" TEXT,
    "tenderNo" TEXT NOT NULL,
    "tenderNoIsManual" BOOLEAN NOT NULL DEFAULT false,
    "tenderTitle" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "portalUrl" TEXT,
    "organization" TEXT,
    "sector" TEXT NOT NULL,
    "location" TEXT,
    "tenderFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "emdAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bgAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amcAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tenderValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "securityDepositPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "securityDepositForm" "SecurityDepositForm",
    "manpowerCount" TEXT,
    "tenureMonths" INTEGER NOT NULL DEFAULT 0,
    "postedDate" DATE,
    "preBidDate" DATE,
    "submissionDate" DATE NOT NULL,
    "openingDate" DATE,
    "status" "TenderStatus" NOT NULL DEFAULT 'NEW',
    "resultReason" TEXT,
    "scope" TEXT,
    "eligibility" TEXT,
    "documentsRequired" TEXT,
    "documentsPending" TEXT,
    "assignedToId" UUID,
    "nextFollowupAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_followups" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "tenderId" UUID NOT NULL,
    "status" "TenderStatus" NOT NULL,
    "notes" TEXT NOT NULL,
    "documentsPending" TEXT,
    "nextFollowupAt" TIMESTAMPTZ(3),
    "amountQuoted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "resultReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_followups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "tenderId" UUID NOT NULL,
    "orderNo" TEXT,
    "beneficiary" TEXT,
    "awardDate" DATE,
    "startDate" DATE,
    "endDate" DATE,
    "contractValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tenureMonths" INTEGER NOT NULL DEFAULT 0,
    "paymentTerms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tender_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_deposits" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "tenderId" UUID,
    "entryType" "SecurityDepositForm" NOT NULL,
    "instrumentNo" TEXT,
    "bankName" TEXT,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "issuedDate" DATE,
    "expiryDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "security_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID,
    "legacyClientId" TEXT,
    "clientCode" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "legalName" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "billingAddress" TEXT,
    "serviceAddress" TEXT,
    "primaryEmail" TEXT,
    "primaryPhone" TEXT,
    "paymentTerms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "department" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID,
    "clientId" UUID NOT NULL,
    "contractNo" TEXT NOT NULL,
    "quotationId" UUID,
    "serviceType" TEXT,
    "contractValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "paymentTerms" TEXT,
    "serviceScope" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "mobilisedAt" TIMESTAMPTZ(3),
    "mobilisedById" UUID,
    "renewalAlertDays" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_agreements" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "contractId" UUID,
    "agreementNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "responseHours" INTEGER NOT NULL DEFAULT 24,
    "resolutionHours" INTEGER NOT NULL DEFAULT 72,
    "uptimeTarget" DECIMAL(5,2),
    "penaltyClause" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sla_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "slaId" UUID,
    "ticketNo" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "ComplaintPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "category" TEXT,
    "dueAt" TIMESTAMPTZ(3),
    "firstResponseAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "breached" BOOLEAN NOT NULL DEFAULT false,
    "assignedToId" UUID,
    "resolution" TEXT,
    "feedbackRating" INTEGER,
    "feedbackNotes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenders_tenantId_status_idx" ON "tenders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "tenders_tenantId_submissionDate_idx" ON "tenders"("tenantId", "submissionDate");

-- CreateIndex
CREATE UNIQUE INDEX "tenders_companyId_tenderNo_key" ON "tenders"("companyId", "tenderNo");

-- CreateIndex
CREATE INDEX "tender_followups_tenantId_tenderId_idx" ON "tender_followups"("tenantId", "tenderId");

-- CreateIndex
CREATE UNIQUE INDEX "tender_orders_tenderId_key" ON "tender_orders"("tenderId");

-- CreateIndex
CREATE INDEX "tender_orders_tenantId_idx" ON "tender_orders"("tenantId");

-- CreateIndex
CREATE INDEX "security_deposits_tenantId_tenderId_idx" ON "security_deposits"("tenantId", "tenderId");

-- CreateIndex
CREATE INDEX "clients_tenantId_status_idx" ON "clients"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "clients_tenantId_clientCode_key" ON "clients"("tenantId", "clientCode");

-- CreateIndex
CREATE INDEX "client_contacts_tenantId_clientId_idx" ON "client_contacts"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "contracts_tenantId_status_endDate_idx" ON "contracts"("tenantId", "status", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_tenantId_contractNo_key" ON "contracts"("tenantId", "contractNo");

-- CreateIndex
CREATE INDEX "sla_agreements_tenantId_clientId_idx" ON "sla_agreements"("tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "sla_agreements_tenantId_agreementNo_key" ON "sla_agreements"("tenantId", "agreementNo");

-- CreateIndex
CREATE INDEX "complaints_tenantId_status_idx" ON "complaints"("tenantId", "status");

-- CreateIndex
CREATE INDEX "complaints_tenantId_dueAt_idx" ON "complaints"("tenantId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_tenantId_ticketNo_key" ON "complaints"("tenantId", "ticketNo");

-- AddForeignKey
ALTER TABLE "tender_followups" ADD CONSTRAINT "tender_followups_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_orders" ADD CONSTRAINT "tender_orders_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_slaId_fkey" FOREIGN KEY ("slaId") REFERENCES "sla_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
