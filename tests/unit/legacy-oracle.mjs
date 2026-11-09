/**
 * Legacy wage-engine ORACLE
 * =========================
 * Extracts the *actual* calculation functions from the v5.6.61 Apps Script
 * source and evaluates them in Node. Used as a differential-testing oracle:
 * for any input, the new TypeScript engine must produce the same numbers as
 * the code that has been invoicing customers.
 *
 * This is deliberately not a re-implementation. It is the legacy code itself,
 * lifted out of the .gs file by brace matching so that the comparison cannot
 * be biased by a mistaken reading of the algorithm.
 *
 * Only pure helpers are pulled in; anything touching SpreadsheetApp, Drive or
 * mail is absent from these functions by design.
 */

import fs from 'node:fs';
import path from 'node:path';

const SOURCE_DIR = process.env.LEGACY_SOURCE
  || path.resolve(process.cwd(), '../_incoming/source-v5.6.61');

/** Blank out comments and string/template literals so braces can be matched. */
function blankNonCode(src) {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  const blank = (from, to) => { for (let k = from; k < to && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '/') { let j = src.indexOf('\n', i); if (j === -1) j = n; blank(i, j); i = j; continue; }
    if (c === '/' && c2 === '*') { let j = src.indexOf('*/', i + 2); j = j === -1 ? n : j + 2; blank(i, j); i = j; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        if (q !== '`' && src[j] === '\n') break;
        j++;
      }
      blank(i, j); i = j; continue;
    }
    i++;
  }
  return out.join('');
}

function matchBrace(b, open) {
  let d = 0;
  for (let i = open; i < b.length; i++) {
    if (b[i] === '{') d++;
    else if (b[i] === '}') { d--; if (d === 0) return i; }
  }
  return b.length - 1;
}

/** Pull `function name(...) { ... }` out of a file's source. */
function extractFunction(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const blanked = blankNonCode(src);
  const re = new RegExp(`^function\\s+${name}\\s*\\(`, 'm');
  const m = re.exec(blanked);
  if (!m) return null;
  const open = blanked.indexOf('{', m.index);
  const close = matchBrace(blanked, open);
  return src.slice(m.index, close + 1);
}

const FILES = {
  Quotations: path.join(SOURCE_DIR, 'Quotations.gs'),
  Database: path.join(SOURCE_DIR, 'Database.gs'),
};

const NEEDED = [
  ['Quotations', 'salaryBreakupCalc_'],
  ['Quotations', 'salaryBreakupOpts561_'],
  ['Quotations', 'salaryBreakupXa561_'],
  ['Quotations', 'salaryBreakupField_'],
  ['Quotations', 'salaryBreakupUp561_'],
  ['Quotations', 'breakupFeePerHead559_'],
  ['Database', 'number_'],
  ['Database', 'clean_'],
];

/**
 * Build the oracle. Returns a function with the same signature as the legacy
 * `salaryBreakupCalc_(breakup, mgmtPercent, fee)`.
 */
export function buildOracle() {
  const chunks = [];
  const missing = [];
  for (const [fileKey, fn] of NEEDED) {
    const file = FILES[fileKey];
    if (!fs.existsSync(file)) {
      throw new Error(`Legacy source not found at ${file}. Set LEGACY_SOURCE.`);
    }
    const code = extractFunction(file, fn);
    if (!code) { missing.push(`${fileKey}:${fn}`); continue; }
    chunks.push(code);
  }
  if (missing.length) throw new Error(`Could not extract legacy functions: ${missing.join(', ')}`);

  // eslint-disable-next-line no-new-func
  const factory = new Function(`${chunks.join('\n')}\nreturn { calc: salaryBreakupCalc_, opts: salaryBreakupOpts561_ };`);
  return factory();
}

/** True when the legacy source is available in this environment. */
export function oracleAvailable() {
  try {
    buildOracle();
    return true;
  } catch {
    return false;
  }
}

/* ================================================================== *
 * TENDER ORACLE
 * ================================================================== *
 * Extracts the legacy tender algorithms so the new TypeScript rules can be
 * diffed against them. The sheet-access dependencies are stubbed: we are
 * testing the ALGORITHM (numbering, ordering, metrics), not SpreadsheetApp.
 */

/**
 * `nextCode_` needs withLock_, getRecords_, CODE_PREFIXES_ and number_.
 * We lift the function body verbatim and supply those four as stubs, so the
 * numbering logic under test is genuinely the legacy code.
 */
export function buildTenderOracle() {
  const dbFile = FILES.Database;
  const tFile = path.join(SOURCE_DIR, 'Tenders.gs');
  if (!fs.existsSync(dbFile) || !fs.existsSync(tFile)) {
    throw new Error('Legacy tender source not found. Set LEGACY_SOURCE.');
  }

  const nextCode = extractFunction(dbFile, 'nextCode_');
  const sorter = extractFunction(tFile, 'tenderSubmissionSort_');
  const metrics = extractFunction(tFile, 'tenderDashboardMetricsServer_');
  if (!nextCode || !sorter || !metrics) {
    throw new Error('Could not extract legacy tender functions.');
  }

  const preamble = `
    const CODE_PREFIXES_ = { TND: { sheet: 'Tenders', column: 'TenderNo' } };
    const APP = { TZ: 'Asia/Kolkata', SHEETS: { TENDERS: 'Tenders' } };
    function number_(v, f) { const x = Number(v); return isFinite(x) ? x : (f || 0); }
    function withLock_(fn) { return fn(); }
    // Stubbed so the metrics function is pure. The real one reads the sheet clock.
    let __today = '1970-01-01';
    function today_() { return __today; }
    const Utilities = {
      formatDate: function(d, tz, fmt) { return new Date(d).toISOString().slice(0, 10); }
    };
    /** Legacy rows are PascalCase sheet records; callers pass camelCase. */
    function toLegacyTender(t) {
      return {
        id: t.id,
        Status: t.status !== undefined ? t.status : t.Status,
        SubmissionDate: t.submissionDate !== undefined ? t.submissionDate : t.SubmissionDate,
        UpdatedAt: t.updatedAt !== undefined ? t.updatedAt : t.UpdatedAt,
        CreatedAt: t.createdAt !== undefined ? t.createdAt : t.CreatedAt,
        TenderValue: t.tenderValue !== undefined ? t.tenderValue : t.TenderValue,
        DocumentsPending: t.documentsPending !== undefined ? t.documentsPending : t.DocumentsPending,
      };
    }
  `;

  // nextCode_ reads rows via getRecords_(sheet); we inject a closure variable.
  const factory = new Function(
    'ROWS',
    `
    ${preamble}
    let __rows = ROWS;
    function getRecords_(sheet) { return __rows; }
    ${nextCode}
    ${sorter}
    ${metrics}
    return {
      nextCode: function(existingNumbers, prefix, year) {
        __rows = existingNumbers.map(function(v) {
          return { TenderNo: v, Status: 'NEW' };
        });
        return nextCode_(prefix || 'TND', 'Tenders', 'TenderNo', { year: String(year) });
      },
      /** Accepts camelCase; maps to the PascalCase sheet shape the legacy code reads. */
      sortTenders: function(list) {
        return tenderSubmissionSort_(list.map(toLegacyTender));
      },
      /** Accepts camelCase and an explicit "today" so the result is deterministic. */
      metrics: function(tenders, today) {
        __today = today;
        return tenderDashboardMetricsServer_(tenders.map(toLegacyTender));
      },
      TENDER_STATUSES: ${JSON.stringify(['NEW','DOCUMENTS_PENDING','READY_TO_SUBMIT','SUBMITTED','TECHNICALLY_QUALIFIED','FINANCIALLY_WON','LOST','CANCELLED'])},
    };
    `,
  );
  return factory([]);
}

/**
 * HR oracle — lifts the payroll and HR-summary functions straight out of HR.gs.
 *
 * The statutory constants (HR_PF_BASIC_CAP_, HR_PT_KARNATAKA_SLABS_, …) are
 * declared at module scope in the source, so they are re-declared here with
 * their exact source values. If the source changes, the parity test fails —
 * which is the point.
 */
export function buildHrOracle() {
  const hrFile = path.join(SOURCE_DIR, 'HR.gs');
  const dbFile = FILES.Database;
  if (!fs.existsSync(hrFile) || !fs.existsSync(dbFile)) {
    throw new Error('Legacy HR source not found. Set LEGACY_SOURCE.');
  }

  const calcSlip = extractFunction(hrFile, 'calculateSalarySlip_');
  const ptFor = extractFunction(hrFile, 'hrPtFor_');
  const pfWages = extractFunction(hrFile, 'hrPfWages_');
  const summary = extractFunction(hrFile, 'getHRSummary_');
  const monthLabel = extractFunction(hrFile, 'monthLabel_');
  const nextCodeFor = extractFunction(dbFile, 'nextCodeFor_');
  const nextCode = extractFunction(dbFile, 'nextCode_');
  if (!calcSlip || !ptFor || !pfWages || !summary) {
    throw new Error('Could not extract legacy HR functions.');
  }

  const preamble = `
    // --- verbatim source constants (HR.gs:10-52) ---
    const HR_EMPLOYEE_STATUSES_ = ['ACTIVE','NOTICE_PERIOD','ON_HOLD','LEFT'];
    const HR_EMPLOYEE_DOC_CATEGORIES_ = ['AADHAAR','PAN','UAN','ESI','PF','BANK','EDUCATION','EXPERIENCE','MEDICAL','PHOTO','OTHER'];
    const HR_PT_KARNATAKA_SLABS_ = [
      [0, 24999.99, 0],
      [25000, 999999999, 200]
    ];
    const HR_PF_BASIC_CAP_ = 25000;
    const HR_PF_EMPLOYEE_PCT_ = 12;
    const HR_ESI_THRESHOLD_ = 21000;
    const HR_ESI_EMPLOYEE_PCT_ = 0.75;
    const HR_ESI_EMPLOYER_PCT_ = 3.25;

    const APP = { TZ: 'Asia/Kolkata', SHEETS: { EMPLOYEES: 'Employees' } };
    const CODE_PREFIXES_ = { EMP: { sheet: 'Employees', column: 'EmployeeCode' } };
    function number_(v, f) { const x = Number(v); return isFinite(x) ? x : (f || 0); }
    function bool_(v) { return String(v).toUpperCase() === 'TRUE' || v === true; }
    function now_() { return '2026-01-01 00:00:00'; }
    function clean_(v, n) { return String(v === null || v === undefined ? '' : v).trim().slice(0, n || 5000); }
    function Utilities() {}
    function withLock_(fn) { return fn(); }
    let __employees = [];
    function getRecords_(sheet) { return __employees; }
    function ensureHREmployeeSheets_() {}
  `;

  const factory = new Function(
    'EMPLOYEES',
    `
    ${preamble}
    __employees = EMPLOYEES;
    ${pfWages}
    ${ptFor}
    ${monthLabel || 'function monthLabel_(m, y) { return m + "/" + y; }'}
    ${calcSlip}
    ${summary}
    ${nextCode}
    ${nextCodeFor}
    function mockUser() { return { UserID: 'U1', Role: 'ADMIN' }; }
    function assertHREmployeeRead_() {}
    return {
      /**
       * Calculate a slip exactly as the legacy app does.
       * The source reads employee fields as stored in the sheet, i.e. strings.
       */
      calculateSalarySlip: function(employee, month, year, adjustments) {
        const row = {
          Basic: employee.basic, HRA: employee.hra, DA: employee.da,
          OtherAllowances: employee.otherAllowances,
          ESIApplicable: employee.esiApplicable === false ? 'FALSE' : 'TRUE',
          PFApplicable: employee.pfApplicable === false ? 'FALSE' : 'TRUE',
          PTState: employee.ptState || '',
        };
        return calculateSalarySlip_(row, month, year, adjustments);
      },
      ptFor: function(gross, month) { return hrPtFor_(gross, month); },
      pfWages: function(basic, da) { return hrPfWages_(basic, da); },
      /** getHRSummary_ over rows shaped like the Employee sheet. */
      summary: function(employees) {
        __employees = employees.map(function(e) {
          return {
            Status: e.status,
            Basic: String(e.basic), HRA: String(e.hra), DA: String(e.da),
            OtherAllowances: String(e.otherAllowances),
            Department: e.department === undefined ? null : e.department,
            Active: 'TRUE',
          };
        });
        return getHRSummary_(mockUser(), {});
      },
      nextEmployeeCode: function(existingCodes, year) {
        __employees = existingCodes.map(function(c) {
          return { EmployeeCode: c, Active: 'TRUE' };
        });
        return nextCodeFor_('EMP', { year: String(year) });
      },
      HR_EMPLOYEE_STATUSES_: HR_EMPLOYEE_STATUSES_,
    };
    `,
  );
  return factory([]);
}

/**
 * PAYROLL RUN ORACLE
 * ==================
 * Lifts `summarizePayrollRun_`, `buildPfEcrText_`, `buildBankTransferCsv_` and
 * `escCsv_` out of HR.gs verbatim so the new run engine and its exports can be
 * differentially tested against the code that has actually been used to pay
 * people.
 *
 * The legacy functions read employee rows from the Employees sheet via
 * `getRecords_`, so a tiny in-memory sheet is supplied here.
 */
export function buildPayrollOracle() {
  const hrFile = path.join(SOURCE_DIR, 'HR.gs');
  if (!fs.existsSync(hrFile)) throw new Error('Legacy HR source not found. Set LEGACY_SOURCE.');

  const summarize = extractFunction(hrFile, 'summarizePayrollRun_');
  const ecr = extractFunction(hrFile, 'buildPfEcrText_');
  const bank = extractFunction(hrFile, 'buildBankTransferCsv_');
  const esc = extractFunction(hrFile, 'escCsv_');
  const pfWages = extractFunction(hrFile, 'hrPfWages_');
  const label = extractFunction(hrFile, 'monthLabel_');
  if (!summarize || !ecr || !bank || !esc || !pfWages) {
    throw new Error('Could not extract legacy payroll functions.');
  }

  const preamble = `
    const ESI_EMPLOYER_RATE_ = 3.25;
    const PF_EMPLOYER_EPF_RATE_ = 12;
    const PF_EMPLOYER_EPS_RATE_ = 8.33;
    const PF_EMPLOYER_EDLIS_RATE_ = 0.5;
    const HR_PF_BASIC_CAP_ = 25000;
    const APP = { SHEETS: { EMPLOYEES: 'Employees' } };
    const MONTHS_ = ['January','February','March','April','May','June','July',
                     'August','September','October','November','December'];
    function number_(v, f) { const x = Number(v); return isFinite(x) ? x : (f || 0); }
    let __employees = [];
    function getRecords_(sheet) { return __employees; }
  `;

  const factory = new Function(
    'EMPLOYEES',
    `
    ${preamble}
    __employees = EMPLOYEES;
    ${pfWages}
    ${label || 'function monthLabel_(m, y) { return m + " " + y; }'}
    ${esc}
    ${summarize}
    ${ecr}
    ${bank}
    return {
      summarize: function(items, employees) {
        __employees = employees || [];
        return summarizePayrollRun_(items.map(function(it) {
          return {
            EmployeeID: it.employeeId, EmployeeName: it.employeeName,
            Basic: String(it.basic), DA: String(it.da), HRA: String(it.hra || 0),
            OtherAllowances: '0',
            GrossEarnings: String(it.grossEarnings),
            ESIEmployee: String(it.esiEmployee || 0),
            PFEmployee: String(it.pfEmployee || 0),
            PT: String(it.pt || 0), TDS: String(it.tds || 0),
            TotalDeductions: String(it.totalDeductions || 0),
            NetPay: String(it.netPay),
          };
        }));
      },
      ecrText: function(run, items, employees) {
        __employees = employees || [];
        return buildPfEcrText_(run, items.map(function(it) {
          return {
            EmployeeID: it.employeeId, EmployeeName: it.employeeName,
            Basic: String(it.basic), DA: String(it.da || 0),
            GrossEarnings: String(it.grossEarnings),
            PFEmployee: String(it.pfEmployee || 0),
          };
        }));
      },
      bankCsv: function(run, items, employees) {
        __employees = employees || [];
        return buildBankTransferCsv_(run, items.map(function(it) {
          return { EmployeeID: it.employeeId, EmployeeName: it.employeeName, NetPay: String(it.netPay) };
        }));
      },
      escCsv: function(s) { return escCsv_(s); },
    };
    `,
  );
  return factory([]);
}
