-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'NOTICE_PERIOD', 'ON_HOLD', 'LEFT');

-- CreateEnum
CREATE TYPE "EmployeeDocCategory" AS ENUM ('AADHAAR', 'PAN', 'UAN', 'ESI', 'PF', 'BANK', 'EDUCATION', 'EXPERIENCE', 'MEDICAL', 'PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "WageCategory" AS ENUM ('UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED');

-- CreateEnum
CREATE TYPE "StatutoryStatus" AS ENUM ('PROVISIONAL', 'CONFIRMED', 'CONTESTED');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'REPLACED');

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID,
    "legacyEmployeeId" TEXT,
    "employeeCode" TEXT NOT NULL,
    "employeeCodeIsManual" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "fatherName" TEXT,
    "dob" DATE,
    "gender" TEXT,
    "bloodGroup" TEXT,
    "maritalStatus" TEXT,
    "mobile" TEXT,
    "alternateMobile" TEXT,
    "email" TEXT,
    "aadhaarEnc" TEXT,
    "panEnc" TEXT,
    "uanEnc" TEXT,
    "esiNoEnc" TEXT,
    "bankAccountEnc" TEXT,
    "aadhaarHint" TEXT,
    "panHint" TEXT,
    "uanHint" TEXT,
    "esiNoHint" TEXT,
    "bankAccountHint" TEXT,
    "pfNo" TEXT,
    "bankName" TEXT,
    "ifsc" TEXT,
    "branch" TEXT,
    "addressPermanent" TEXT,
    "addressCurrent" TEXT,
    "photoUrl" TEXT,
    "designation" TEXT,
    "department" TEXT,
    "dateOfJoining" DATE,
    "dateOfLeaving" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "siteId" UUID,
    "clientId" UUID,
    "contractId" UUID,
    "tenderOrderId" UUID,
    "basic" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "da" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherAllowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "esiApplicable" BOOLEAN NOT NULL DEFAULT true,
    "pfApplicable" BOOLEAN NOT NULL DEFAULT true,
    "ptState" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactMobile" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "category" "EmployeeDocCategory" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "storageKey" TEXT,
    "checksum" TEXT,
    "expiryDate" DATE,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "uploadedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_allocations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "clientId" UUID,
    "contractId" UUID,
    "siteId" UUID,
    "designation" TEXT,
    "category" "WageCategory" NOT NULL DEFAULT 'UNSKILLED',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "replacedByIdString" UUID,
    "replacedAllocationId" UUID,
    "releaseReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manpower_requirements" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID,
    "contractId" UUID,
    "siteId" UUID,
    "designation" TEXT NOT NULL,
    "category" "WageCategory" NOT NULL DEFAULT 'UNSKILLED',
    "requiredCount" INTEGER NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'HEADCOUNT',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "manpower_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statutory_rate_sets" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'CENTRAL',
    "status" "StatutoryStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "sourceReference" TEXT,
    "sourceUrl" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedById" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "statutory_rate_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statutory_rates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "rateSetId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PERCENT',
    "notes" TEXT,

    CONSTRAINT "statutory_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pt_slabs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "rateSetId" UUID NOT NULL,
    "fromGross" DECIMAL(14,2) NOT NULL,
    "toGross" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "overrideMonth" INTEGER,
    "overrideAmount" DECIMAL(14,2),

    CONSTRAINT "pt_slabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minimum_wage_rates" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "regime" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "sector" TEXT,
    "category" "WageCategory" NOT NULL,
    "monthlyWage" DECIMAL(12,2) NOT NULL,
    "dailyWage" DECIMAL(12,2),
    "status" "StatutoryStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "sourceReference" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "minimum_wage_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_tenantId_status_idx" ON "employees"("tenantId", "status");

-- CreateIndex
CREATE INDEX "employees_tenantId_clientId_idx" ON "employees"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "employees_tenantId_siteId_idx" ON "employees"("tenantId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenantId_employeeCode_key" ON "employees"("tenantId", "employeeCode");

-- CreateIndex
CREATE INDEX "employee_documents_tenantId_employeeId_idx" ON "employee_documents"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "employee_documents_tenantId_expiryDate_idx" ON "employee_documents"("tenantId", "expiryDate");

-- CreateIndex
CREATE INDEX "employee_allocations_tenantId_contractId_status_idx" ON "employee_allocations"("tenantId", "contractId", "status");

-- CreateIndex
CREATE INDEX "employee_allocations_tenantId_siteId_status_idx" ON "employee_allocations"("tenantId", "siteId", "status");

-- CreateIndex
CREATE INDEX "employee_allocations_tenantId_employeeId_status_idx" ON "employee_allocations"("tenantId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "manpower_requirements_tenantId_contractId_effectiveFrom_idx" ON "manpower_requirements"("tenantId", "contractId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "statutory_rate_sets_jurisdiction_effectiveFrom_idx" ON "statutory_rate_sets"("jurisdiction", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "statutory_rate_sets_tenantId_code_effectiveFrom_key" ON "statutory_rate_sets"("tenantId", "code", "effectiveFrom");

-- CreateIndex
CREATE INDEX "statutory_rates_tenantId_idx" ON "statutory_rates"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "statutory_rates_rateSetId_code_key" ON "statutory_rates"("rateSetId", "code");

-- CreateIndex
CREATE INDEX "pt_slabs_rateSetId_idx" ON "pt_slabs"("rateSetId");

-- CreateIndex
CREATE INDEX "minimum_wage_rates_regime_zone_category_effectiveFrom_idx" ON "minimum_wage_rates"("regime", "zone", "category", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_allocations" ADD CONSTRAINT "employee_allocations_replacedByIdString_fkey" FOREIGN KEY ("replacedByIdString") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_allocations" ADD CONSTRAINT "employee_allocations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statutory_rates" ADD CONSTRAINT "statutory_rates_rateSetId_fkey" FOREIGN KEY ("rateSetId") REFERENCES "statutory_rate_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_slabs" ADD CONSTRAINT "pt_slabs_rateSetId_fkey" FOREIGN KEY ("rateSetId") REFERENCES "statutory_rate_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
