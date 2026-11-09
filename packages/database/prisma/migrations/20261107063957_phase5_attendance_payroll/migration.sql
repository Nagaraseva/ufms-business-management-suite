-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE', 'UNPAID_LEAVE', 'WEEKLY_OFF', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'IMPORT', 'BIOMETRIC');

-- CreateEnum
CREATE TYPE "SalarySlipStatus" AS ENUM ('DRAFT', 'GENERATED', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'LOCKED', 'APPROVED', 'DISBURSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('REVERSAL', 'ADDITION');

-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('PENDING', 'APPLIED', 'VOID');

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "hoursWorked" DECIMAL(5,2) NOT NULL DEFAULT 8,
    "otHours" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "allocationId" UUID,
    "siteId" UUID,
    "contractId" UUID,
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "supersededById" UUID,
    "markedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_slips" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "slipNumber" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "daysInMonth" INTEGER NOT NULL,
    "daysWorked" DECIMAL(5,2) NOT NULL,
    "daysPresent" DECIMAL(5,2) NOT NULL,
    "otDays" DECIMAL(5,2) NOT NULL,
    "basic" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "da" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "specialAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grossEarnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "esiEmployee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "esiEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pfEmployee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pfEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tds" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "loanRecovery" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advanceRecovery" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "SalarySlipStatus" NOT NULL DEFAULT 'DRAFT',
    "statutorySetId" UUID,
    "statutorySetCode" TEXT,
    "calcSnapshot" JSONB,
    "payrollRunId" UUID,
    "generatedById" UUID,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "salary_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "runNumber" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalEsiEmployee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalEsiEmployer" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPfEmployee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPfEmployerEpf" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPfEmployerEps" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPfEmployerEdlis" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalTds" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "statutorySetId" UUID,
    "statutorySetCode" TEXT,
    "findings" JSONB,
    "preparedById" UUID,
    "preparedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "selfApprovalException" BOOLEAN NOT NULL DEFAULT false,
    "selfApprovalReason" TEXT,
    "disbursedById" UUID,
    "disbursedAt" TIMESTAMP(3),
    "bankFileRef" TEXT,
    "cancelReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_run_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "payrollRunId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "salarySlipId" UUID,
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "designation" TEXT,
    "department" TEXT,
    "daysWorked" DECIMAL(5,2) NOT NULL,
    "daysPresent" DECIMAL(5,2) NOT NULL,
    "otDays" DECIMAL(5,2) NOT NULL,
    "basic" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "da" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "specialAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grossEarnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "esiEmployee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pfEmployee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tds" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustmentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentRef" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_run_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "originalRunId" UUID,
    "appliedInRunId" UUID,
    "type" "AdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_records_tenantId_date_idx" ON "attendance_records"("tenantId", "date");

-- CreateIndex
CREATE INDEX "attendance_records_tenantId_contractId_date_idx" ON "attendance_records"("tenantId", "contractId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_tenantId_employeeId_date_key" ON "attendance_records"("tenantId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "salary_slips_tenantId_month_year_status_idx" ON "salary_slips"("tenantId", "month", "year", "status");

-- CreateIndex
CREATE INDEX "salary_slips_tenantId_payrollRunId_idx" ON "salary_slips"("tenantId", "payrollRunId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_slips_tenantId_employeeId_month_year_key" ON "salary_slips"("tenantId", "employeeId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "salary_slips_tenantId_slipNumber_key" ON "salary_slips"("tenantId", "slipNumber");

-- CreateIndex
CREATE INDEX "payroll_runs_tenantId_year_month_idx" ON "payroll_runs"("tenantId", "year", "month");

-- CreateIndex
CREATE INDEX "payroll_runs_tenantId_status_idx" ON "payroll_runs"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenantId_runNumber_key" ON "payroll_runs"("tenantId", "runNumber");

-- CreateIndex
CREATE INDEX "payroll_run_items_tenantId_payrollRunId_idx" ON "payroll_run_items"("tenantId", "payrollRunId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_items_payrollRunId_employeeId_key" ON "payroll_run_items"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_tenantId_employeeId_status_idx" ON "payroll_adjustments"("tenantId", "employeeId", "status");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_slips" ADD CONSTRAINT "salary_slips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run_items" ADD CONSTRAINT "payroll_run_items_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_appliedInRunId_fkey" FOREIGN KEY ("appliedInRunId") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
