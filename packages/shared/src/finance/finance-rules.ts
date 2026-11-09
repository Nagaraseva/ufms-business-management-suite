/**
 * Finance domain rules — direct port of Accounts.gs (v4.0.0-step20)
 * Legacy reference: Accounts.gs:1-1161
 *
 * Every calculation here reproduces the legacy arithmetic byte-for-byte,
 * including its rounding and status-machine quirks. Where the legacy had a
 * defect (e.g. self-approval, CSV injection in payroll) we fixed it in
 * Phase 5; finance has no such injected defects so parity is exact.
 *
 * Three intentional non-parities (all documented in docs/known-defects-and-risks.md):
 *  D-F6-1  recompute* sums only APPROVED payments — legacy also counted
 *          rows whose ApprovalStatus was ""/null (pre-threshold records).
 *          New code is stricter and correct; parity tests pin the Approved-only path.
 *  D-F6-2  Bank balances are kept via delta + periodic recompute, not via
 *          Sheet mutation. The stored CurrentBalance is derived, not trusted input.
 *  D-F6-3  Stock balances are stored (RunningBalance) and updated transactionally,
 *          not recomputed by scanning all movements with a 30s cache.
 */

export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const VENDOR_BILL_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
export type VendorBillStatus = (typeof VENDOR_BILL_STATUSES)[number];

export const PAYMENT_MODES = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'CHEQUE', 'CASH', 'CARD', 'OTHER'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_TYPES = ['ACCOUNTS_RECEIPT', 'ACCOUNTS_VENDOR_PAYMENT', 'INDENT', 'PURCHASE_REQUEST'] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const BANK_ACCOUNT_TYPES = ['BANK', 'CASH', 'CREDIT_CARD', 'PETTY_CASH'] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export const JOURNAL_ENTRY_TYPES = ['RECEIPT', 'PAYMENT'] as const;
export type JournalEntryType = (typeof JOURNAL_ENTRY_TYPES)[number];

export const PURCHASE_ORDER_STATUSES = ['DRAFT', 'RELEASED', 'ACKNOWLEDGED', 'RECEIVED', 'CANCELLED'] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const INDENT_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED'] as const;
export const PR_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED'] as const;

export const APPROVAL_THRESHOLD = 200_000; // ₹2L — legacy ACCOUNTS_APPROVAL_THRESHOLD_

export type NumericInput = number | string;

// ---------------------------------------------------------------------------
// Helpers exactly as in Accounts.gs
// ---------------------------------------------------------------------------

export function caption2(n: NumericInput): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function toNumber(v: NumericInput): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// INVOICE — saveInvoice_ (Accounts.gs:399)
// ---------------------------------------------------------------------------

export interface InvoiceItemInput {
  description: string;
  hsnCode?: string;
  quantity: NumericInput;
  unit?: string;
  rate: NumericInput;
  taxPercent?: NumericInput;
}

export interface InvoiceCalc {
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  items: Array<{
    description: string;
    hsnCode: string;
    quantity: number;
    unit: string;
    rate: number;
    taxPercent: number;
    amount: number; // qty * rate (legacy: base)
  }>;
}

/**
 * Server-side item recalc — never trusts client totals.
 * Port of the map() inside saveInvoice_ plus the 3-line subtotal/tax/total.
 */
export function calculateInvoice(items: InvoiceItemInput[], taxPercentInput?: NumericInput): InvoiceCalc {
  const computed = items.map((it) => {
    const qty = toNumber(it.quantity);
    const rate = toNumber(it.rate);
    const taxPct = toNumber(it.taxPercent ?? taxPercentInput ?? 0);
    const base = qty * rate;
    return {
      description: String(it.description || '').trim(),
      hsnCode: String(it.hsnCode || '').trim(),
      quantity: qty,
      unit: String(it.unit || 'Month'),
      rate,
      taxPercent: taxPct,
      amount: base,
    };
  });
  if (!computed.length) throw new Error('At least one line item is required.');
  const subtotal = computed.reduce((s, it) => s + it.amount, 0);
  const taxPct = toNumber(taxPercentInput ?? 18);
  const taxAmount = Math.round(subtotal * taxPct) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal, taxPercent: taxPct, taxAmount, total, items: computed };
}

// ---------------------------------------------------------------------------
// VENDOR BILL — saveBill_ (Accounts.gs:650)
// ---------------------------------------------------------------------------

export interface VendorBillItemInput {
  description: string;
  hsnCode?: string;
  quantity: NumericInput;
  unit?: string;
  rate: NumericInput;
  taxPercent: NumericInput;
}

export interface VendorBillCalc {
  subtotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  tdsAmount: number;
  total: number;
  taxPercent: number; // from first item, as legacy does
  items: Array<{
    description: string;
    hsnCode: string;
    quantity: number;
    unit: string;
    rate: number;
    taxPercent: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    amount: number;
  }>;
}

export function calculateVendorBill(
  items: VendorBillItemInput[],
  opts: { supplyType?: string; tdsPercent?: NumericInput },
): VendorBillCalc {
  if (!items.length) throw new Error('At least one line item is required.');
  const supplyType = String(opts.supplyType || 'INTRA').toUpperCase();
  const computed = items.map((it) => {
    const qty = toNumber(it.quantity);
    const rate = toNumber(it.rate);
    const taxPct = toNumber(it.taxPercent);
    const base = qty * rate;
    const halfTax = Math.round((base * taxPct) / 200) / 100;
    let cgst = halfTax;
    let sgst = halfTax;
    let igst = 0;
    if (supplyType === 'INTER') {
      cgst = 0;
      sgst = 0;
      igst = halfTax * 2;
    }
    return {
      description: String(it.description || '').trim(),
      hsnCode: String(it.hsnCode || '').trim(),
      quantity: qty,
      unit: String(it.unit || ''),
      rate,
      taxPercent: taxPct,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      amount: base,
    };
  });
  const subtotal = computed.reduce((s, it) => s + it.amount, 0);
  const cgstTotal = computed.reduce((s, it) => s + it.cgstAmount, 0);
  const sgstTotal = computed.reduce((s, it) => s + it.sgstAmount, 0);
  const igstTotal = computed.reduce((s, it) => s + it.igstAmount, 0);
  const tdsPct = toNumber(opts.tdsPercent ?? 0);
  const tdsAmount = Math.round(subtotal * tdsPct) / 100;
  const total = Math.round((subtotal + cgstTotal + sgstTotal + igstTotal) * 100) / 100;
  const taxPercent = Number(computed[0]?.taxPercent ?? 0);
  return {
    subtotal,
    cgstTotal: caption2(cgstTotal),
    sgstTotal: caption2(sgstTotal),
    igstTotal: caption2(igstTotal),
    tdsAmount,
    total,
    taxPercent,
    items: computed,
  };
}

// ---------------------------------------------------------------------------
// PURCHASE ORDER — savePurchaseOrder_ (Assets.gs:1103)
// ---------------------------------------------------------------------------

export interface PurchaseOrderItemInput {
  stockItemId: string;
  itemName: string;
  quantity: NumericInput;
  unit?: string;
  unitCost: NumericInput;
  taxPercent?: NumericInput;
}

export interface PurchaseOrderCalc {
  subTotal: number;
  taxAmount: number;
  totalAmount: number;
}

export function calculatePurchaseOrder(items: PurchaseOrderItemInput[]): PurchaseOrderCalc {
  if (!items.length) throw new Error('Add at least one line item.');
  let subTotal = 0;
  let taxAmount = 0;
  for (const it of items) {
    const qty = Math.max(0, toNumber(it.quantity));
    const cost = Math.max(0, toNumber(it.unitCost));
    const taxPct = Math.max(0, toNumber(it.taxPercent ?? 0));
    const amt = qty * cost;
    subTotal += amt;
    taxAmount += (amt * taxPct) / 100;
  }
  const totalAmount = subTotal + taxAmount;
  return {
    subTotal: Math.round(subTotal),
    taxAmount: Math.round(taxAmount),
    totalAmount: Math.round(totalAmount),
  };
}

// ---------------------------------------------------------------------------
// PAYMENT STATUS MACHINES
// ---------------------------------------------------------------------------

export function recomputeInvoiceStatus(totalAmount: number, paidAmount: number, dueDate: string | null, today: string): InvoiceStatus {
  let status: InvoiceStatus;
  if (paidAmount <= 0) status = 'SENT';
  else if (paidAmount >= totalAmount) status = 'PAID';
  else status = 'PARTIALLY_PAID';
  if (status !== 'PAID') {
    if (dueDate && String(dueDate) < today) status = 'OVERDUE';
  }
  return status;
}

export function recomputeBillStatus(totalAmount: number, paidAmount: number, dueDate: string | null, today: string): VendorBillStatus {
  let status: VendorBillStatus;
  if (paidAmount <= 0) status = 'APPROVED';
  else if (paidAmount >= totalAmount) status = 'PAID';
  else status = 'PARTIALLY_PAID';
  if (status !== 'PAID') {
    if (dueDate && String(dueDate) < today) status = 'OVERDUE';
  }
  return status;
}

export function needsApproval(amount: number, threshold = APPROVAL_THRESHOLD): boolean {
  return amount > threshold;
}

// ---------------------------------------------------------------------------
// BANK / JOURNAL (Accounts.gs:162-206)
// ---------------------------------------------------------------------------

export interface JournalEntryValues {
  accountId: string;
  accountName: string;
  entryType: JournalEntryType;
  refType: string;
  refId: string;
  refNo: string;
  description: string;
  amount: number;
}

export function journalDebitCredit(entryType: JournalEntryType, amount: number): { debit: number; credit: number } {
  return {
    debit: entryType === 'RECEIPT' ? amount : 0,
    credit: entryType === 'PAYMENT' ? amount : 0,
  };
}

export function bankBalanceAfter(current: number, entryType: JournalEntryType, amount: number): number {
  return entryType === 'RECEIPT' ? current + amount : current - amount;
}

// ---------------------------------------------------------------------------
// REPORTS (Accounts.gs:953-1130)
// ---------------------------------------------------------------------------

export interface AgeingBucket {
  '0-30': number;
  '31-60': number;
  '61-90': number;
  '90+': number;
}

export function bucketAgeing(
  records: Array<{ dueDate: string | null; total: number; paid: number }>,
  todayStr: string,
): AgeingBucket {
  const today = new Date(todayStr);
  const buckets: AgeingBucket = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  for (const r of records) {
    const bal = r.total - r.paid;
    if (bal <= 0.01) continue;
    if (!r.dueDate) continue;
    const due = new Date(r.dueDate);
    if (isNaN(due.getTime())) continue;
    const days = Math.floor((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 30) buckets['0-30'] += bal;
    else if (days <= 60) buckets['31-60'] += bal;
    else if (days <= 90) buckets['61-90'] += bal;
    else buckets['90+'] += bal;
  }
  return buckets;
}

export interface GstrSummary {
  outputSubtotal: number;
  outputTax: number;
  inputSubtotal: number;
  inputTax: number;
  netPayable: number;
}

export function gstrSummary(
  invoices: Array<{ invoiceDate: string; subTotal: number; taxAmount: number; status: string }>,
  bills: Array<{ billDate: string; subTotal: number; cgst: number; sgst: number; igst: number; status: string }>,
  filter: { month?: number; year?: number },
): GstrSummary {
  const monthStr = filter.month ? String(filter.month).padStart(2, '0') : null;
  const yearStr = filter.year ? String(filter.year) : null;
  let outTax = 0, outSubtotal = 0;
  for (const i of invoices) {
    if (String(i.status).toUpperCase() === 'CANCELLED') continue;
    const d = String(i.invoiceDate || '');
    if (monthStr && yearStr && !d.startsWith(`${yearStr}-${monthStr}`)) continue;
    if (!monthStr && yearStr && !d.startsWith(yearStr)) continue;
    outTax += Number(i.taxAmount || 0);
    outSubtotal += Number(i.subTotal || 0);
  }
  let inTax = 0, inSubtotal = 0;
  for (const b of bills) {
    if (String(b.status).toUpperCase() === 'CANCELLED') continue;
    const d = String(b.billDate || '');
    if (monthStr && yearStr && !d.startsWith(`${yearStr}-${monthStr}`)) continue;
    if (!monthStr && yearStr && !d.startsWith(yearStr)) continue;
    inTax += Number(b.cgst || 0) + Number(b.sgst || 0) + Number(b.igst || 0);
    inSubtotal += Number(b.subTotal || 0);
  }
  return {
    outputTax: Math.round(outTax * 100) / 100,
    outputSubtotal: Math.round(outSubtotal * 100) / 100,
    inputTax: Math.round(inTax * 100) / 100,
    inputSubtotal: Math.round(inSubtotal * 100) / 100,
    netPayable: Math.round((outTax - inTax) * 100) / 100,
  };
}

export interface TdsSummary {
  totalBilled: number;
  totalDeducted: number;
  totalPending: number;
}

export function tdsSummary(
  bills: Array<{ tdsAmount: number; totalAmount: number; paidAmount: number; status: string }>,
  approvedPaymentsByBill: Map<string, number>, // billId -> sum TDS deducted
): TdsSummary {
  let totalBilled = 0, totalDeducted = 0, totalPending = 0;
  for (const b of bills as Array<{ id?: string; vendorBillId?: string } & typeof bills[number]>) {
    if (String((b as { status: string }).status).toUpperCase() === 'CANCELLED') continue;
    totalBilled += Number((b as { tdsAmount: number }).tdsAmount || 0);
    const key = (b as { id?: string; vendorBillId?: string }).id ?? (b as { vendorBillId?: string }).vendorBillId ?? '';
    const deducted = approvedPaymentsByBill.get(String(key)) ?? 0;
    totalDeducted += deducted;
    if (Number((b as { paidAmount: number }).paidAmount || 0) < Number((b as { totalAmount: number }).totalAmount || 0)) {
      totalPending += Number((b as { tdsAmount: number }).tdsAmount || 0);
    }
  }
  return {
    totalBilled: Math.round(totalBilled * 100) / 100,
    totalDeducted: Math.round(totalDeducted * 100) / 100,
    totalPending: Math.round(totalPending * 100) / 100,
  };
}

export interface ProfitLoss {
  income: number;
  expense: number;
  net: number;
}

export function profitLoss(
  invoices: Array<{ invoiceDate: string; totalAmount: number; status: string }>,
  bills: Array<{ billDate: string; totalAmount: number; status: string }>,
  fromDate?: string | null,
  toDate?: string | null,
): ProfitLoss {
  let income = 0, expense = 0;
  for (const i of invoices) {
    if (String(i.status).toUpperCase() === 'CANCELLED' || String(i.status).toUpperCase() === 'DRAFT') continue;
    const d = String(i.invoiceDate || '');
    if (fromDate && d < fromDate) continue;
    if (toDate && d > toDate) continue;
    income += Number(i.totalAmount || 0);
  }
  for (const b of bills) {
    if (String(b.status).toUpperCase() === 'CANCELLED' || String(b.status).toUpperCase() === 'DRAFT') continue;
    const d = String(b.billDate || '');
    if (fromDate && d < fromDate) continue;
    if (toDate && d > toDate) continue;
    expense += Number(b.totalAmount || 0);
  }
  return {
    income: Math.round(income * 100) / 100,
    expense: Math.round(expense * 100) / 100,
    net: Math.round((income - expense) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// PO STATE MACHINE (Assets.gs:1193-1305)
// ---------------------------------------------------------------------------

export const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ['RELEASED', 'CANCELLED'],
  RELEASED: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [],
  CANCELLED: [],
};

export function canTransitionPO(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return (PO_TRANSITIONS[from] ?? []).includes(to);
}

// ---------------------------------------------------------------------------
// ASSET HELPERS (Assets.gs:37-46)
// ---------------------------------------------------------------------------

export function assetEsc(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function assetMoney(v: NumericInput): string {
  const n = Number(v) || 0;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildInvoiceHtml(
  inv: { invoiceNo: string; invoiceDate: string; dueDate: string; clientName: string; periodFrom?: string | null; periodTo?: string | null; subTotal: number; taxPercent: number; taxAmount: number; totalAmount: number; notes?: string | null },
  items: Array<{ sortOrder: number; description: string; hsnCode?: string | null; quantity: number; unit: string; rate: number; amount: number }>,
  company: { name: string; address?: string; phone?: string; email?: string },
): string {
  const esc = assetEsc;
  const money = assetMoney;
  const rows = items.map((it) => `<tr><td>${it.sortOrder}</td><td>${esc(it.description)}${it.hsnCode ? `<br><small>HSN: ${esc(it.hsnCode)}</small>` : ''}</td><td class="num">${it.quantity} ${esc(it.unit)}</td><td class="num">${money(it.rate)}</td><td class="num">${money(it.amount)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:system-ui,sans-serif;color:#111;padding:24px;max-width:800px;margin:auto}
  h1{font-size:20px;margin:0}.muted{color:#666;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
  th{background:#f5f5f5}.num{text-align:right}.totals td{font-weight:600}
  </style></head><body>
  <h1>Tax Invoice — ${esc(inv.invoiceNo)}</h1>
  <div class="muted">${esc(company.name)}${company.address ? ' · ' + esc(company.address) : ''}</div>
  <p><b>Bill to:</b> ${esc(inv.clientName)}<br>
  Invoice date: ${esc(inv.invoiceDate)} · Due: ${esc(inv.dueDate)}
  ${inv.periodFrom ? `<br>Period: ${esc(inv.periodFrom)} to ${esc(inv.periodTo || '')}` : ''}</p>
  <table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody>
  <tfoot><tr class="totals"><td colspan="4" class="num">Subtotal</td><td class="num">${money(inv.subTotal)}</td></tr>
  <tr class="totals"><td colspan="4" class="num">Tax (${inv.taxPercent}%)</td><td class="num">${money(inv.taxAmount)}</td></tr>
  <tr class="totals"><td colspan="4" class="num">Total</td><td class="num">${money(inv.totalAmount)}</td></tr></tfoot></table>
  ${inv.notes ? `<p class="muted">Notes: ${esc(inv.notes)}</p>` : ''}
  </body></html>`;
}

export function buildPurchaseOrderHtml(
  po: { poNumber: string; poDate: string; expectedDeliveryDate?: string | null; vendorName: string; subTotal: number; taxAmount: number; totalAmount: number; notes?: string | null },
  items: Array<{ itemName: string; quantity: number; unit: string; unitCost: number; taxPercent: number; amount: number }>,
  vendor: { vendorName?: string; contactPerson?: string | null; mobile?: string | null; email?: string | null; gstin?: string | null; address?: string | null } | null,
  company: { name: string; address?: string; phone?: string; email?: string },
): string {
  const esc = assetEsc; const money = assetMoney;
  const rows = items.map((it, i) => {
    const amt = Number(it.quantity) * Number(it.unitCost);
    const tax = (amt * Number(it.taxPercent || 0)) / 100;
    return `<tr><td>${i + 1}</td><td>${esc(it.itemName)}</td><td>${esc(it.unit)}</td><td class="num">${it.quantity}</td><td class="num">${money(it.unitCost)}</td><td class="num">${it.taxPercent}%</td><td class="num">${money(amt)}</td><td class="num">${money(tax)}</td><td class="num"><b>${money(amt + tax)}</b></td></tr>`;
  }).join('');
  const vendorLines = [
    vendor?.vendorName ? `<b>${esc(vendor.vendorName)}</b>` : esc(po.vendorName),
    vendor?.contactPerson ? esc(vendor.contactPerson) : '',
    vendor?.mobile ? esc(vendor.mobile) : '',
    vendor?.email ? esc(vendor.email) : '',
    vendor?.gstin ? `GSTIN: ${esc(vendor.gstin)}` : '',
    vendor?.address ? esc(vendor.address).replace(/\n/g, '<br>') : '',
  ].filter(Boolean).join('<br>');
  const companyLines = [
    `<b>${esc(company.name)}</b>`,
    company.address ? esc(company.address).replace(/\n/g, '<br>') : '',
    company.phone ? `Phone: ${esc(company.phone)}` : '',
    company.email ? `Email: ${esc(company.email)}` : '',
  ].filter(Boolean).join('<br>');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:system-ui,sans-serif;color:#111;padding:24px;max-width:900px;margin:auto}
  h1{font-size:18px}.muted{color:#666;font-size:12px}
  .hdr{display:flex;justify-content:space-between;gap:24px}
  table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:6px 8px;font-size:12px}th{background:#f5f5f5}.num{text-align:right}
  </style></head><body>
  <h1>Purchase Order — ${esc(po.poNumber)}</h1>
  <div class="hdr"><div>${companyLines}<br><br><b>Vendor</b><br>${vendorLines}</div>
  <div style="text-align:right"><b>Date:</b> ${esc(po.poDate)}<br>${po.expectedDeliveryDate ? `<b>Expected:</b> ${esc(po.expectedDeliveryDate)}<br>` : ''}<b>Status:</b> ${esc(String((po as unknown as { status?: string }).status || ''))}</div></div>
  <table><thead><tr><th>#</th><th>Item</th><th>Unit</th><th>Qty</th><th>Unit cost</th><th>Tax%</th><th>Amount</th><th>Tax</th><th>Total</th></tr></thead><tbody>${rows}</tbody>
  <tfoot><tr><td colspan="6" class="num"><b>Subtotal</b></td><td class="num"><b>${money(po.subTotal)}</b></td><td class="num"><b>${money(po.taxAmount)}</b></td><td class="num"><b>${money(po.totalAmount)}</b></td></tr></tfoot></table>
  ${po.notes ? `<p class="muted">Notes: ${esc(po.notes)}</p>` : ''}
  </body></html>`;
}
