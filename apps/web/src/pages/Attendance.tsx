import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  Lock, Save, Users2, XCircle,
} from 'lucide-react';
import {
  api, ApiFailure, ATTENDANCE_SHORT, ATTENDANCE_STATUSES, ATTENDANCE_TONE,
  AttendanceLockStatus, AttendanceStatus, AttendanceSummary, CalendarResponse,
  MONTH_OPTIONS, monthName,
} from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * Attendance — the input payroll was previously missing.
 *
 * The legacy suite had no attendance at all (Phase 4 gap analysis, P4-1):
 * whoever ran payroll typed a number of days worked into the salary form and
 * that number became the pay. This screen records the actual days, then derives
 * the payable days that the salary engine consumes.
 *
 * Two rules are visible in the UI:
 *   - a period frozen by a payroll run is read-only, with the run named;
 *   - a correction always asks why, and the original value stays in history.
 */
export default function Attendance() {
  const { can } = useAuth();
  const qc = useQueryClient();

  const now = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [contractId, setContractId] = useState('');
  const [tab, setTab] = useState<'grid' | 'summary'>('grid');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [bulk, setBulk] = useState({ fromDate: '', toDate: '', status: 'PRESENT' as AttendanceStatus, skipWeekends: true });
  const [correctFor, setCorrectFor] = useState<{ id: string; label: string; status: AttendanceStatus; otHours: number } | null>(null);
  const [correctForm, setCorrectForm] = useState({ status: 'PRESENT' as AttendanceStatus, otHours: '0', note: '' });

  const canWrite = can('attendance:write');

  const lock = useQuery({
    queryKey: ['attendance-lock', month, year],
    queryFn: () => api.get<AttendanceLockStatus>(`/attendance/lock-status?month=${month}&year=${year}`),
  });

  const contracts = useQuery({
    queryKey: ['contracts-lite'],
    queryFn: () => api.get<{ items: Array<{ id: string; contractNumber: string; title: string }> }>('/contracts?take=100'),
  });

  const calendar = useQuery({
    queryKey: ['attendance-calendar', month, year, contractId],
    queryFn: () => api.get<CalendarResponse>(
      `/attendance/calendar?month=${month}&year=${year}${contractId ? `&contractId=${contractId}` : ''}`,
    ),
  });

  const summary = useQuery({
    queryKey: ['attendance-summary', month, year, contractId],
    queryFn: () => api.get<AttendanceSummary>(
      `/attendance/summary?month=${month}&year=${year}${contractId ? `&contractId=${contractId}` : ''}`,
    ),
    enabled: tab === 'summary',
  });

  const locked = lock.data?.locked === true;
  const readOnly = locked || !canWrite;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['attendance-calendar'] });
    qc.invalidateQueries({ queryKey: ['attendance-summary'] });
    qc.invalidateQueries({ queryKey: ['attendance-lock'] });
  };

  const markDay = useMutation({
    mutationFn: (v: { employeeId: string; date: string; status: AttendanceStatus }) =>
      api.post('/attendance', v),
    onSuccess: () => { setError(''); refresh(); },
    onError: (e) => setError(e instanceof ApiFailure ? e.error.message : 'Could not mark that day.'),
  });

  const bulkMark = useMutation({
    mutationFn: () => {
      const data = calendar.data;
      if (!data) throw new Error('no calendar');
      return api.post<{ written: number }>('/attendance/bulk', {
        employeeIds: data.employees.map((e) => e.id),
        fromDate: bulk.fromDate || `${year}-${String(month).padStart(2, '0')}-01`,
        toDate: bulk.toDate || `${year}-${String(month).padStart(2, '0')}-${data.daysInMonth}`,
        status: bulk.status,
        skipWeekends: bulk.skipWeekends,
      });
    },
    onSuccess: (r: any) => {
      setError('');
      setNotice(`${r.written} day(s) marked.`);
      refresh();
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.error.message : 'Bulk mark failed.'),
  });

  const correct = useMutation({
    mutationFn: () => api.patch(`/attendance/${correctFor?.id}/correct`, {
      status: correctForm.status,
      otHours: Number(correctForm.otHours) || 0,
      note: correctForm.note,
    }),
    onSuccess: () => {
      setError('');
      setCorrectFor(null);
      setCorrectForm({ status: 'PRESENT', otHours: '0', note: '' });
      setNotice('Correction recorded.');
      refresh();
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.error.message : 'Correction failed.'),
  });

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setMonth(d.getUTCMonth() + 1);
    setYear(d.getUTCFullYear());
  };

  const dayDate = (d: number) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-900 flex items-center gap-2">
            <CalendarDays className="w-5 h-5" /> Attendance
          </h1>
          <p className="text-sm text-navy-500 mt-1">
            The days actually worked. Payroll prorates from these numbers, so a month with no
            attendance cannot be paid.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost p-2" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_OPTIONS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input className="input w-24" type="number" value={year}
            onChange={(e) => setYear(Number(e.target.value))} />
          <button className="btn-ghost p-2" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {locked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>{monthName(month)} {year} is frozen.</strong>{' '}
            Payroll run <span className="font-mono">{lock.data?.payrollRun?.runNumber}</span> is{' '}
            {lock.data?.payrollRun?.status}. Attendance cannot be changed because the period has
            already been prepared for payment. Correct the payroll with an adjustment instead.
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> <span>{notice}</span>
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <select className="input" value={contractId} onChange={(e) => setContractId(e.target.value)}>
            <option value="">All contracts</option>
            {(contracts.data?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.contractNumber} — {c.title}</option>
            ))}
          </select>
          <div className="flex rounded-lg border border-navy-200 overflow-hidden">
            <button
              className={`px-3 py-1.5 text-sm ${tab === 'grid' ? 'bg-navy-900 text-white' : 'bg-white text-navy-600'}`}
              onClick={() => setTab('grid')}
            >Month grid</button>
            <button
              className={`px-3 py-1.5 text-sm ${tab === 'summary' ? 'bg-navy-900 text-white' : 'bg-white text-navy-600'}`}
              onClick={() => setTab('summary')}
            >Payroll summary</button>
          </div>
          <div className="ml-auto text-xs text-navy-500">
            {calendar.data ? `${calendar.data.employees.length} employee(s) · ${calendar.data.daysInMonth} days` : ' '}
          </div>
        </div>

        {canWrite && !locked && (
          <div className="rounded-lg border border-navy-100 bg-navy-50/50 p-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-navy-500 block mb-1">From</label>
              <input className="input" type="date" value={bulk.fromDate || dayDate(1)}
                onChange={(e) => setBulk({ ...bulk, fromDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-navy-500 block mb-1">To</label>
              <input className="input" type="date" value={bulk.toDate || dayDate(calendar.data?.daysInMonth ?? 28)}
                onChange={(e) => setBulk({ ...bulk, toDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-navy-500 block mb-1">Mark everyone as</label>
              <select className="input" value={bulk.status}
                onChange={(e) => setBulk({ ...bulk, status: e.target.value as AttendanceStatus })}>
                {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-navy-600 pb-2">
              <input type="checkbox" checked={bulk.skipWeekends}
                onChange={(e) => setBulk({ ...bulk, skipWeekends: e.target.checked })} />
              Skip Sundays
            </label>
            <button className="btn-primary ml-auto" disabled={bulkMark.isPending}
              onClick={() => { setNotice(''); bulkMark.mutate(); }}>
              <Save className="w-4 h-4" /> {bulkMark.isPending ? 'Marking…' : 'Bulk mark'}
            </button>
          </div>
        )}
      </div>

      {tab === 'grid' && (
        <div className="card overflow-x-auto">
          {calendar.isLoading ? (
            <div className="p-6 text-sm text-navy-500">Loading attendance…</div>
          ) : calendar.data && calendar.data.employees.length === 0 ? (
            <div className="p-6 text-sm text-navy-500">
              No active employees found. Add employees under HR before marking attendance.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-navy-50 text-navy-600">
                  <th className="text-left px-3 py-2 sticky left-0 bg-navy-50 min-w-[200px]">Employee</th>
                  {calendar.data?.days.map((d) => (
                    <th key={d} className="px-0.5 py-2 font-medium w-7 text-center">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendar.data?.employees.map((emp) => (
                  <tr key={emp.id} className="border-t border-navy-100">
                    <td className="px-3 py-1.5 sticky left-0 bg-white">
                      <div className="font-medium text-navy-800 truncate max-w-[190px]">{emp.name}</div>
                      <div className="text-[10px] text-navy-400 font-mono">{emp.employeeCode}</div>
                    </td>
                    {emp.cells.map((cell, i) => {
                      const d = i + 1;
                      const status = cell?.status;
                      return (
                        <td key={d} className="p-0.5 text-center">
                          <button
                            title={
                              cell
                                ? `${dayDate(d)} · ${status}${cell.otHours ? ` · OT ${cell.otHours}h` : ''}`
                                : `${dayDate(d)} · not marked`
                            }
                            disabled={readOnly}
                            onClick={() => {
                              if (!canWrite || locked) return;
                              if (cell) {
                                setCorrectFor({
                                  id: cell.id,
                                  label: `${emp.name} · ${dayDate(d)}`,
                                  status: cell.status,
                                  otHours: cell.otHours,
                                });
                                setCorrectForm({
                                  status: cell.status, otHours: String(cell.otHours), note: '',
                                });
                              } else {
                                markDay.mutate({ employeeId: emp.id, date: dayDate(d), status: 'PRESENT' });
                              }
                            }}
                            className={[
                              'w-6 h-6 rounded text-[10px] font-semibold transition',
                              status ? ATTENDANCE_TONE[status] : 'bg-navy-50 text-navy-300',
                              readOnly ? 'cursor-default opacity-80' : 'hover:ring-2 hover:ring-navy-300',
                              cell && cell.correctionCount > 0 ? 'ring-1 ring-amber-400' : '',
                            ].join(' ')}
                          >
                            {status ? ATTENDANCE_SHORT[status] : '·'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-3 py-2 border-t border-navy-100 text-[11px] text-navy-500 flex flex-wrap gap-3">
            {ATTENDANCE_STATUSES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className={`inline-block w-4 h-4 rounded text-[9px] text-center leading-4 ${ATTENDANCE_TONE[s]}`}>
                  {ATTENDANCE_SHORT[s]}
                </span>
                {s.replace(/_/g, ' ')}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-4 h-4 rounded ring-1 ring-amber-400" /> corrected
            </span>
          </div>
        </div>
      )}

      {tab === 'summary' && (
        <div className="card overflow-x-auto">
          {summary.isLoading ? (
            <div className="p-6 text-sm text-navy-500">Loading summary…</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-navy-100 flex items-center gap-4 text-sm">
                <span className="font-medium text-navy-800">{summary.data?.label}</span>
                <span className="text-navy-500">{summary.data?.employees} employees</span>
                {!!summary.data?.employeesWithNoAttendance && (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {summary.data.employeesWithNoAttendance} with no attendance at all
                  </span>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-navy-50 text-navy-600 text-xs">
                    <th className="text-left px-4 py-2">Employee</th>
                    <th className="text-right px-2 py-2">Payable</th>
                    <th className="text-right px-2 py-2">Present</th>
                    <th className="text-right px-2 py-2">Absent</th>
                    <th className="text-right px-2 py-2">Paid leave</th>
                    <th className="text-right px-2 py-2">Unpaid</th>
                    <th className="text-right px-2 py-2">Half</th>
                    <th className="text-right px-2 py-2">OT hrs</th>
                    <th className="text-right px-4 py-2">Unmarked</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.data?.rows.map((r) => (
                    <tr key={r.employee.id} className="border-t border-navy-100">
                      <td className="px-4 py-2">
                        <div className="font-medium text-navy-800">{r.employee.name}</div>
                        <div className="text-[11px] text-navy-400 font-mono">{r.employee.employeeCode}</div>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">{r.daysWorked}</td>
                      <td className="px-2 py-2 text-right">{r.daysPresent}</td>
                      <td className="px-2 py-2 text-right">{r.absentDays}</td>
                      <td className="px-2 py-2 text-right">{r.paidLeaveDays}</td>
                      <td className="px-2 py-2 text-right">{r.unpaidLeaveDays}</td>
                      <td className="px-2 py-2 text-right">{r.halfDays}</td>
                      <td className="px-2 py-2 text-right">{r.otHours}</td>
                      <td className={`px-4 py-2 text-right ${r.unmarkedDays > 0 ? 'text-amber-700 font-medium' : 'text-navy-400'}`}>
                        {r.unmarkedDays || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {correctFor && (
        <div className="fixed inset-0 bg-navy-950/40 grid place-items-center p-4 z-30">
          <div className="card w-full max-w-md p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-navy-900">Correct attendance</h3>
              <p className="text-xs text-navy-500 mt-1">{correctFor.label}</p>
              <p className="text-xs text-navy-500 mt-1">
                Currently <strong>{correctFor.status}</strong>
                {correctFor.otHours ? ` with ${correctFor.otHours}h OT` : ''}. The original values
                are kept in the correction history.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-navy-500 block mb-1">New status</label>
                <select className="input" value={correctForm.status}
                  onChange={(e) => setCorrectForm({ ...correctForm, status: e.target.value as AttendanceStatus })}>
                  {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-navy-500 block mb-1">OT hours</label>
                <input className="input" type="number" min={0} max={16} value={correctForm.otHours}
                  onChange={(e) => setCorrectForm({ ...correctForm, otHours: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs text-navy-500 block mb-1">Why is this being corrected? *</label>
              <textarea className="input h-20" value={correctForm.note}
                placeholder="e.g. Biometric device was down; gate register confirms the employee was on site."
                onChange={(e) => setCorrectForm({ ...correctForm, note: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setCorrectFor(null)}>Cancel</button>
              <button className="btn-primary" disabled={correct.isPending || correctForm.note.trim().length < 5}
                onClick={() => correct.mutate()}>
                {correct.isPending ? 'Saving…' : 'Record correction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!canWrite && (
        <div className="text-xs text-navy-500 flex items-center gap-1">
          <Users2 className="w-3.5 h-3.5" /> Read-only: you do not have attendance:write.
        </div>
      )}
    </div>
  );
}
