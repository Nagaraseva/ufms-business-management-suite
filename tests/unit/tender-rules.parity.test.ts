/**
 * Tender rules — differential parity with legacy v5.6.61.
 *
 * Phase 3 exit criterion: "Tender lifecycle works with NO LeadID dependency."
 * plus preservation of the TND numbering and the one ordering convention.
 *
 * The numbering, ordering and metrics functions are diffed against the real
 * legacy implementations extracted from Tenders.gs / Database.gs.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  TENDER_STATUSES, FOLLOWUP_STATUSES, nextTenderNo, makeTenderRecordId,
  isAutoTenderNo, validateTender, isDuplicateTenderNo, sortTendersBySubmission,
  tenderMetrics, deriveResultReason, shouldCreateOrder, isValidFollowupStatus,
  isVisibleTender, type TenderStatus,
} from '@ufms/shared/tenders/tender-rules';

const require = createRequire(import.meta.url);
const { buildTenderOracle } = require('./legacy-oracle.mjs') as {
  buildTenderOracle: () => {
    nextCode: (existing: string[], prefix?: string, year?: number) => string;
    sortTenders: (list: any[]) => any[];
    metrics: (tenders: any[]) => any;
    TENDER_STATUSES: string[];
  };
};

let oracle: ReturnType<typeof buildTenderOracle>;
try { oracle = buildTenderOracle(); } catch { oracle = null as any; }
const HAS_LEGACY = !!oracle;

describe.skipIf(!HAS_LEGACY)('TND numbering parity with legacy nextCode_()', () => {
  const cases = [
    { label: 'empty sheet', existing: [] as string[], year: 2026 },
    { label: 'one number', existing: ['TND-2026-0001'], year: 2026 },
    { label: 'gap in sequence', existing: ['TND-2026-0001', 'TND-2026-0005'], year: 2026 },
    { label: 'previous years present', existing: ['TND-2025-0099', 'TND-2026-0002'], year: 2026 },
    { label: 'operator free-text numbers present', existing: ['GEM/2026/B/123', 'TND-2026-0003'], year: 2026 },
    { label: 'nine thousand range', existing: ['TND-2026-9999'], year: 2026 },
    { label: 'unsorted input', existing: ['TND-2026-0007', 'TND-2026-0002', 'TND-2026-0011'], year: 2026 },
    { label: 'blank and null mixed in', existing: ['', 'TND-2026-0004'], year: 2026 },
  ];

  for (const c of cases) {
    it(`matches legacy: ${c.label}`, () => {
      const legacy = oracle.nextCode(c.existing, 'TND', c.year);
      const ours = nextTenderNo(c.existing, c.year);
      expect(ours).toBe(legacy);
    });
  }

  it('restarts the sequence in a new calendar year', () => {
    const existing = ['TND-2025-0042', 'TND-2025-0043'];
    expect(nextTenderNo(existing, 2026)).toBe('TND-2026-0001');
    expect(nextTenderNo(existing, 2026)).toBe(oracle.nextCode(existing, 'TND', 2026));
  });

  it('ignores numbers that do not match the stem exactly', () => {
    const junk = ['TND-2026-12A', 'TND2026-0001', 'tnd-2026-0009', 'TND-2026-0012-EXTRA'];
    expect(nextTenderNo(junk, 2026)).toBe('TND-2026-0001');
    expect(nextTenderNo(junk, 2026)).toBe(oracle.nextCode(junk, 'TND', 2026));
  });

  it('produces a four-digit padded suffix even past 9999', () => {
    const big = ['TND-2026-9999'];
    const legacy = oracle.nextCode(big, 'TND', 2026);
    expect(nextTenderNo(big, 2026)).toBe(legacy);
    expect(nextTenderNo(big, 2026)).toBe('TND-2026-10000');
  });
});

describe('Tender record identifier shape', () => {
  it('matches the legacy id_() shape TND-yyyyMMdd-XXXXXXXX', () => {
    const d = new Date(Date.UTC(2026, 10, 7)); // 2026-11-07
    const id = makeTenderRecordId(d, 'a1b2c3d4e5f6');
    expect(id).toBe('TND-20261107-A1B2C3D4');
    expect(id).toMatch(/^TND-\d{8}-[0-9A-F]{8}$/);
  });

  it('recognises an auto-generated business number', () => {
    expect(isAutoTenderNo('TND-2026-0001')).toBe(true);
    expect(isAutoTenderNo('GEM/2026/B/1234')).toBe(false);
  });
});

describe.skipIf(!HAS_LEGACY)('Submission ordering parity with tenderSubmissionSort_()', () => {
  const corpus = [
    { id: 'a', submissionDate: '2026-11-20', updatedAt: '2026-11-01T10:00:00Z' },
    { id: 'b', submissionDate: '2026-11-05', updatedAt: '2026-11-02T10:00:00Z' },
    { id: 'c', submissionDate: '2026-11-20', updatedAt: '2026-11-03T10:00:00Z' },
    { id: 'd', submissionDate: null, updatedAt: '2026-11-04T10:00:00Z' },
    { id: 'e', submissionDate: '2026-11-01', updatedAt: null },
  ];

  it('orders identically to the legacy comparator', () => {
    const legacy = oracle.sortTenders(corpus.map((x) => ({ ...x }))).map((x: any) => x.id);
    const ours = sortTendersBySubmission(corpus).map((x) => x.id);
    expect(ours).toEqual(legacy);
  });

  it('places a tender with no submission date LAST, never first', () => {
    const ids = sortTendersBySubmission(corpus).map((x) => x.id);
    expect(ids[ids.length - 1]).toBe('d');
  });

  it('breaks ties by most recently updated first', () => {
    const tied = sortTendersBySubmission([
      { id: 'old', submissionDate: '2026-11-20', updatedAt: '2026-11-01' },
      { id: 'new', submissionDate: '2026-11-20', updatedAt: '2026-11-09' },
    ]);
    expect(tied.map((x) => x.id)).toEqual(['new', 'old']);
  });

  it('does not throw when updatedAt is missing (legacy inline version did)', () => {
    expect(() => sortTendersBySubmission([{ submissionDate: '2026-11-01' }, { submissionDate: '2026-11-05' }])).not.toThrow();
  });
});

describe.skipIf(!HAS_LEGACY)('Dashboard metrics parity with tenderDashboardMetricsServer_()', () => {
  const today = '2026-11-07';
  const tenders = [
    { status: 'NEW', submissionDate: '2026-11-07', createdAt: '2026-11-07T09:00:00Z', tenderValue: 100000 },
    { status: 'DOCUMENTS_PENDING', submissionDate: '2026-11-10', createdAt: '2026-11-06T09:00:00Z', tenderValue: 250000 },
    { status: 'SUBMITTED', submissionDate: '2026-11-02', createdAt: '2026-10-01T09:00:00Z', tenderValue: 50000 },
    { status: 'TECHNICALLY_QUALIFIED', submissionDate: '2026-11-15', createdAt: '2026-10-20T09:00:00Z', tenderValue: 300000 },
    { status: 'FINANCIALLY_WON', submissionDate: '2026-10-01', createdAt: '2026-09-30T09:00:00Z', tenderValue: 900000 },
    { status: 'LOST', submissionDate: '2026-10-05', createdAt: '2026-09-28T09:00:00Z', tenderValue: 70000 },
    { status: 'CANCELLED', submissionDate: '2026-10-09', createdAt: '2026-09-29T09:00:00Z', tenderValue: 0 },
    { status: 'NEW', submissionDate: '2026-12-30', createdAt: '2026-11-05T09:00:00Z', tenderValue: 120000 },
  ];

  it('produces the same counters as the legacy function', () => {
    const legacy = oracle.metrics(tenders.map((t) => ({ ...t })), today);
    const ours = tenderMetrics(tenders, today);

    expect(ours.totalOpen).toBe(legacy.totalOpen);
    expect(ours.participated).toBe(legacy.participated);
    expect(ours.dueToday).toBe(legacy.dueToday);
    expect(ours.addedToday).toBe(legacy.addedToday);
    expect(ours.documentsPending).toBe(legacy.documentsPending);
    expect(ours.dueWithin7Days).toBe(legacy.dueWithin7Days);
    expect(ours.technicallyQualified).toBe(legacy.technicallyQualified);
    expect(ours.won).toBe(legacy.won);
    expect(ours.openTenderValue).toBe(legacy.openTenderValue);
  });

  it('excludes closed tenders from the open value', () => {
    const m = tenderMetrics(tenders, today);
    // open = everything not FINANCIALLY_WON / LOST / CANCELLED
    expect(m.openTenderValue).toBe(100000 + 250000 + 50000 + 300000 + 120000);
  });

  it('handles an empty book without throwing', () => {
    expect(tenderMetrics([], today).totalOpen).toBe(0);
  });
});

describe('Tender validation (legacy tenderRecordFromPayload_ rules)', () => {
  const base = {
    tenderTitle: 'Housekeeping services', portal: 'GeM', sector: 'Facility',
    submissionDate: '2026-12-01',
  };

  it('accepts a minimal valid tender', () => {
    expect(validateTender(base)).toEqual([]);
  });

  it('requires title, portal, sector and submission date', () => {
    const issues = validateTender({});
    const fields = issues.map((i) => i.field);
    expect(fields).toContain('tenderTitle');
    expect(fields).toContain('portal');
    expect(fields).toContain('sector');
    expect(fields).toContain('submissionDate');
  });

  it('rejects a portal URL without a scheme', () => {
    const issues = validateTender({ ...base, portalUrl: 'gem.gov.in/tender' });
    expect(issues.some((i) => i.field === 'portalUrl')).toBe(true);
  });

  it('accepts http and https portal URLs', () => {
    expect(validateTender({ ...base, portalUrl: 'https://gem.gov.in' })).toEqual([]);
    expect(validateTender({ ...base, portalUrl: 'http://gem.gov.in' })).toEqual([]);
  });

  it('rejects a security deposit percentage above 100', () => {
    const issues = validateTender({ ...base, securityDepositPercent: 101, securityDepositForm: 'PBG' });
    expect(issues.some((i) => i.field === 'securityDepositPercent')).toBe(true);
  });

  it('requires a form when the deposit percentage is above zero', () => {
    const issues = validateTender({ ...base, securityDepositPercent: 5 });
    expect(issues.some((i) => i.field === 'securityDepositForm')).toBe(true);
  });

  it('rejects an unknown deposit form', () => {
    const issues = validateTender({ ...base, securityDepositPercent: 5, securityDepositForm: 'CHEQUE' });
    expect(issues.some((i) => i.field === 'securityDepositForm')).toBe(true);
  });

  it('accepts the three legacy deposit forms', () => {
    for (const form of ['PBG', 'TD', 'FDR']) {
      expect(validateTender({ ...base, securityDepositPercent: 5, securityDepositForm: form })).toEqual([]);
    }
  });

  it('rejects negative money instead of silently clamping to zero', () => {
    const issues = validateTender({ ...base, emdAmount: -1 });
    expect(issues.some((i) => i.field === 'emdAmount')).toBe(true);
  });

  it('allows a zero deposit percentage with no form', () => {
    expect(validateTender({ ...base, securityDepositPercent: 0 })).toEqual([]);
  });
});

describe('Tender number uniqueness (case-insensitive, per company)', () => {
  const existing = [
    { id: '1', tenderNo: 'TND-2026-0001' },
    { id: '2', tenderNo: 'GEM/2026/B/0099' },
  ];

  it('detects a duplicate regardless of case', () => {
    expect(isDuplicateTenderNo('tnd-2026-0001', existing)).toBe(true);
    expect(isDuplicateTenderNo('gem/2026/b/0099', existing)).toBe(true);
  });

  it('allows the record being edited to keep its own number', () => {
    expect(isDuplicateTenderNo('TND-2026-0001', existing, '1')).toBe(false);
  });

  it('allows a genuinely new number', () => {
    expect(isDuplicateTenderNo('TND-2026-0002', existing)).toBe(false);
  });
});

describe('Follow-up rules', () => {
  it('exposes the eight legacy statuses in order', () => {
    expect([...TENDER_STATUSES]).toEqual([
      'NEW', 'DOCUMENTS_PENDING', 'READY_TO_SUBMIT', 'SUBMITTED',
      'TECHNICALLY_QUALIFIED', 'FINANCIALLY_WON', 'LOST', 'CANCELLED',
    ]);
  });

  it('a follow-up may never set the initial NEW status', () => {
    expect(isValidFollowupStatus('NEW')).toBe(false);
    expect(FOLLOWUP_STATUSES).not.toContain('NEW');
    for (const s of FOLLOWUP_STATUSES) expect(isValidFollowupStatus(s)).toBe(true);
  });

  it('derives the result reason from notes for LOST and CANCELLED', () => {
    expect(deriveResultReason('LOST', 'Rate too high')).toBe('Rate too high');
    expect(deriveResultReason('CANCELLED', 'Authority withdrew')).toBe('Authority withdrew');
    expect(deriveResultReason('SUBMITTED', 'Submitted online')).toBe('');
  });

  it('prefers an explicit result reason over the notes', () => {
    expect(deriveResultReason('LOST', 'Rate too high', 'Lost on price')).toBe('Lost on price');
  });

  it('financially won is the only status that creates an order', () => {
    expect(shouldCreateOrder('FINANCIALLY_WON')).toBe(true);
    for (const s of TENDER_STATUSES.filter((x) => x !== 'FINANCIALLY_WON')) {
      expect(shouldCreateOrder(s)).toBe(false);
    }
  });

  it('draft tenders are hidden from every list surface', () => {
    expect(isVisibleTender('DRAFT')).toBe(false);
    expect(isVisibleTender('NEW')).toBe(true);
  });
});
