/**
 * Tender domain rules
 * ===================
 * Pure functions reproduced from the legacy tender module of v5.6.61
 * (`Tenders.gs`). Kept free of I/O so they can be unit-tested against the
 * legacy behaviour and reused by the API and the worker.
 *
 * SOURCES
 *   TENDER_STATUSES        Tenders.gs:1
 *   nextCode_              Database.gs:855  (TND-YYYY-NNNN numbering)
 *   id_                    Database.gs      (TND-yyyyMMdd-XXXXXXXX record id)
 *   tenderRecordFromPayload_ Tenders.gs:106 (validation rules)
 *   addTenderFollowup_     Tenders.gs:181   (follow-up rules)
 *   tenderDashboardMetricsServer_ Tenders.gs:39
 *   tenderSubmissionSort_  Tenders.gs:69    (the ONE ordering convention)
 *   canAccessTender_       Tenders.gs:18
 */

/* ------------------------------------------------------------------ *
 * STATUSES
 * ------------------------------------------------------------------ */

/**
 * The eight statuses a tender may be moved to via a follow-up.
 * NOTE: 'NEW' is deliberately excluded — a follow-up cannot set the initial
 * status, exactly as the legacy code rejects it.
 */
export const TENDER_STATUSES = [
  'NEW',
  'DOCUMENTS_PENDING',
  'READY_TO_SUBMIT',
  'SUBMITTED',
  'TECHNICALLY_QUALIFIED',
  'FINANCIALLY_WON',
  'LOST',
  'CANCELLED',
] as const;

export type TenderStatus = (typeof TENDER_STATUSES)[number];

/** Statuses that a follow-up may set (everything except the initial NEW). */
export const FOLLOWUP_STATUSES: TenderStatus[] = TENDER_STATUSES.filter((s) => s !== 'NEW');

/** Statuses that close a tender — excluded from "open" metrics. */
export const CLOSED_STATUSES: TenderStatus[] = ['FINANCIALLY_WON', 'LOST', 'CANCELLED'];

/** The status at which an order is created automatically. */
export const WON_STATUS: TenderStatus = 'FINANCIALLY_WON';

/** A wizard draft is staging only: hidden from lists, reports, search, exports. */
export const DRAFT_STATUS = 'DRAFT';

export function isValidStatus(s: string): s is TenderStatus {
  return (TENDER_STATUSES as readonly string[]).includes(s);
}

/**
 * Follow-up status validation, mirroring `addTenderFollowup_`:
 *   - must be a known status
 *   - must not be 'NEW'
 */
export function isValidFollowupStatus(s: string): s is TenderStatus {
  return isValidStatus(s) && s !== 'NEW';
}

/* ------------------------------------------------------------------ *
 * NUMBERING — legacy `nextCode_`
 * ------------------------------------------------------------------ */

const TND_PREFIX = 'TND';
const TND_PAD = 4;

/**
 * Allocate the next tender number for a year.
 *
 * Legacy semantics (preserved exactly):
 *   - stem is `TND-<year>-`
 *   - the sequence is the maximum existing numeric suffix **+ 1**
 *   - the sequence **restarts each calendar year**
 *   - zero-padded to 4 digits
 *   - numbers that do not match the stem pattern are ignored, so an operator's
 *     free-text portal number never disturbs the sequence
 *
 * The caller passes the numbers already present for that company+year.
 */
export function nextTenderNo(existingNumbers: string[], year: number = new Date().getFullYear()): string {
  const stem = `${TND_PREFIX}-${year}-`;
  const re = new RegExp(`^${stem.replace(/[-]/g, '\\-')}(\\d+)$`);
  let max = 0;
  for (const raw of existingNumbers) {
    const m = String(raw ?? '').match(re);
    if (m) {
      const seq = parseInt(m[1], 10);
      if (Number.isFinite(seq) && seq > max) max = seq;
    }
  }
  return stem + String(max + 1).padStart(TND_PAD, '0');
}

/**
 * Legacy record identifier shape: `TND-<yyyyMMdd>-<8 uppercase hex>`.
 * This is the internal key; it is NOT the business number.
 */
export function makeTenderRecordId(date: Date = new Date(), hex8: string): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${TND_PREFIX}-${y}${m}${d}-${hex8.slice(0, 8).toUpperCase()}`;
}

/** True when the number follows the auto-generated TND-YYYY-NNNN shape. */
export function isAutoTenderNo(v: string): boolean {
  return /^TND-\d{4}-\d+$/.test(String(v ?? ''));
}

/* ------------------------------------------------------------------ *
 * VALIDATION — legacy `tenderRecordFromPayload_`
 * ------------------------------------------------------------------ */

export interface TenderInput {
  tenderNo?: string;
  tenderTitle?: string;
  portal?: string;
  portalUrl?: string;
  sector?: string;
  submissionDate?: string;
  tenderFee?: number | string;
  emdAmount?: number | string;
  bgAmount?: number | string;
  amcAmount?: number | string;
  tenderValue?: number | string;
  securityDepositPercent?: number | string;
  securityDepositForm?: string;
  tenureMonths?: number | string;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Validate a tender payload. Returns [] when valid.
 * Messages are the legacy wording where it existed, so operators see the same
 * guidance they are used to.
 */
export function validateTender(input: TenderInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!String(input.tenderTitle ?? '').trim()) {
    issues.push({ field: 'tenderTitle', message: 'Tender title is required.' });
  }
  if (!String(input.portal ?? '').trim()) {
    issues.push({ field: 'portal', message: 'Portal is required.' });
  }
  if (!String(input.sector ?? '').trim()) {
    issues.push({ field: 'sector', message: 'Sector is required.' });
  }
  if (!String(input.submissionDate ?? '').trim()) {
    issues.push({ field: 'submissionDate', message: 'Submission date is required.' });
  }

  const url = String(input.portalUrl ?? '').trim();
  if (url && !/^https?:\/\//i.test(url)) {
    issues.push({ field: 'portalUrl', message: 'Portal URL must begin with http:// or https://.' });
  }

  const sdPercent = n(input.securityDepositPercent);
  if (sdPercent < 0) {
    issues.push({ field: 'securityDepositPercent', message: 'Security Deposit percentage cannot be negative.' });
  }
  if (sdPercent > 100) {
    issues.push({ field: 'securityDepositPercent', message: 'Security Deposit percentage cannot exceed 100%.' });
  }

  const form = String(input.securityDepositForm ?? '').trim().toUpperCase();
  if (form && !['PBG', 'TD', 'FDR'].includes(form)) {
    issues.push({ field: 'securityDepositForm', message: 'Invalid form of Security Deposit.' });
  }
  if (sdPercent > 0 && !form) {
    issues.push({ field: 'securityDepositForm', message: 'Select the form of Security Deposit.' });
  }

  // Negative money is clamped to zero by the legacy code rather than rejected;
  // we reject instead so a typo cannot silently become a zero-value tender.
  for (const [field, label] of [
    ['tenderFee', 'Tender fee'],
    ['emdAmount', 'EMD amount'],
    ['bgAmount', 'BG amount'],
    ['amcAmount', 'AMC amount'],
    ['tenderValue', 'Tender value'],
  ] as const) {
    if (n((input as any)[field]) < 0) {
      issues.push({ field, message: `${label} cannot be negative.` });
    }
  }

  if (n(input.tenureMonths) < 0) {
    issues.push({ field: 'tenureMonths', message: 'Tenure cannot be negative.' });
  }

  return issues;
}

/**
 * Legacy duplicate rule: the number is unique per company, case-insensitively,
 * among active tenders, excluding the record being updated.
 */
export function isDuplicateTenderNo(
  candidate: string,
  existing: Array<{ tenderNo: string; id?: string }>,
  currentId?: string,
): boolean {
  const target = String(candidate ?? '').trim().toLowerCase();
  return existing.some(
    (t) => String(t.tenderNo ?? '').trim().toLowerCase() === target && (!currentId || t.id !== currentId),
  );
}

/* ------------------------------------------------------------------ *
 * ORDERING — legacy `tenderSubmissionSort_`
 * ------------------------------------------------------------------ */

export interface SortableTender {
  submissionDate?: string | Date | null;
  updatedAt?: string | Date | null;
}

const isoDay = (v: string | Date | null | undefined): string => {
  if (!v) return '9999-12-31'; // legacy sentinel: no date sorts LAST
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

/**
 * The single ordering convention for tenders.
 *   - submission date ascending (earliest deadline first)
 *   - a tender with NO submission date sorts last, not first
 *   - ties break by updatedAt DESCENDING (most recently worked first)
 *   - tolerant of a missing updatedAt (the legacy inline version threw on it)
 */
export function sortTendersBySubmission<T extends SortableTender>(tenders: T[]): T[] {
  return [...tenders].sort((a, b) => {
    const byDate = isoDay(a.submissionDate).localeCompare(isoDay(b.submissionDate));
    if (byDate) return byDate;
    return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
  });
}

/* ------------------------------------------------------------------ *
 * DASHBOARD METRICS — legacy `tenderDashboardMetricsServer_`
 * ------------------------------------------------------------------ */

export interface MetricsTender extends SortableTender {
  status: string;
  createdAt?: string | Date | null;
  tenderValue?: number | string | null;
  documentsPending?: string | null;
}

export interface TenderMetrics {
  totalOpen: number;
  participated: number;
  dueToday: number;
  addedToday: number;
  documentsPending: number;
  dueWithin7Days: number;
  technicallyQualified: number;
  won: number;
  openTenderValue: number;
}

/**
 * Reproduce the legacy dashboard counters.
 * "today" is passed in (the server operates in Asia/Kolkata) rather than read
 * from the clock, so the function stays pure and testable.
 */
export function tenderMetrics(tenders: MetricsTender[], today: string): TenderMetrics {
  const open = tenders.filter((t) => !CLOSED_STATUSES.includes(t.status as TenderStatus));

  const nextWeek = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  })();

  return {
    totalOpen: open.length,
    participated: tenders.filter((t) =>
      ['SUBMITTED', 'TECHNICALLY_QUALIFIED', 'FINANCIALLY_WON', 'LOST'].includes(t.status),
    ).length,
    dueToday: open.filter((t) => isoDay(t.submissionDate) === today).length,
    addedToday: tenders.filter((t) => isoDay(t.createdAt) === today).length,
    documentsPending: tenders.filter((t) => t.status === 'DOCUMENTS_PENDING').length,
    dueWithin7Days: open.filter((t) => {
      const d = isoDay(t.submissionDate);
      return d !== '9999-12-31' && d >= today && d <= nextWeek;
    }).length,
    technicallyQualified: tenders.filter((t) => t.status === 'TECHNICALLY_QUALIFIED').length,
    won: tenders.filter((t) => t.status === 'FINANCIALLY_WON').length,
    openTenderValue: open.reduce((sum, t) => sum + n(t.tenderValue), 0),
  };
}

/* ------------------------------------------------------------------ *
 * FOLLOW-UP DERIVATIONS — legacy `addTenderFollowup_`
 * ------------------------------------------------------------------ */

/**
 * The legacy rule for the recorded result reason:
 * an explicit reason wins; otherwise, for LOST/CANCELLED the notes become the
 * reason so the loss is always explainable.
 */
export function deriveResultReason(status: string, notes: string, explicit?: string): string {
  const given = String(explicit ?? '').trim();
  if (given) return given;
  if (status === 'LOST' || status === 'CANCELLED') return String(notes ?? '').trim();
  return '';
}

/** A tender reaching FINANCIALLY_WON must produce an order. */
export function shouldCreateOrder(status: string): boolean {
  return status === WON_STATUS;
}

/* ------------------------------------------------------------------ *
 * ACCESS — legacy `canAccessTender_`
 * ------------------------------------------------------------------ */

/**
 * Who may see a tender. Mirrors the legacy role list, translated to the new
 * permission model: the API checks `tender:read`; this function only decides
 * the row-level narrowing (own-records-only for a tender desk executive).
 */
export function canAccessTenderByOwnership(
  roles: string[],
  permissionCodes: string[],
  tender: { assignedToId?: string | null },
  userId: string,
): boolean {
  if (roles.includes('tenant_owner') || roles.includes('tenant_admin')) return true;
  if (permissionCodes.includes('tender:read')) return true;   // desk-wide read
  if (permissionCodes.includes('tender:read:own')) {
    return tender.assignedToId === userId;
  }
  return false;
}

/** Draft tenders never appear in lists, dashboards, reports, search or exports. */
export function isVisibleTender(status: string): boolean {
  return String(status ?? '').toUpperCase() !== DRAFT_STATUS;
}
