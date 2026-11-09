-- Phase 6: Finance & Assets (Accounts.gs + Assets.gs)
-- All tables tenant-isolated. Enums match Prisma schema.

-- Enums
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT','SENT','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED');
CREATE TYPE "VendorBillStatus" AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED');
CREATE TYPE "PaymentMode" AS ENUM ('NEFT','RTGS','IMPS','UPI','CHEQUE','CASH','CARD','OTHER');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
CREATE TYPE "ApprovalType" AS ENUM ('ACCOUNTS_RECEIPT','ACCOUNTS_VENDOR_PAYMENT','INDENT','PURCHASE_REQUEST');
CREATE TYPE "BankAccountType" AS ENUM ('BANK','CASH','CREDIT_CARD','PETTY_CASH');
CREATE TYPE "JournalEntryType" AS ENUM ('RECEIPT','PAYMENT');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT','RELEASED','ACKNOWLEDGED','RECEIVED','CANCELLED');
CREATE TYPE "IndentStatus" AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','CONVERTED');
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','CONVERTED');
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE','INACTIVE');
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE','ASSIGNED','RETURNED','RETIRED','LOST');

-- Vendors (must exist before bills/POs reference it logically)
CREATE TABLE "vendors" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "vendorCode" TEXT NOT NULL,
  "vendorName" TEXT NOT NULL,
  "contactPerson" TEXT,
  "mobile" TEXT,
  "email" TEXT,
  "address" TEXT,
  "gstin" TEXT,
  "panNo" TEXT,
  "bankName" TEXT,
  "bankAccountNo" TEXT,
  "bankAccountEnc" TEXT,
  "ifsc" TEXT,
  "categories" TEXT,
  "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ(3),
  UNIQUE("tenantId","vendorCode")
);
CREATE INDEX "vendors_tenantId_status_idx" ON "vendors"("tenantId","status");

-- Invoices
CREATE TABLE "invoices" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "clientId" UUID,
  "clientName" TEXT NOT NULL,
  "tenderOrderId" UUID,
  "tenderNo" TEXT,
  "invoiceNo" TEXT NOT NULL,
  "invoiceDate" DATE NOT NULL,
  "dueDate" DATE NOT NULL,
  "periodFrom" DATE,
  "periodTo" DATE,
  "subTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 18,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ(3),
  UNIQUE("tenantId","invoiceNo")
);
CREATE INDEX "invoices_tenantId_status_idx" ON "invoices"("tenantId","status");
CREATE INDEX "invoices_tenantId_clientId_idx" ON "invoices"("tenantId","clientId");
CREATE INDEX "invoices_tenantId_invoiceDate_idx" ON "invoices"("tenantId","invoiceDate");

CREATE TABLE "invoice_items" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "sortOrder" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "hsnCode" TEXT,
  "quantity" DECIMAL(12,2) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'Month',
  "rate" DECIMAL(12,2) NOT NULL,
  "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "invoice_items_tenantId_invoiceId_idx" ON "invoice_items"("tenantId","invoiceId");

CREATE TABLE "invoice_payments" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "clientId" UUID,
  "receivedDate" DATE NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "mode" "PaymentMode" NOT NULL DEFAULT 'NEFT',
  "referenceNo" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "notes" TEXT,
  "receivedById" UUID,
  "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "rejectedById" UUID,
  "rejectedAt" TIMESTAMPTZ(3),
  "rejectReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "invoice_payments_tenantId_invoiceId_idx" ON "invoice_payments"("tenantId","invoiceId");
CREATE INDEX "invoice_payments_tenantId_approvalStatus_idx" ON "invoice_payments"("tenantId","approvalStatus");

-- Vendor bills
CREATE TABLE "vendor_bills" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "vendorId" UUID,
  "vendorName" TEXT NOT NULL,
  "billNo" TEXT NOT NULL,
  "billDate" DATE NOT NULL,
  "dueDate" DATE NOT NULL,
  "subTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "supplyType" TEXT NOT NULL DEFAULT 'INTRA',
  "status" "VendorBillStatus" NOT NULL DEFAULT 'DRAFT',
  "tenderOrderId" UUID,
  "notes" TEXT,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ(3),
  UNIQUE("tenantId","billNo")
);
CREATE INDEX "vendor_bills_tenantId_status_idx" ON "vendor_bills"("tenantId","status");
CREATE INDEX "vendor_bills_tenantId_vendorId_idx" ON "vendor_bills"("tenantId","vendorId");
CREATE INDEX "vendor_bills_tenantId_billDate_idx" ON "vendor_bills"("tenantId","billDate");

CREATE TABLE "vendor_bill_items" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "vendorBillId" UUID NOT NULL REFERENCES "vendor_bills"("id") ON DELETE CASCADE,
  "sortOrder" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "hsnCode" TEXT,
  "quantity" DECIMAL(12,2) NOT NULL,
  "unit" TEXT,
  "rate" DECIMAL(12,2) NOT NULL,
  "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "vendor_bill_items_tenantId_vendorBillId_idx" ON "vendor_bill_items"("tenantId","vendorBillId");

CREATE TABLE "vendor_payments" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "vendorBillId" UUID NOT NULL REFERENCES "vendor_bills"("id") ON DELETE CASCADE,
  "vendorId" UUID,
  "vendorName" TEXT,
  "paidDate" DATE NOT NULL,
  "grossAmount" DECIMAL(14,2) NOT NULL,
  "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "netPaidAmount" DECIMAL(14,2) NOT NULL,
  "mode" "PaymentMode" NOT NULL DEFAULT 'NEFT',
  "referenceNo" TEXT,
  "bankAccount" TEXT,
  "notes" TEXT,
  "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "rejectedById" UUID,
  "rejectedAt" TIMESTAMPTZ(3),
  "rejectReason" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "vendor_payments_tenantId_vendorBillId_idx" ON "vendor_payments"("tenantId","vendorBillId");
CREATE INDEX "vendor_payments_tenantId_approvalStatus_idx" ON "vendor_payments"("tenantId","approvalStatus");

-- Bank accounts & journal
CREATE TABLE "bank_accounts" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" "BankAccountType" NOT NULL DEFAULT 'BANK',
  "bankName" TEXT,
  "accountNo" TEXT,
  "ifsc" TEXT,
  "branch" TEXT,
  "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currentBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  UNIQUE("tenantId","name")
);
CREATE INDEX "bank_accounts_tenantId_active_idx" ON "bank_accounts"("tenantId","active");

CREATE TABLE "journal_entries" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "entryDate" DATE NOT NULL,
  "accountId" UUID NOT NULL REFERENCES "bank_accounts"("id") ON DELETE RESTRICT,
  "accountName" TEXT NOT NULL,
  "entryType" "JournalEntryType" NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" UUID NOT NULL,
  "referenceNo" TEXT,
  "description" TEXT,
  "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX "journal_entries_tenantId_accountId_entryDate_idx" ON "journal_entries"("tenantId","accountId","entryDate");
CREATE INDEX "journal_entries_tenantId_referenceId_idx" ON "journal_entries"("tenantId","referenceId");

CREATE TABLE "finance_approvals" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "approvalType" "ApprovalType" NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" UUID,
  "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "approvedById" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "rejectedById" UUID,
  "rejectedAt" TIMESTAMPTZ(3),
  "rejectReason" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX "finance_approvals_tenantId_status_idx" ON "finance_approvals"("tenantId","status");
CREATE INDEX "finance_approvals_tenantId_referenceId_idx" ON "finance_approvals"("tenantId","referenceId");

-- Assets
CREATE TABLE "assets" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "assetCode" TEXT NOT NULL,
  "assetName" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'OTHER',
  "brand" TEXT,
  "model" TEXT,
  "serialNo" TEXT,
  "purchaseDate" DATE,
  "purchaseValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "vendor" TEXT,
  "warrantyExpiry" DATE,
  "assignedToType" TEXT,
  "assignedToId" UUID,
  "assignedFromDate" DATE,
  "assignedToName" TEXT,
  "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
  "location" TEXT,
  "notes" TEXT,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ(3),
  UNIQUE("tenantId","assetCode")
);
CREATE INDEX "assets_tenantId_status_idx" ON "assets"("tenantId","status");
CREATE INDEX "assets_tenantId_category_idx" ON "assets"("tenantId","category");

CREATE TABLE "asset_history" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "assetId" UUID NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
  "assignedToType" TEXT,
  "assignedToId" UUID,
  "assignedToName" TEXT,
  "assignedFrom" DATE NOT NULL,
  "returnedOn" DATE,
  "notes" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX "asset_history_tenantId_assetId_idx" ON "asset_history"("tenantId","assetId");

-- Inventory
CREATE TABLE "stock_items" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "itemCode" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'OTHER',
  "unit" TEXT NOT NULL DEFAULT 'Nos',
  "minStockLevel" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "reorderQty" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "currentBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "vendorId" UUID,
  "vendorName" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ(3),
  UNIQUE("tenantId","itemCode")
);
CREATE INDEX "stock_items_tenantId_category_idx" ON "stock_items"("tenantId","category");

CREATE TABLE "stock_purchases" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "purchaseNumber" TEXT NOT NULL,
  "purchaseDate" DATE NOT NULL,
  "vendorId" UUID,
  "vendorName" TEXT,
  "purchaseOrderId" UUID,
  "invoiceNo" TEXT,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "receivedBy" TEXT,
  "notes" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "active" BOOLEAN NOT NULL DEFAULT true,
  UNIQUE("tenantId","purchaseNumber")
);
CREATE INDEX "stock_purchases_tenantId_purchaseDate_idx" ON "stock_purchases"("tenantId","purchaseDate");

CREATE TABLE "stock_purchase_items" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "stockPurchaseId" UUID NOT NULL REFERENCES "stock_purchases"("id") ON DELETE CASCADE,
  "stockItemId" UUID NOT NULL,
  "itemName" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "unitCost" DECIMAL(12,2) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "stock_purchase_items_tenantId_stockPurchaseId_idx" ON "stock_purchase_items"("tenantId","stockPurchaseId");
CREATE INDEX "stock_purchase_items_tenantId_stockItemId_idx" ON "stock_purchase_items"("tenantId","stockItemId");

CREATE TABLE "stock_distributions" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "challanNumber" TEXT NOT NULL,
  "distributionDate" DATE NOT NULL,
  "issuedToType" TEXT NOT NULL,
  "issuedToId" UUID,
  "issuedToName" TEXT NOT NULL,
  "siteType" TEXT,
  "siteId" UUID,
  "siteName" TEXT,
  "issuedById" UUID,
  "purpose" TEXT,
  "totalItems" INTEGER NOT NULL DEFAULT 0,
  "acknowledgedAt" TIMESTAMPTZ(3),
  "acknowledgedById" UUID,
  "acknowledgementToken" TEXT UNIQUE,
  "notes" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "active" BOOLEAN NOT NULL DEFAULT true,
  UNIQUE("tenantId","challanNumber")
);
CREATE INDEX "stock_distributions_tenantId_distributionDate_idx" ON "stock_distributions"("tenantId","distributionDate");
CREATE INDEX "stock_distributions_tenantId_issuedToId_idx" ON "stock_distributions"("tenantId","issuedToId");

CREATE TABLE "stock_distribution_items" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "stockDistributionId" UUID NOT NULL REFERENCES "stock_distributions"("id") ON DELETE CASCADE,
  "stockItemId" UUID NOT NULL,
  "itemName" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "utilizedQty" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "returnQty" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "returnReason" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "stock_distribution_items_tenantId_stockDistributionId_idx" ON "stock_distribution_items"("tenantId","stockDistributionId");

CREATE TABLE "purchase_orders" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "poNumber" TEXT NOT NULL,
  "poDate" DATE NOT NULL,
  "vendorId" UUID NOT NULL,
  "vendorName" TEXT NOT NULL,
  "expectedDeliveryDate" DATE,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "subTotal" DECIMAL(14,2) NOT NULL,
  "taxAmount" DECIMAL(14,2) NOT NULL,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "indentId" UUID,
  "purchaseRequestId" UUID,
  "approvedById" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
  "paymentDate" DATE,
  "paymentReference" TEXT,
  "paymentNotes" TEXT,
  "notes" TEXT,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ(3),
  UNIQUE("tenantId","poNumber")
);
CREATE INDEX "purchase_orders_tenantId_status_idx" ON "purchase_orders"("tenantId","status");
CREATE INDEX "purchase_orders_tenantId_vendorId_idx" ON "purchase_orders"("tenantId","vendorId");

CREATE TABLE "purchase_order_items" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "purchaseOrderId" UUID NOT NULL REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
  "stockItemId" UUID NOT NULL,
  "itemName" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'Nos',
  "unitCost" DECIMAL(12,2) NOT NULL,
  "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "amount" DECIMAL(14,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "purchase_order_items_tenantId_purchaseOrderId_idx" ON "purchase_order_items"("tenantId","purchaseOrderId");

CREATE TABLE "indents" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "indentNumber" TEXT NOT NULL,
  "indentDate" DATE NOT NULL,
  "neededByDate" DATE,
  "status" "IndentStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "purpose" TEXT,
  "totalItems" INTEGER NOT NULL DEFAULT 0,
  "approvedById" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "rejectedById" UUID,
  "rejectedAt" TIMESTAMPTZ(3),
  "rejectReason" TEXT,
  "linkedPrId" UUID,
  "approvalToken" TEXT UNIQUE,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "active" BOOLEAN NOT NULL DEFAULT true,
  UNIQUE("tenantId","indentNumber")
);
CREATE INDEX "indents_tenantId_status_idx" ON "indents"("tenantId","status");

CREATE TABLE "purchase_requests" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "prNumber" TEXT NOT NULL,
  "prDate" DATE NOT NULL,
  "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "indentId" UUID,
  "vendorQuotesJson" JSONB,
  "selectedVendorId" UUID,
  "selectedVendorName" TEXT,
  "selectedQuoteAmount" DECIMAL(14,2),
  "selectedLeadDays" INTEGER,
  "approvedById" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "rejectedById" UUID,
  "rejectedAt" TIMESTAMPTZ(3),
  "rejectReason" TEXT,
  "linkedPoId" UUID,
  "approvalToken" TEXT UNIQUE,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "active" BOOLEAN NOT NULL DEFAULT true,
  UNIQUE("tenantId","prNumber")
);
CREATE INDEX "purchase_requests_tenantId_status_idx" ON "purchase_requests"("tenantId","status");
