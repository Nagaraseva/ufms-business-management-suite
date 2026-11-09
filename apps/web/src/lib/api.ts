/**
 * API client.
 * The session token is held in memory + localStorage and sent as a bearer
 * token. The server also sets an HttpOnly cookie, so a stricter cookie-only
 * mode is available by removing the Authorization header here.
 */
export interface ApiError { code: string; message: string; details?: unknown; correlationId?: string }

const TOKEN_KEY = 'ufms_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiFailure extends Error {
  constructor(public status: number, public error: ApiError) {
    super(error.message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  if (res.status === 401) {
    tokenStore.clear();
    if (!location.pathname.startsWith('/login')) location.href = '/login';
    throw new ApiFailure(401, { code: 'UNAUTHORIZED', message: 'Session expired. Please sign in again.' });
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiFailure(res.status, body?.error ?? { code: 'ERROR', message: 'Request failed.' });
  }
  return body as T;
}

export const api = {
  get: <T,>(p: string) => request<T>(p),
  post: <T,>(p: string, data?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  patch: <T,>(p: string, data?: unknown) => request<T>(p, { method: 'PATCH', body: JSON.stringify(data ?? {}) }),
  del: <T,>(p: string) => request<T>(p, { method: 'DELETE' }),
};

/* ---------- shared types ---------- */
export interface Branding {
  logoUrl: string | null; primaryColor: string; secondaryColor: string;
  accentColor: string; loginHeadline: string | null; footerText: string | null;
}
export interface Me {
  id: string; email: string; name: string; roles: string[]; permissions: string[];
  tenant: { id: string; slug: string; displayName: string; whiteLabel: boolean; branding: Branding | null };
}
export interface Lead {
  id: string; leadNo: string; customerName: string; companyName: string | null;
  mobile: string | null; email: string | null; serviceType: string | null;
  status: string; assignedToId: string | null; nextFollowupAt: string | null; createdAt: string;
}
export interface Followup {
  id: string; type: string; outcome: string | null; notes: string;
  nextFollowupAt: string | null; newStatus: string | null; createdAt: string;
}
export interface Survey {
  id: string; leadId: string; customerName: string; leadNo: string;
  scheduledDate: string; status: string; siteContact: string | null;
  manpowerRequired: number | null; inspectionSummary: string | null;
}
export interface Quotation {
  id: string; quotationNo: string; revision: number; status: string;
  customerName: string; subtotal: string; amountBeforeTax: string;
  taxAmount: string; grandTotal: string; issueDate: string;
}
export const inr = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
    .format(typeof v === 'string' ? Number(v) : v);

/* ---------- Phase 3: tenders, clients, contracts, client care ---------- */

export const TENDER_STATUSES = [
  'NEW', 'DOCUMENTS_PENDING', 'READY_TO_SUBMIT', 'SUBMITTED',
  'TECHNICALLY_QUALIFIED', 'FINANCIALLY_WON', 'LOST', 'CANCELLED',
] as const;

export interface Tender {
  id: string; tenderNo: string; tenderNoIsManual: boolean; legacyTenderId: string | null;
  tenderTitle: string; portal: string; portalUrl: string | null; organization: string | null;
  sector: string; location: string | null;
  tenderFee: string; emdAmount: string; bgAmount: string; amcAmount: string; tenderValue: string;
  securityDepositPercent: string; securityDepositForm: string | null;
  manpowerCount: string | null; tenureMonths: number;
  postedDate: string | null; preBidDate: string | null; submissionDate: string; openingDate: string | null;
  status: string; resultReason: string | null; scope: string | null; eligibility: string | null;
  documentsRequired: string | null; documentsPending: string | null;
  assignedToId: string | null; nextFollowupAt: string | null; notes: string | null;
}

export interface TenderFollowup {
  id: string; status: string; notes: string; documentsPending: string | null;
  nextFollowupAt: string | null; amountQuoted: string; resultReason: string | null; createdAt: string;
}

export interface TenderMetrics {
  totalOpen: number; participated: number; dueToday: number; addedToday: number;
  documentsPending: number; dueWithin7Days: number; technicallyQualified: number;
  won: number; openTenderValue: number;
}

export interface Client {
  id: string; clientCode: string; companyName: string; legalName: string | null;
  gstin: string | null; pan: string | null; billingAddress: string | null;
  serviceAddress: string | null; primaryEmail: string | null; primaryPhone: string | null;
  paymentTerms: string | null; status: string;
  _count?: { contracts: number; contacts: number };
}

export interface ClientContact {
  id: string; name: string; designation: string | null; department: string | null;
  mobile: string | null; email: string | null; isPrimary: boolean;
}

export interface Contract {
  id: string; contractNo: string; clientId: string; serviceType: string | null;
  contractValue: string; startDate: string; endDate: string; paymentTerms: string | null;
  serviceScope: string | null; status: string; mobilisedAt: string | null;
  renewalAlertDays: number; daysLeft?: number;
  client?: { id: string; companyName: string; clientCode?: string };
}

export interface SlaAgreement {
  id: string; clientId: string; contractId: string | null; agreementNo: string; title: string;
  responseHours: number; resolutionHours: number; uptimeTarget: string | null;
  penaltyClause: string | null; startDate: string; endDate: string | null; status: string;
}

export interface Complaint {
  id: string; clientId: string; slaId: string | null; ticketNo: string; subject: string;
  description: string; priority: string; status: string; category: string | null;
  dueAt: string | null; firstResponseAt: string | null; resolvedAt: string | null;
  breached: boolean; overdueHours?: number; assignedToId: string | null;
  resolution: string | null; feedbackRating: number | null; feedbackNotes: string | null;
  createdAt: string;
}

export interface ClientCareSummary {
  total: number; open: number; breached: number; breachRatePct: number;
  avgResolutionHours: number; avgRating: number | null; byPriority: Record<string, number>;
}

/** Local calendar date as YYYY-MM-DD (never toISOString — that shifts a day in IST). */
export const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Dates arrive as ISO strings; show the calendar day only. */
export const dateOnly = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '—');

/* ---------- Phase 4: HR & workforce ---------- */

export const EMPLOYEE_STATUSES = ['ACTIVE', 'NOTICE_PERIOD', 'ON_HOLD', 'LEFT'] as const;
export const WAGE_CATEGORIES = ['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED'] as const;
export const DOC_CATEGORIES = [
  'AADHAAR', 'PAN', 'UAN', 'ESI', 'PF', 'BANK',
  'EDUCATION', 'EXPERIENCE', 'MEDICAL', 'PHOTO', 'OTHER',
] as const;

export interface Employee {
  id: string; employeeCode: string; employeeCodeIsManual: boolean;
  legacyEmployeeId: string | null;
  name: string; fatherName: string | null; dob: string | null;
  gender: string | null; bloodGroup: string | null; maritalStatus: string | null;
  mobile: string | null; alternateMobile: string | null; email: string | null;

  /** Masked only — the API never returns the underlying values. */
  aadhaarHint: string | null; panHint: string | null; uanHint: string | null;
  esiNoHint: string | null; bankAccountHint: string | null;
  piiReadable: boolean;

  pfNo: string | null; bankName: string | null; ifsc: string | null; branch: string | null;
  addressPermanent: string | null; addressCurrent: string | null; photoUrl: string | null;

  designation: string | null; department: string | null;
  dateOfJoining: string | null; dateOfLeaving: string | null;
  status: string; active: boolean;

  siteId: string | null; clientId: string | null; contractId: string | null;

  basic: string; hra: string; da: string; otherAllowances: string;
  esiApplicable: boolean; pfApplicable: boolean; ptState: string | null;

  emergencyContactName: string | null; emergencyContactMobile: string | null;
  documents?: EmployeeDocument[];
  allocations?: Allocation[];
}

export interface EmployeeDocument {
  id: string; category: string; fileName: string; mimeType: string | null;
  fileSize: number | null; storageKey: string | null; status: string;
  expiryDate: string | null; notes: string | null; createdAt: string;
}

export interface HrSummary {
  total: number; active: number; notice: number; onHold: number; left: number;
  monthlyGrossEstimate: number; byDepartment: Record<string, number>; onRolls: number;
}

export interface Allocation {
  id: string; employeeId: string; clientId: string | null;
  contractId: string | null; siteId: string | null;
  designation: string | null; category: string;
  startDate: string; endDate: string | null; status: string;
  releaseReason: string | null; replacedAllocationId: string | null;
  employee?: { id: string; employeeCode: string; name: string; designation: string | null };
}

export interface ManpowerRequirement {
  id: string; clientId: string | null; contractId: string | null; siteId: string | null;
  designation: string; category: string; requiredCount: number; basis: string;
  effectiveFrom: string; effectiveTo: string | null; notes: string | null;
}

export interface StrengthLine {
  designation: string; category: string;
  required: number; deployed: number; variance: number;
  state: 'SHORT' | 'FILLED' | 'OVER';
}

export interface StrengthReport {
  asOn: string; required: number; deployed: number; variance: number;
  state: 'SHORT' | 'FILLED' | 'OVER';
  lines: StrengthLine[];
  unplanned: Array<{ designation: string; count: number }>;
}

export interface StrengthByContract extends StrengthReport {
  contractId: string; contractNo: string; clientName: string | null;
  serviceType: string | null; contractStatus: string;
}

export interface StatutoryRate {
  id: string; code: string; label: string; value: string; unit: string; notes: string | null;
}

export interface PtSlab {
  id: string; fromGross: string; toGross: string; amount: string;
  overrideMonth: number | null; overrideAmount: string | null;
}

export interface StatutoryRateSet {
  id: string; code: string; name: string; jurisdiction: string; status: string;
  effectiveFrom: string; effectiveTo: string | null;
  sourceReference: string | null; sourceUrl: string | null; reviewNotes: string | null;
  reviewedAt: string | null;
  rates?: StatutoryRate[]; slabs?: PtSlab[];
  _count?: { rates: number; slabs: number };
}

export interface MinimumWageRate {
  id: string; regime: string; zone: string; sector: string | null;
  category: string; monthlyWage: string; dailyWage: string | null;
  status: string; effectiveFrom: string; effectiveTo: string | null;
  sourceReference: string | null;
}

export interface LegacyStatutoryDefaults {
  pfWageCap: number; pfEmployeePct: number; pfEmployerPct: number;
  esiGrossCeiling: number; esiEmployeePct: number; esiEmployerPct: number;
  warning: string;
}

/** Human label for a rate code, used when a set carries codes we do not know. */
export const rateLabel = (code: string) =>
  code.replace(/_/g, ' ').replace(/\bPCT\b/, '%').replace(/\bEE\b/, 'employee').replace(/\bER\b/, 'employer');

/* ---------- Phase 5: attendance ---------- */

export const ATTENDANCE_STATUSES = [
  'PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE', 'UNPAID_LEAVE', 'WEEKLY_OFF', 'HOLIDAY',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Single-letter marks used in the month grid. */
export const ATTENDANCE_SHORT: Record<AttendanceStatus, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  HALF_DAY: '½',
  PAID_LEAVE: 'PL',
  UNPAID_LEAVE: 'UL',
  WEEKLY_OFF: 'WO',
  HOLIDAY: 'H',
};

export const ATTENDANCE_TONE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-800',
  ABSENT: 'bg-red-100 text-red-800',
  HALF_DAY: 'bg-amber-100 text-amber-800',
  PAID_LEAVE: 'bg-sky-100 text-sky-800',
  UNPAID_LEAVE: 'bg-orange-100 text-orange-800',
  WEEKLY_OFF: 'bg-navy-100 text-navy-600',
  HOLIDAY: 'bg-violet-100 text-violet-800',
};

export interface DayCounts {
  daysInMonth: number;
  presentDays: number;
  payableDays: number;
  absentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  halfDays: number;
  weeklyOffs: number;
  holidays: number;
  otHours: number;
  otDays: number;
  daysWorked: number;
  daysPresent: number;
  empty: boolean;
}

export interface AttendanceSummaryRow extends DayCounts {
  unmarkedDays: number;
  employee: {
    id: string; employeeCode: string; name: string; department: string | null;
    designation: string | null; contractId: string | null; status: string;
  };
}

export interface AttendanceSummary {
  month: number; year: number; label: string; daysInMonth: number;
  employees: number; employeesWithNoAttendance: number;
  rows: AttendanceSummaryRow[];
}

export interface CalendarCell {
  id: string; status: AttendanceStatus; otHours: number;
  note: string | null; source: string; correctionCount: number;
}

export interface CalendarResponse {
  month: number; year: number; label: string; daysInMonth: number;
  days: number[];
  employees: Array<{
    id: string; employeeCode: string; name: string; department: string | null;
    siteId: string | null; cells: Array<CalendarCell | null>;
  }>;
}

export interface AttendanceLockStatus {
  month: number; year: number; label: string; locked: boolean;
  payrollRun: { id: string; runNumber: string; status: string; approvedAt: string | null } | null;
}

export interface AttendanceCorrection {
  id: string; fromStatus: string; toStatus: string;
  fromOtHours: string; toOtHours: string; reason: string; createdAt: string;
}

/* ---------- Phase 5: payroll ---------- */

export const PAYROLL_RUN_STATUSES = ['DRAFT', 'LOCKED', 'APPROVED', 'DISBURSED', 'CANCELLED'] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export interface PayrollFinding {
  code: string;
  severity: 'BLOCKING' | 'WARNING';
  message: string;
  employeeId?: string;
  employeeName?: string;
  amount?: number;
}

export interface SalarySlip {
  id: string; slipNumber: string; month: number; year: number;
  daysInMonth: number; daysWorked: string; daysPresent: string; otDays: string;
  basic: string; hra: string; da: string; specialAllowance: string;
  otAmount: string; bonus: string; grossEarnings: string;
  esiEmployee: string; esiEmployer: string; pfEmployee: string; pfEmployer: string;
  pt: string; tds: string; loanRecovery: string; advanceRecovery: string;
  totalDeductions: string; netPay: string;
  status: 'DRAFT' | 'GENERATED' | 'SENT' | 'CANCELLED';
  statutorySetId: string | null; statutorySetCode: string | null;
  payrollRunId: string | null;
  employee?: { id: string; employeeCode: string; name: string; department?: string | null; designation?: string | null };
}

export interface PayrollRunItem {
  id: string; employeeId: string; employeeCode: string; employeeName: string;
  designation: string | null; department: string | null;
  daysWorked: string; daysPresent: string; otDays: string;
  basic: string; hra: string; da: string; specialAllowance: string;
  otAmount: string; bonus: string; grossEarnings: string;
  esiEmployee: string; pfEmployee: string; pt: string; tds: string;
  adjustmentAmount: number; totalDeductions: string; netPay: number;
}

export interface PayrollRunTotals {
  employees: number; gross: number; esiEmployee: number; esiEmployer: number;
  pfEmployee: number; pfEmployerEPF: number; pfEmployerEPS: number; pfEmployerEDLIS: number;
  pt: number; tds: number; deductions: number; net: number;
}

export interface PayrollRun {
  id: string; runNumber: string; month: number; year: number;
  status: PayrollRunStatus;
  periodStart: string; periodEnd: string;
  totalEmployees: number; totalGross: number; totalNet: number; totalDeductions: number;
  statutorySetCode: string | null;
  findings: PayrollFinding[] | null;
  preparedById: string | null; preparedAt: string | null;
  approvedById: string | null; approvedAt: string | null;
  selfApprovalException: boolean; selfApprovalReason: string | null;
  disbursedAt: string | null; bankFileRef: string | null;
  cancelReason: string | null; notes: string | null;
  blockingFindings?: number;
  label?: string;
  items?: PayrollRunItem[];
  totals?: PayrollRunTotals;
  canApprove?: { allowed: boolean; code?: string; message?: string };
}

export interface PayrollAdjustment {
  id: string; employeeId: string; originalRunId: string | null;
  type: 'REVERSAL' | 'ADDITION'; amount: number; reason: string;
  status: 'PENDING' | 'APPLIED' | 'VOID';
  requestedById: string | null; approvedById: string | null; approvedAt: string | null;
  createdAt: string;
  employee?: { id: string; employeeCode: string; name: string } | null;
}

export interface PayrollSummary {
  period: { month: number; year: number; label: string; daysInMonth: number };
  slipsByStatus: Record<string, number>;
  attendanceRowsThisMonth: number;
  pendingAdjustments: number;
  recentRuns: Array<{
    id: string; runNumber: string; month: number; year: number; status: PayrollRunStatus;
    totalEmployees: number; totalGross: number; totalNet: number;
    preparedAt: string | null; approvedAt: string | null; label: string;
  }>;
}

export interface GenerateSlipsResult {
  month: number; year: number; label: string;
  statutory: {
    source: 'RATE_SET' | 'LEGACY_DEFAULTS';
    rateSet: { id: string; code: string; name: string } | null;
    problems: string[];
    config: Record<string, number>;
  };
  generated: number;
  skipped: number;
  skippedDetail: Array<{ employeeCode: string; name: string; reason: string }>;
  warning?: string;
}

export const MONTH_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const monthName = (m: number) => MONTH_OPTIONS[m - 1] ?? String(m);
export const periodKey = (m: number, y: number) => `${y}-${String(m).padStart(2, '0')}`;

/* ---------- Phase 6: Finance & Assets ---------- */
export interface Invoice {
  id: string; invoiceNo: string; clientId: string | null; clientName: string;
  tenderOrderId: string | null; tenderNo: string | null;
  invoiceDate: string; dueDate: string; periodFrom: string | null; periodTo: string | null;
  subTotal: string; taxPercent: string; taxAmount: string; totalAmount: string; paidAmount: string;
  status: string; notes: string | null; createdAt: string;
  items?: InvoiceItem[];
  payments?: InvoicePayment[];
}
export interface InvoiceItem { id: string; invoiceId: string; description: string; hsnCode: string | null; quantity: string; unit: string | null; rate: string; taxPercent: string; amount: string; taxAmount: string; totalAmount: string; }
export interface InvoicePayment { id: string; invoiceId: string; receivedDate: string; amount: string; mode: string; referenceNo: string; bankName: string; approvalStatus: string; approvedAt: string | null; notes: string | null; }
export interface VendorBill {
  id: string; billNo: string; vendorId: string | null; vendorName: string; billDate: string; dueDate: string;
  subTotal: string; cgstAmount: string; sgstAmount: string; igstAmount: string; totalAmount: string; paidAmount: string;
  tdsPercent: string | null; tdsAmount: string; status: string; supplyType: string | null; notes: string | null;
  items?: VendorBillItem[]; payments?: VendorPayment[];
}
export interface VendorBillItem { id: string; vendorBillId: string; description: string; quantity: string; rate: string; taxPercent: string; amount: string; cgstAmount: string; sgstAmount: string; totalAmount: string; }
export interface VendorPayment { id: string; vendorBillId: string; grossAmount: string; tdsAmount: string; netAmount: string; mode: string; approvalStatus: string; paidDate: string | null; referenceNo: string | null; createdAt: string; }
export interface BankAccount { id: string; name: string; type: string; bankName: string | null; accountNo: string | null; ifsc: string | null; branch: string | null; openingBalance: string; currentBalance: string; isDefault: boolean; active: boolean; }
export interface BankBookEntry { id: string; entryDate: string; accountName: string; entryType: string; referenceNo: string | null; description: string | null; debit: string; credit: string; }
export interface FinanceOverview {
  kpi: { outstanding: number; overdue: number; thisMonthReceipts: number; thisMonthPayments: number; pendingApprovals: number; cashPosition: number; draftInvoices: number; };
  ageing: Record<string, number>;
  recentInvoices: Invoice[];
  recentReceipts: Array<{ id: string; invoiceId: string; receivedDate: string; amount: string; mode: string; referenceNo: string }>;
  recentBills: VendorBill[];
  lowStock?: Array<{ id: string; itemName: string; currentStock: string; reorderLevel: string }>;
}
export interface ReceivableAgeing { buckets: Record<string, number>; invoices: Array<{ id: string; invoiceNo: string; clientName: string; dueDate: string; totalAmount: string; paidAmount: string; balance: number; daysOverdue: number; status: string }> }
export interface FinanceApproval { id: string; approvalType: string; referenceType: string; referenceId: string; amount: string; status: string; requestedById: string | null; notes: string | null; createdAt: string; }

export interface Vendor { id: string; vendorCode: string; vendorName: string; contactPerson: string | null; mobile: string | null; email: string | null; gstin: string | null; panNo: string | null; status: string; categories: string | null; createdAt: string; }
export interface Asset { id: string; assetCode: string; assetName: string; category: string | null; brand: string | null; model: string | null; serialNo: string | null; status: string; condition: string | null; purchaseDate: string | null; purchaseCost: string | null; vendorId: string | null; siteId: string | null; assignedToId: string | null; assignedFrom: string | null; assignedTo?: { id: string; name: string } | null; vendor?: { id: string; vendorName: string } | null; history?: Array<{ id: string; action: string; fromSiteId: string | null; toSiteId: string | null; byId: string; notes: string | null; createdAt: string }> }
export interface StockItem { id: string; itemCode: string | null; itemName: string; sku?: string | null; category: string | null; unit: string | null; currentStock?: string; currentBalance: string; reorderLevel?: string; minStockLevel: string; reorderQty?: string; unitCost: string | null; active: boolean; }
export interface StockPurchase { id: string; stockItemId: string; vendorId: string | null; purchaseDate: string; quantity: string; unitCost: string; totalCost: string; billNo: string | null; notes: string | null; stockItem?: { itemName: string }; vendor?: { vendorName: string } | null }
export interface StockDistribution { id: string; stockItemId: string; siteId: string | null; quantity: string; distributionDate: string; purpose: string | null; approvedById: string | null; acknowledgedAt: string | null; status: string; stockItem?: { itemName: string } }
export interface PurchaseOrder { id: string; poNo: string; vendorId: string | null; vendorName: string | null; poDate: string; expectedDeliveryDate: string | null; subTotal: string; taxPercent: string; taxAmount: string; totalAmount: string; status: string; approvedAt: string | null; vendorAcknowledgedAt: string | null; items?: Array<{ description: string; quantity: string; unit: string | null; rate: string; taxPercent: string; amount: string }>; vendor?: { vendorName: string } | null }

/* ---------- Phase 7: Marketing, Reports, AI, Creative ---------- */
export interface MarketingContact { id: string; email: string; name: string | null; company: string | null; phone: string | null; source: string; status: string; tags: string | null; createdAt: string; }
export interface MarketingList { id: string; name: string; description: string | null; type: string; createdAt: string; _count?: { members: number }; }
export interface MarketingSegment { id: string; name: string; description: string | null; filterJson: unknown; countCache: number; createdAt: string; }
export interface MarketingTemplate { id: string; name: string; subject: string | null; category: string; bodyHtml: string | null; bodyText: string | null; variables: string | null; createdAt: string; }
export interface MarketingCampaign { id: string; name: string; subject: string | null; channel: string; templateId: string | null; listId: string | null; status: string; scheduledAt: string | null; sentAt: string | null; recipientCount: number; sentCount: number; createdAt: string; }
export interface MarketingSend { id: string; campaignId: string; email: string; status: string; sentAt: string | null; }
export interface MarketingSuppression { id: string; email: string; reason: string; createdAt: string; }
export interface MarketingMailbox { id: string; email: string; displayName: string | null; provider: string; verified: boolean; hasCredentials: boolean; }
export interface SocialAccount { id: string; platform: string; handle: string; displayName: string | null; verified: boolean; hasCredentials: boolean; }
export interface SocialPost { id: string; platform: string; content: string; status: string; scheduledAt: string | null; publishedAt: string | null; externalId: string | null; createdAt: string; }
export interface DailyReport { id: string; reportDate: string; title: string; summary: string | null; metricsJson: unknown; createdAt: string; }
export interface MomMeeting { id: string; title: string; meetingDate: string; location: string | null; status: string; notes: string | null; createdAt: string; participants?: MomParticipant[]; agendas?: MomAgenda[]; decisions?: MomDecision[]; actions?: MomAction[]; }
export interface MomParticipant { id: string; name: string; email: string | null; role: string | null; present: boolean; }
export interface MomAgenda { id: string; topic: string; owner: string | null; notes: string | null; sortOrder: number; }
export interface MomDecision { id: string; decision: string; owner: string | null; }
export interface MomAction { id: string; title: string; assigneeName: string | null; dueDate: string | null; status: string; notes: string | null; isOverdue?: boolean; }
export interface ReportSnapshot { id: string; reportType: string; periodFrom: string | null; periodTo: string | null; dataJson: unknown; createdAt: string; }
export interface AiConversation { id: string; title: string | null; provider: string; model: string | null; status: string; createdAt: string; updatedAt: string; messages?: AiMessage[]; }
export interface AiMessage { id: string; role: string; content: string; toolName: string | null; createdAt: string; }
export interface AiToolCall { id: string; toolName: string; argsJson: unknown; resultJson: unknown; status: string; createdAt: string; }
export interface AiProviderConfig { id: string; provider: string; displayName: string; model: string | null; enabled: boolean; hasKey: boolean; }
export interface CreativeProject { id: string; name: string; type: string; status: string; contentJson: unknown; thumbnail: string | null; createdAt: string; updatedAt: string; assets?: CreativeAsset[]; }
export interface CreativeAsset { id: string; fileName: string; mimeType: string | null; sizeBytes: number | null; url: string | null; storageKey: string | null; }
