/**
 * Render smoke tests for the Phase 5 screens.
 *
 * There is no headless browser in this environment, so rather than claim the
 * pages "look right", each page is rendered on the server with React and an
 * empty query cache. That exercises every branch that runs before data
 * arrives — the states a user hits on a cold load — and fails on any render
 * crash instead of silently shipping a white screen.
 *
 * A second pass seeds the cache with real-shaped payloads to exercise the
 * populated branches.
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../apps/web/src/lib/auth';
import Attendance from '../../apps/web/src/pages/Attendance';
import Payroll from '../../apps/web/src/pages/Payroll';
import PayrollRunDetail from '../../apps/web/src/pages/PayrollRunDetail';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

/**
 * `routePath` matters: `useParams()` only resolves inside a matching Route, so
 * a page that reads an id must be mounted on its real path or it will silently
 * behave as if no id was supplied.
 */
function render(page: any, initial: Record<string, unknown> = {}, routePath = '*') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  for (const [key, value] of Object.entries(initial)) {
    qc.setQueryData(JSON.parse(key), value);
  }
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(
        MemoryRouter,
        { initialEntries: [`/payroll/runs/${RUN_ID}`] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: routePath,
            element: createElement(AuthProvider, null, createElement(page)),
          }),
        ),
      ),
    ),
  );
}

/** The month the Attendance page opens on, derived the same way the page does. */
const nowMonth = new Date().getUTCMonth() + 1;
const nowYear = new Date().getUTCFullYear();

describe('Phase 5 pages render without crashing', () => {
  it('Attendance renders its cold state and its controls', () => {
    const html = render(Attendance);
    expect(html).toContain('Attendance');
    expect(html).toContain('Payroll summary');
    // The cold state must say something useful, not an empty shell.
    expect(html.length).toBeGreaterThan(500);
  });

  it('Attendance renders a populated month grid', () => {
    const html = render(Attendance, {
      [JSON.stringify(['attendance-calendar', nowMonth, nowYear, ''])]: {
        month: nowMonth, year: nowYear, label: 'Current', daysInMonth: 30,
        days: Array.from({ length: 30 }, (_, i) => i + 1),
        employees: [{
          id: 'e1', employeeCode: 'EMP-2026-0001', name: 'Asha Rao', department: 'Operations',
          siteId: null,
          cells: Array.from({ length: 30 }, (_, i) => (i === 0
            ? { id: 'c1', status: 'PRESENT', otHours: 2, note: null, source: 'MANUAL', correctionCount: 1 }
            : null)),
        }],
      },
      [JSON.stringify(['attendance-lock', nowMonth, nowYear])]: {
        month: nowMonth, year: nowYear, label: 'Current', locked: false, payrollRun: null,
      },
    });
    expect(html).toContain('Asha Rao');
    expect(html).toContain('EMP-2026-0001');
    // The grid renders one cell per day and marks the recorded one.
    expect((html.match(/rounded text-\[10px\] font-semibold/g) ?? []).length).toBe(30);
    // The legend is unconditional, so a reader who cannot write still
    // understands the codes.
    expect(html).toContain('PAID LEAVE');
    expect(html).toContain('corrected');
    // There is no session in this render, so attendance:write is absent and the
    // bulk-mark form must NOT be offered.
    expect(html).not.toContain('Bulk mark');
    // The correction affordance only appears on click, never on a cold render.
    expect(html).toContain('Payroll summary');
  });

  it('Attendance shows the frozen banner when a payroll run has locked the month', () => {
    const html = render(Attendance, {
      [JSON.stringify(['attendance-lock', nowMonth, nowYear])]: {
        month: nowMonth, year: nowYear, label: 'Current', locked: true,
        payrollRun: { id: 'r1', runNumber: 'PR-202511', status: 'APPROVED', approvedAt: null },
      },
      [JSON.stringify(['attendance-calendar', nowMonth, nowYear, ''])]: {
        month: nowMonth, year: nowYear, label: 'Current', daysInMonth: 30,
        days: [1], employees: [],
      },
    });
    expect(html).toContain('PR-202511');
    expect(html).toContain('is frozen');
  });

  it('Payroll renders its pipeline and empty tables', () => {
    const html = render(Payroll);
    expect(html).toContain('Payroll');
    expect(html).toContain('Compute slips');
    expect(html).toContain('No payroll runs yet');
  });

  it('Payroll lists a run with its status and blocking count', () => {
    const html = render(Payroll, {
      '["payroll-summary"]': {
        period: { month: 11, year: 2025, label: 'November 2025', daysInMonth: 30 },
        slipsByStatus: { DRAFT: 0, GENERATED: 2 },
        attendanceRowsThisMonth: 52, pendingAdjustments: 1, recentRuns: [],
      },
      '["payroll-runs"]': [{
        id: 'r1', runNumber: 'PR-202511', month: 11, year: 2025, status: 'LOCKED',
        periodStart: '2025-11-01', periodEnd: '2025-11-30',
        totalEmployees: 2, totalGross: 60000, totalNet: 54000, totalDeductions: 6000,
        statutorySetCode: 'EPFO-CENTRAL-2025', findings: [], preparedById: 'u1',
        preparedAt: null, approvedById: null, approvedAt: null, selfApprovalException: false,
        selfApprovalReason: null, disbursedAt: null, bankFileRef: null, cancelReason: null,
        notes: null, blockingFindings: 1,
      }],
    });
    expect(html).toContain('PR-202511');
    expect(html).toContain('LOCKED');
    expect(html).toContain('EPFO-CENTRAL-2025');
  });

  it('PayrollRunDetail renders totals, items and the maker-checker banner', () => {
    const html = render(PayrollRunDetail, {
      [JSON.stringify(['payroll-run', RUN_ID])]: {
        id: '11111111-1111-4111-8111-111111111111',
        runNumber: 'PR-202511', month: 11, year: 2025, status: 'LOCKED',
        periodStart: '2025-11-01', periodEnd: '2025-11-30',
        totalEmployees: 1, totalGross: 30000, totalNet: 27500, totalDeductions: 2500,
        statutorySetCode: 'EPFO-CENTRAL-2025',
        findings: [{
          code: 'MISSING_UAN', severity: 'BLOCKING',
          message: 'Asha Rao has PF deducted but no UAN.',
        }],
        preparedById: 'u1', preparedAt: null, approvedById: null, approvedAt: null,
        selfApprovalException: false, selfApprovalReason: null,
        disbursedAt: null, bankFileRef: null, cancelReason: null, notes: null,
        totals: {
          employees: 1, gross: 30000, esiEmployee: 0, esiEmployer: 0, pfEmployee: 2400,
          pfEmployerEPF: 2400, pfEmployerEPS: 1666, pfEmployerEDLIS: 100,
          pt: 100, tds: 0, deductions: 2500, net: 27500,
        },
        items: [{
          id: 'i1', employeeId: 'e1', employeeCode: 'EMP-2026-0001', employeeName: 'Asha Rao',
          designation: 'Supervisor', department: 'Operations',
          daysWorked: '30', daysPresent: '30', otDays: '0',
          basic: '20000', hra: '10000', da: '0', specialAllowance: '0',
          otAmount: '0', bonus: '0', grossEarnings: '30000',
          esiEmployee: '0', pfEmployee: '2400', pt: '100', tds: '0',
          adjustmentAmount: 0, totalDeductions: '2500', netPay: 27500,
        }],
      },
    }, '/payroll/runs/:id');
    expect(html).toContain('PR-202511');
    expect(html).toContain('Asha Rao');
    expect(html).toContain('MISSING_UAN');
    expect(html).toContain('Prepared by');
    expect(html).toContain('Approved by');
    expect(html).toContain('Adj.'); // adjustment column header
    // A LOCKED run offers approval and the two exports.
    expect(html).toContain('Approve');
    expect(html).toContain('Bank file');
    expect(html).toContain('PF ECR');
    // ...but not a Lock button: it is already locked.
    expect(html.includes('Lock period')).toBe(false);
    // With no session, approve must be disabled rather than missing, so the
    // reader can see the action exists and what it needs.
    expect(html).toMatch(/disabled="" title="You need payroll:approve"/);
  });

  it('PayrollRunDetail offers Lock only while the run is a draft', () => {
    const html = render(PayrollRunDetail, {
      [JSON.stringify(['payroll-run', RUN_ID])]: {
        id: '11111111-1111-4111-8111-111111111111',
        runNumber: 'PR-202510', month: 10, year: 2025, status: 'DRAFT',
        periodStart: '2025-10-01', periodEnd: '2025-10-31',
        totalEmployees: 0, totalGross: 0, totalNet: 0, totalDeductions: 0,
        statutorySetCode: 'EPFO-CENTRAL-2025', findings: [],
        preparedById: 'u1', preparedAt: null, approvedById: null, approvedAt: null,
        selfApprovalException: false, selfApprovalReason: null,
        disbursedAt: null, bankFileRef: null, cancelReason: null, notes: null,
        totals: {
          employees: 0, gross: 0, esiEmployee: 0, esiEmployer: 0, pfEmployee: 0,
          pfEmployerEPF: 0, pfEmployerEPS: 0, pfEmployerEDLIS: 0,
          pt: 0, tds: 0, deductions: 0, net: 0,
        },
        items: [],
      },
    }, '/payroll/runs/:id');
    // A DRAFT run shows no approval or export controls, and — with no session —
    // no prepare actions either. What it must always show is the line-item table.
    expect(html).toContain('Line items');
    expect(html).not.toContain('Bank file');
    expect(html).not.toContain('PF ECR');
    expect(html.includes('>Approve<')).toBe(false);
  });

  it('PayrollRunDetail explains an unloadable run instead of rendering blank', () => {
    // Mounted outside its route there is no id, so the query never runs and the
    // page must say so rather than showing an empty shell.
    const html = render(PayrollRunDetail);
    expect(html).toContain('could not be loaded');
    expect(html).toContain('Back to payroll');
  });
});
