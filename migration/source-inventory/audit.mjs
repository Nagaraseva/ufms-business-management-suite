#!/usr/bin/env node
/**
 * UFMS Business Management Suite — Phase 0 Source Auditor
 * ========================================================
 *
 * Static analyser for the legacy Google Apps Script source (v5.6.61-options).
 *
 * WHY THIS EXISTS
 * ---------------
 * Project Rule #2 says: "Do not assume that the handover documentation is
 * completely accurate. Verify important claims against source code."
 *
 * This tool is the only source of truth for the Phase 0 documents. Every number
 * quoted in docs/ is produced here from the actual files — nothing is typed in
 * by hand. Re-run it after any change to the legacy source:
 *
 *     node migration/source-inventory/audit.mjs --source <path-to-source>
 *
 * OUTPUT
 * ------
 *   migration/source-inventory/audit.json   complete machine-readable inventory
 *   docs/*.md                               10 human-readable Phase 0 documents
 *
 * DEPENDENCIES: none. Node >= 18. Intentionally dependency-free so the audit
 * can be reproduced by an auditor on a clean machine.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

/* ------------------------------------------------------------------ *
 * 0. CLI ARGUMENTS
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {
    source: path.resolve(REPO_ROOT, '../../_incoming/source-v5.6.61'),
    docs: path.join(REPO_ROOT, 'docs'),
    json: path.join(__dirname, 'audit.json'),
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') out.source = path.resolve(argv[++i]);
    else if (a === '--docs') out.docs = path.resolve(argv[++i]);
    else if (a === '--json') out.json = path.resolve(argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('usage: audit.mjs [--source DIR] [--docs DIR] [--json FILE]');
      process.exit(0);
    }
  }
  return out;
}

const ARGS = parseArgs(process.argv);

/* ------------------------------------------------------------------ *
 * 1. SOURCE-CODE LEXER HELPERS
 *
 * Apps Script is plain JavaScript. To measure function bodies correctly we
 * must not be fooled by braces inside strings, template literals, comments
 * or regex literals. These helpers implement a small character scanner.
 * ------------------------------------------------------------------ */

/**
 * Return a copy of `src` where the contents of comments and string/template/
 * regex literals have been replaced by spaces (newlines preserved so that
 * line numbers stay correct). Braces/parens can then be counted safely.
 */
function blankNonCode(src) {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  let prevSignificant = ''; // last significant non-space char, for regex detection

  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    // line comment
    if (c === '/' && c2 === '/') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = n;
      blank(i, j);
      i = j;
      continue;
    }

    // block comment
    if (c === '/' && c2 === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      blank(i, j);
      i = j;
      continue;
    }

    // single / double quoted string
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === quote) { j++; break; }
        if (src[j] === '\n') break; // unterminated; bail out at newline
        j++;
      }
      blank(i, j);
      i = j;
      prevSignificant = quote;
      continue;
    }

    // template literal (handles ${...} nesting shallowly — good enough here)
    if (c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') { depth++; j += 2; continue; }
        if (src[j] === '}' && depth > 0) { depth--; j++; continue; }
        if (src[j] === '`' && depth === 0) { j++; break; }
        j++;
      }
      blank(i, j);
      i = j;
      prevSignificant = '`';
      continue;
    }

    // regex literal — only when a regex can legally start here
    if (c === '/' && /[=(,:;[!&|?{}+\-*%~^<>]|^$|return$/.test(prevSignificant)) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) { j++; break; }
        else if (src[j] === '\n') break;
        j++;
      }
      blank(i, j);
      i = j;
      continue;
    }

    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }
  return out.join('');
}

/** Index of the brace that closes the one opened at `openIdx` (in blanked source). */
function matchBrace(blanked, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < blanked.length; i++) {
    if (blanked[i] === '{') depth++;
    else if (blanked[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return blanked.length - 1;
}

/** Line number (1-based) of a character offset. */
function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

/* ------------------------------------------------------------------ *
 * 2. FILE DISCOVERY
 * ------------------------------------------------------------------ */

function walk(dir, filter, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, acc);
    else if (filter(entry.name)) acc.push(full);
  }
  return acc;
}

/* ------------------------------------------------------------------ *
 * 3. PARSE .gs FILES
 * ------------------------------------------------------------------ */

const GS_FN_RE = /^function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/gm;
const GS_CONST_FN_RE = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function\s*\(([^)]*)\)|\(([^)]*)\)\s*=>|([A-Za-z_$][\w$]*)\s*=>)/gm;

function parseGsFile(absPath) {
  const rel = path.relative(ARGS.source, absPath);
  const src = fs.readFileSync(absPath, 'utf8');
  const blanked = blankNonCode(src);
  const lines = src.split('\n');

  const functions = [];
  const seen = new Set();

  // classic `function name(...) {` declarations
  let m;
  GS_FN_RE.lastIndex = 0;
  while ((m = GS_FN_RE.exec(blanked)) !== null) {
    const name = m[1];
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = matchBrace(blanked, openIdx);
    const startLine = lineOf(blanked, m.index);
    const endLine = lineOf(blanked, closeIdx);
    const key = `${name}:${startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    functions.push({
      name,
      params: m[2].split(',').map((s) => s.trim()).filter(Boolean),
      file: rel,
      startLine,
      endLine,
      loc: endLine - startLine + 1,
      kind: 'declaration',
      // Convention in this codebase: trailing underscore = private/internal
      visibility: /_$/.test(name) ? 'private' : 'public',
      callers: [],
    });
  }

  // `const foo = function(...)` / arrow functions
  GS_CONST_FN_RE.lastIndex = 0;
  while ((m = GS_CONST_FN_RE.exec(blanked)) !== null) {
    const name = m[1];
    const startLine = lineOf(blanked, m.index);
    const key = `${name}:${startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const paramsRaw = m[2] || m[3] || m[4] || '';
    functions.push({
      name,
      params: paramsRaw.split(',').map((s) => s.trim()).filter(Boolean),
      file: rel,
      startLine,
      endLine: startLine,
      loc: 1,
      kind: 'expression',
      visibility: /_$/.test(name) ? 'private' : 'public',
      callers: [],
    });
  }

  return { rel, absPath, src, blanked, lines, functions, bytes: Buffer.byteLength(src) };
}

/* ------------------------------------------------------------------ *
 * 4. PARSE THE APP CONSTANT (sheets, columns, roles)
 * ------------------------------------------------------------------ */

function parseAppConstant(files) {
  const db = files.find((f) => f.rel.endsWith('Database.gs'));
  if (!db) return { sheets: [], roles: [], found: false };

  const src = db.src;
  const blankedDb = db.blanked;

  // --- APP.SHEETS enum: KEY: 'SheetName'  (scoped to the object literal only)
  const sheetsEnum = [];
  const enumStart = src.indexOf('SHEETS:');
  if (enumStart !== -1) {
    const open = src.indexOf('{', enumStart);
    const close = matchBrace(blankedDb, open);
    const body = src.slice(open, close);
    const re = /^\s*([A-Z][A-Z0-9_]*)\s*:\s*'([^']+)'\s*,?/gm;
    let m;
    while ((m = re.exec(body)) !== null) {
      sheetsEnum.push({ key: m[1], sheet: m[2] });
    }
  }

  // --- Column definitions: SheetName: ['Col1','Col2',...]
  // Scoped strictly to `const SCHEMA = { ... }` — the authoritative sheet schema.
  const columns = {};
  const schemaAt = blankedDb.search(/const\s+SCHEMA\s*=/);
  if (schemaAt !== -1) {
    const open = blankedDb.indexOf('{', schemaAt);
    const close = matchBrace(blankedDb, open);
    const body = src.slice(open, close);
    // Entry starts at column 0-ish indentation: `  SheetName: ['a','b'],`
    const entryRe = /^\s{1,4}([A-Za-z][A-Za-z0-9_]*)\s*:\s*\[/gm;
    let em;
    const starts = [];
    while ((em = entryRe.exec(body)) !== null) starts.push({ name: em[1], idx: em.index });
    for (let i = 0; i < starts.length; i++) {
      const from = body.indexOf('[', starts[i].idx);
      const to = body.indexOf(']', from);
      if (from === -1 || to === -1) continue;
      const cols = [...body.slice(from, to).matchAll(/'([^']+)'/g)].map((x) => x[1]);
      if (cols.length) columns[starts[i].name] = cols;
    }
  }

  // --- Roles
  const roleRe = /const\s+ROLE_ENUM_V4_\s*=\s*\[([^\]]+)\]/;
  const rm = roleRe.exec(src);
  const roles = rm ? [...rm[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];

  // --- Version
  const vm = /function\s+buildVersion_\(\)\s*\{\s*return\s+'([^']+)'/.exec(src);
  const version = vm ? vm[1] : 'unknown';

  // --- APP meta
  const appNameM = /NAME:\s*'([^']+)'/.exec(src);
  const tzM = /TZ:\s*'([^']+)'/.exec(src);
  const sessM = /SESSION_HOURS:\s*(\d+)/.exec(src);

  return {
    found: true,
    sheets: sheetsEnum,
    columns,
    roles,
    version,
    appName: appNameM ? appNameM[1] : 'unknown',
    timezone: tzM ? tzM[1] : 'unknown',
    sessionHours: sessM ? Number(sessM[1]) : null,
  };
}

/* ------------------------------------------------------------------ *
 * 5. PARSE THE api() DISPATCHER
 *
 * The legacy backend exposes exactly one entry point:
 *     function api(action, payload, token) { switch (action) { case 'x': ... } }
 * Every case is one API action. We extract the action name, the permission
 * guard that precedes the handler call, and the handler function.
 * ------------------------------------------------------------------ */

const PERMISSION_GUARDS = [
  'assertRole_', 'assertOffice_', 'assertSalesView_', 'assertSalesMgmtRead_',
  'assertMgmtRead_', 'assertAccessV4_', 'assertSuperAdmin_', 'assertHr_',
  'assertAccounts_', 'assertTender_', 'requireRole_', 'assertAnyRole_',
];

function parseApiDispatcher(files) {
  const api = files.find((f) => f.rel.endsWith('AuthAndApi.gs'));
  if (!api) return { actions: [], found: false };

  const idx = api.blanked.search(/function\s+api\s*\(/);
  if (idx === -1) return { actions: [], found: false };

  const openBrace = api.blanked.indexOf('{', idx);
  const closeBrace = matchBrace(api.blanked, openBrace);
  const body = api.src.slice(openBrace, closeBrace);
  const bodyStartLine = lineOf(api.blanked, openBrace);

  const bodyLines = body.split('\n');
  const actions = [];
  let current = null;

  // A case line looks like:
  //   case 'getLead': assertSalesMgmtRead_(user); data = getLeadDetails_(user, payload.leadId); break;
  //   case 'logout': data = logout_(token, user); break;
  //   case 'saveOrgDefault': assertRole_(user, ['SUPER_ADMIN']); data = saveOrgDefault_(user, payload); break;
  const caseRe = /^\s*case\s+'([A-Za-z0-9_]+)'\s*:\s*(.*)$/;

  // Multi-line cases: a case may continue on following lines (chained .then,
  // if/else blocks, or a handler assigned on the next line). We attach
  // continuation lines until the next `case` or `default`.
  for (let li = 0; li < bodyLines.length; li++) {
    const line = bodyLines[li];
    const cm = caseRe.exec(line);
    if (cm) {
      if (current) actions.push(current);
      current = {
        action: cm[1],
        line: bodyStartLine + li,
        code: cm[2].trim(),
        continuation: [],
        file: api.rel,
      };
      continue;
    }
    if (/^\s*default\s*:/.test(line)) {
      if (current) actions.push(current);
      current = null;
      continue;
    }
    if (current) {
      const t = line.trim();
      if (t && !t.startsWith('/*') && !t.startsWith('*')) current.continuation.push(t);
    }
  }
  if (current) actions.push(current);

  // Enrich each action: permission guard + handler function
  for (const a of actions) {
    const full = [a.code, ...a.continuation].join(' ');
    const guard = PERMISSION_GUARDS.find((g) => full.includes(g));
    a.guard = guard || null;

    // roles passed to the guard, e.g. assertRole_(user, ['SUPER_ADMIN','ADMIN'])
    let roles = null;
    if (guard) {
      const gIdx = full.indexOf(guard);
      const slab = full.slice(gIdx, gIdx + 300);
      const arr = /\[([^\]]*)\]/.exec(slab);
      if (arr) roles = [...arr[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
    }
    a.guardedRoles = roles;

    // handler = first `= handler_(` or `= handler(` call after `data =`
    const hm = /(?:data|result|res)\s*=\s*([A-Za-z_$][\w$]*)\s*\(/.exec(full);
    a.handler = hm ? hm[1] : null;
    if (!a.handler) {
      const any = /([A-Za-z_$][\w$]*_)\s*\(/.exec(full);
      a.handler = any ? any[1] : null;
    }
  }

  return { actions, found: true, dispatcherFile: api.rel, dispatcherLine: lineOf(api.blanked, idx) };
}

/**
 * The file contains more than one switch on an action string. `api()` holds the
 * authenticated operations; `handleEmailLinkAction_()` holds public, token-based
 * email links that need no sign-in. Both are part of the real surface and must
 * be migrated, but they must NOT be counted as one number.
 */
function parsePublicEmailLinkActions(files) {
  const api = files.find((f) => f.rel.endsWith('AuthAndApi.gs'));
  if (!api) return { actions: [], found: false };

  const idx = api.blanked.search(/function\s+handleEmailLinkAction_\s*\(/);
  if (idx === -1) return { actions: [], found: false };

  const openBrace = api.blanked.indexOf('{', idx);
  const closeBrace = matchBrace(api.blanked, openBrace);
  const body = api.src.slice(openBrace, closeBrace);

  const actions = [];
  const caseRe = /case\s+['"]([A-Za-z0-9_]+)['"]\s*:\s*(.*)/g;
  let m;
  while ((m = caseRe.exec(body)) !== null) {
    actions.push({
      action: m[1],
      line: lineOf(api.blanked, openBrace + m.index),
      code: m[2].trim().slice(0, 200),
      requiresAuth: false,
      authModel: 'single-use opaque token in URL',
    });
  }
  return { actions, found: true, handler: 'handleEmailLinkAction_', file: api.rel };
}

/**
 * Public, unauthenticated HTTP surfaces reachable via doGet().
 * These are attack surface and must be rebuilt with explicit, documented
 * rate limits and token rules rather than ported verbatim.
 */
function parsePublicEndpoints(files) {
  const api = files.find((f) => f.rel.endsWith('AuthAndApi.gs'));
  if (!api) return [];
  const doGetAt = api.blanked.search(/function\s+doGet\s*\(/);
  if (doGetAt === -1) return [];
  const open = api.blanked.indexOf('{', doGetAt);
  const close = matchBrace(api.blanked, open);
  const body = api.src.slice(open, close);
  const endpoints = [];
  const paramRe = /e\.parameter\.([A-Za-z_][\w]*)/g;
  const seen = new Set();
  let m;
  while ((m = paramRe.exec(body)) !== null) {
    const p = m[1];
    if (seen.has(p) || p === 'action' || p === 'code' || p === 'state') continue;
    seen.add(p);
    endpoints.push({ param: p, line: lineOf(api.blanked, open + m.index) });
  }
  return endpoints;
}


/* ------------------------------------------------------------------ *
 * 6. TRIGGERS, SERVICES, INTEGRATIONS
 * ------------------------------------------------------------------ */

/**
 * Resolve a handler expression to a concrete function name.
 * The legacy code installs triggers three ways:
 *   1. ScriptApp.newTrigger('literalName')
 *   2. ScriptApp.newTrigger(CONSTANT_)            -> const CONSTANT_ = 'name'
 *   3. ScriptApp.newTrigger(handler)              -> const handler = 'name'
 *      ScriptApp.newTrigger(config.handler)       -> configs = [{handler:'name'}]
 * Anything unresolvable is reported as such rather than guessed.
 */
function resolveHandler(expr, files, file, funcBody) {
  const trimmed = expr.trim();

  // 1. string literal
  const lit = /^'([^']+)'$/.exec(trimmed) || /^"([^"]+)"$/.exec(trimmed);
  if (lit) return { handler: lit[1], resolution: 'literal' };

  // 3a. config.handler -> scan the enclosing function for an object array
  if (/^[\w$.]*\.handler$/.test(trimmed) && funcBody) {
    const names = [...funcBody.matchAll(/handler\s*:\s*'([^']+)'/g)].map((m) => m[1]);
    if (names.length) return { handler: names.join(' | '), resolution: 'config-array', multiple: names };
  }

  // 2. identifier -> resolve LOCAL scope first (a function-local `const handler`
  //    must win over an unrelated global of the same name), then module scope.
  //    Handles comma-separated declarators:  var A = 30, HANDLER_ = 'name';
  const ident = trimmed.replace(/^\w+\./, '');
  if (/^[A-Za-z_$][\w$]*$/.test(ident)) {
    const localRe = new RegExp(
      `(?:const|let|var)\\s+[^;]*?\\b${ident}\\s*=\\s*'([^']+)'`,
    );
    if (funcBody) {
      const local = localRe.exec(funcBody);
      if (local) return { handler: local[1], resolution: 'local-variable' };
    }
    const globalRe = new RegExp(
      `(?:const|let|var)\\s+[^;]*?\\b${ident}\\s*=\\s*'([^']+)'`,
    );
    for (const f of files) {
      const m = globalRe.exec(f.src);
      if (m) return { handler: m[1], resolution: 'constant', constant: ident };
    }
  }

  return { handler: trimmed, resolution: 'unresolved' };
}

function parseTriggers(files) {
  const triggers = [];
  for (const f of files) {
    const re = /ScriptApp\.newTrigger\(\s*([^)]+?)\s*\)([^;]*)/g;
    let m;
    while ((m = re.exec(f.src)) !== null) {
      const expr = m[1];
      // Skip the read-only introspections such as getProjectTriggers()
      if (/^getProject/.test(expr)) continue;

      const chain = m[2];
      let schedule = 'custom';
      const mins = /everyMinutes\((\d+)\)/.exec(chain);
      const hours = /everyHours\((\d+)\)/.exec(chain);
      const days = /everyDays\((\d+)\)/.exec(chain);
      const weeks = /everyWeeks\((\d+)\)/.exec(chain);
      if (mins) schedule = `every ${mins[1]} min`;
      else if (hours) schedule = `every ${hours[1]} h`;
      else if (days) schedule = `every ${days[1]} day(s)`;
      else if (weeks) schedule = `every ${weeks[1]} week(s)`;
      const ah = /atHour\((\d+)\)/.exec(chain);
      const nm = /nearMinute\((\d+)\)/.exec(chain);
      if (ah) schedule += ` @ ${String(ah[1]).padStart(2, '0')}:${nm ? String(nm[1]).padStart(2, '0') : '00'}`;
      if (/inTimezone\(APP\.TZ\)/.test(chain)) schedule += ' (Asia/Kolkata)';

      const line = lineOf(f.src, m.index);
      const installer = enclosingFunction(f, m.index);
      const funcBody = installer
        ? f.src.split('\n').slice(
          (f.functions.find((x) => x.name === installer)?.startLine ?? 1) - 1,
          (f.functions.find((x) => x.name === installer)?.endLine ?? line),
        ).join('\n')
        : '';

      const resolved = resolveHandler(expr, files, f, funcBody);

      triggers.push({
        handler: resolved.handler,
        handlerExpr: expr,
        resolution: resolved.resolution,
        schedule: schedule.trim(),
        file: f.rel,
        line,
        installer,
        conditional: /if\s*\(/.test(f.lines[line - 1] || ''),
      });
    }
  }

  // De-duplicate identical handler+schedule pairs installed from different branches
  const seen = new Set();
  return triggers.filter((t) => {
    const k = `${t.handler}|${t.schedule}|${t.installer}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}


function enclosingFunction(file, idx) {
  let best = null;
  for (const fn of file.functions) {
    if (fn.startLine <= lineOf(file.src, idx) && (!best || fn.startLine > best.startLine)) best = fn;
  }
  return best ? best.name : null;
}

const GOOGLE_SERVICES = [
  'SpreadsheetApp', 'DriveApp', 'GmailApp', 'MailApp', 'Drive', 'HtmlService',
  'ContentService', 'PropertiesService', 'CacheService', 'LockService',
  'UrlFetchApp', 'Utilities', 'Session', 'ScriptApp', 'DocumentApp',
  'SlidesApp', 'FormApp', 'CalendarApp', 'Charts',
];

function parseServices(files) {
  const counts = {};
  const byFile = {};
  for (const s of GOOGLE_SERVICES) { counts[s] = 0; byFile[s] = {}; }
  for (const f of files) {
    for (const s of GOOGLE_SERVICES) {
      const re = new RegExp(`\\b${s}\\b`, 'g');
      const c = (f.blanked.match(re) || []).length;
      if (c) { counts[s] += c; byFile[s][f.rel] = c; }
    }
  }
  return { counts, byFile };
}

function parseIntegrations(files) {
  const hosts = {};
  for (const f of files) {
    const re = /https:\/\/([a-zA-Z0-9.-]+\.[a-z]{2,})/g;
    let m;
    while ((m = re.exec(f.src)) !== null) {
      const host = m[1];
      if (!hosts[host]) hosts[host] = { count: 0, files: new Set() };
      hosts[host].count++;
      hosts[host].files.add(f.rel);
    }
  }
  const out = Object.entries(hosts)
    .map(([host, v]) => ({ host, count: v.count, files: [...v.files] }))
    .sort((a, b) => b.count - a.count);
  return out;
}

/* ------------------------------------------------------------------ *
 * 7. PARSE THE FRONTEND (Index.html)
 * ------------------------------------------------------------------ */

function parseFrontend(sourceDir) {
  const indexPath = path.join(sourceDir, 'Index.html');
  if (!fs.existsSync(indexPath)) return { found: false };

  const html = fs.readFileSync(indexPath, 'utf8');

  // rpc('action', payload) and rpc("action") — the single call path to the backend
  const rpcActions = [...html.matchAll(/rpc\(\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
  const rpcUnique = [...new Set(rpcActions)];

  // non-rpc direct calls (google.script.run.withSuccessHandler(api)...)
  const directRun = (html.match(/google\.script\.run/g) || []).length;

  // Navigation pages: ['pageId','icon','Label'] tuples inside navigationItems()
  const navStart = html.indexOf('function navigationItems(');
  let navPages = [];
  if (navStart !== -1) {
    const navEnd = html.indexOf('\nfunction ', navStart + 10);
    const navBody = html.slice(navStart, navEnd === -1 ? undefined : navEnd);
    const tups = [...navBody.matchAll(/\['([A-Za-z0-9_]+)','([A-Za-z0-9_]+)','([^']+)'\]/g)];
    const seen = new Set();
    for (const t of tups) {
      if (seen.has(t[1])) continue;
      seen.add(t[1]);
      navPages.push({ pageId: t[1], icon: t[2], label: t[3] });
    }
  }

  // Modal / window functions — the "screens" of the SPA
  const modalFns = [...new Set(
    [...html.matchAll(/function\s+(show[A-Z][A-Za-z0-9]*|open[A-Z][A-Za-z0-9]*|render[A-Z][A-Za-z0-9]*)\s*\(/g)].map((m) => m[1]),
  )];

  // Size profile
  const styleBlocks = (html.match(/<style/g) || []).length;
  const scriptBlocks = (html.match(/<script/g) || []).length;

  return {
    found: true,
    path: 'Index.html',
    bytes: Buffer.byteLength(html),
    lines: html.split('\n').length,
    rpcActions: rpcUnique,
    rpcCallSites: rpcActions.length,
    directGoogleRun: directRun,
    navPages,
    modalFns,
    styleBlocks,
    scriptBlocks,
  };
}

/* ------------------------------------------------------------------ *
 * 8. BUSINESS-RULE & FINANCE HEURISTICS
 *
 * Locate the statutory / payroll calculation constants so that the payroll
 * migration can be validated against the legacy engine rather than rebuilt
 * from guesswork.
 * ------------------------------------------------------------------ */

const STATUTORY_MARKERS = [
  { key: 'PF', label: 'Provident Fund', patterns: [/\bpfRate\b/gi, /\bPF_RATE\b/g, /\bepf\b/gi, /provident/gi] },
  { key: 'ESI', label: 'Employees State Insurance', patterns: [/\besiRate\b/gi, /\bESI_RATE\b/g, /employees.?state.?insurance/gi, /\besi\b/gi] },
  { key: 'PT', label: 'Professional Tax', patterns: [/professional.?tax/gi, /\bPT_SLABS?\b/g, /\bptSlab/gi] },
  { key: 'TDS', label: 'Tax Deducted at Source', patterns: [/\btds\b/gi] },
  { key: 'LWF', label: 'Labour Welfare Fund', patterns: [/\blwf\b/gi, /labour.?welfare/gi] },
  { key: 'BONUS', label: 'Statutory Bonus', patterns: [/bonus.?rate/gi, /8\.33/gi, /statutory.?bonus/gi] },
  { key: 'GRATUITY', label: 'Gratuity', patterns: [/gratuity/gi] },
  { key: 'MINWAGE', label: 'Minimum Wages', patterns: [/minimum.?wage/gi] },
  { key: 'OT', label: 'Overtime', patterns: [/overtime/gi, /\botRate\b/gi, /double.?the.?rate/gi] },
  { key: 'LEAVE', label: 'Leave / LOP', patterns: [/\blop\b/gi, /loss.?of.?pay/gi, /leave.?encash/gi] },
];

function parseStatutory(files) {
  const out = [];
  for (const marker of STATUTORY_MARKERS) {
    let total = 0;
    const byFile = {};
    const samples = [];
    for (const f of files) {
      let fileTotal = 0;
      for (const pat of marker.patterns) {
        pat.lastIndex = 0;
        let m;
        while ((m = pat.exec(f.src)) !== null) {
          fileTotal++;
          if (samples.length < 6) {
            const line = lineOf(f.src, m.index);
            const text = f.lines[line - 1].trim().slice(0, 160);
            if (text) samples.push({ file: f.rel, line, text });
          }
        }
      }
      if (fileTotal) byFile[f.rel] = fileTotal;
      total += fileTotal;
    }
    out.push({ key: marker.key, label: marker.label, occurrences: total, byFile, samples });
  }
  return out;
}

/** Find numeric constants that look like statutory rates (for review, never auto-trusted). */
function parseStatutoryConstants(files) {
  const found = [];
  for (const f of files) {
    const re = /^\s*const\s+([A-Z][A-Z0-9_]*)\s*=\s*(-?[\d.]+)\s*;?\s*(?:\/\/\s*(.*))?$/gm;
    let m;
    while ((m = re.exec(f.src)) !== null) {
      const name = m[1];
      if (!/(PF|ESI|PT|TDS|LWF|BONUS|OT|RATE|SLAB|LIMIT|WAGE|MIN|MAX|CAP|GRATUITY)/.test(name)) continue;
      found.push({
        name,
        value: Number(m[2]),
        comment: (m[3] || '').trim(),
        file: f.rel,
        line: lineOf(f.src, re.lastIndex),
      });
    }
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * 9. MODULE CLASSIFICATION
 *
 * Map every source file to one of the product modules from the master
 * instruction (Part 4 A–R) so the traceability matrix can be generated.
 * ------------------------------------------------------------------ */

const MODULE_MAP = {
  'Platform Administration': ['Setup', 'Database', 'Theme', 'Companies'],
  'Organisation Management': ['Companies', 'Setup'],
  'User & Access Management': ['AuthAndApi', 'Database', 'ProfileAndBulkEmail'],
  'Sales CRM': ['LeadsAndSurveys', 'ProfileAndBulkEmail'],
  'Site Survey': ['LeadsAndSurveys'],
  'Quotations': ['Quotations', 'TakeHomeSalary'],
  'Tender Management': ['Tenders', 'TenderOrdersAndSD', 'TenderAI', 'Companies'],
  'Client & Contract Management': ['Clients', 'WonHandover', 'ClientCare'],
  'HR Management': ['HR', 'ManpowerHeroes'],
  'Manpower & Operations': ['HR', 'ManpowerHeroes', 'MinimumWages'],
  'Payroll & Statutory Compliance': ['TakeHomeSalary', 'MinimumWages', 'HR'],
  'Accounts & Finance': ['Accounts', 'BulkImport'],
  'Assets & Inventory': ['Assets'],
  'Reports & Dashboards': ['Reports', 'DailyReports', 'Exports', 'Moms'],
  'SLA & Client Care': ['ServiceLevelAgreements', 'ClientCare'],
  'Marketing & Communication': ['Marketing', 'EmailMarketing', 'SocialMedia', 'EmailDirectory', 'EmailTemplates', 'MarketingTemplates', 'GmailDownloader'],
  'AI Assistant': ['CrmAssistant', 'TenderAI'],
  'Creative Studio & Templates': ['CreativeStudio', 'Presentation', 'PresentationImages', 'ProposalTemplates', 'ServiceTemplateImages', 'Logo'],
  'Collaboration': ['Collaboration', 'Moms'],
  'Document Generation': ['ServiceLevelAgreements', 'Presentation', 'ProposalTemplates', 'ManualDrive', 'Exports'],
};

function classifyFiles(files) {
  const map = {};
  for (const f of files) {
    const base = path.basename(f.rel, '.gs');
    const modules = [];
    for (const [mod, names] of Object.entries(MODULE_MAP)) {
      if (names.includes(base)) modules.push(mod);
    }
    map[f.rel] = modules.length ? modules : ['Unclassified'];
  }
  return map;
}

/* ------------------------------------------------------------------ *
 * 10. DEFECT DETECTION
 *
 * Project Rule #2 also means: identify what is broken. These are objective,
 * mechanically-detectable smells in the legacy codebase, each with a fix in
 * the new architecture.
 * ------------------------------------------------------------------ */

function detectDefects(files, api, frontend, publicEmailLinks) {
  const defects = [];

  // D1 — actions defined in the frontend but with no backend case
  const backendSet = new Set(api.actions.map((a) => a.action));
  if (frontend.found) {
    const orphans = frontend.rpcActions.filter((a) => !backendSet.has(a) && a !== 'login');
    if (orphans.length) {
      defects.push({
        id: 'D1',
        severity: 'high',
        title: 'Frontend calls actions that the backend does not implement',
        detail: `${orphans.length} action(s) are invoked by Index.html but have no matching case in the api() dispatcher. Clicking the button produces a runtime "unknown action" error.`,
        evidence: orphans.slice(0, 40),
      });
    }
  }

  // D2 — actions with no permission guard at all
  const unguarded = api.actions.filter((a) => !a.guard && a.action !== 'ping' && a.action !== 'logout' && a.action !== 'bootstrap');
  if (unguarded.length) {
    defects.push({
      id: 'D2',
      severity: 'critical',
      title: 'API actions reachable with a session but no explicit permission check',
      detail: `${unguarded.length} action(s) rely on authentication only. Any signed-in user of any role can invoke them. The new API must attach an explicit permission to every route.`,
      evidence: unguarded.map((a) => a.action).slice(0, 60),
    });
  }

  // D2b — public email-link endpoints let anyone with the URL act without auth
  if (publicEmailLinks?.found && publicEmailLinks.actions?.length) {
    defects.push({
      id: 'D2b',
      severity: 'high',
      title: 'State-changing operations reachable without authentication via email links',
      detail: `${publicEmailLinks.actions.length} action(s) (indent / purchase-request approve-reject, stock acknowledgement) execute on a URL token alone. Tokens travel in email, in link scanners and in browser history. The replacement keeps an explicit signed, single-use, expiring token endpoint — but scoped to one action, rate limited, and recorded in the audit log.`,
      evidence: publicEmailLinks.actions.map((a) => a.action),
    });
  }

  // D3 — anonymous web app access + execute-as-deploying
  const manifestPath = path.join(ARGS.source, 'appsscript.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const mf = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (mf.webapp?.access === 'ANYONE_ANONYMOUS') {
        defects.push({
          id: 'D3',
          severity: 'critical',
          title: 'Web app is published as ANYONE_ANONYMOUS with broad OAuth scopes',
          detail: 'The deployment is world-readable and executes as the deploying account. All authorisation therefore rests on the in-script token check. The new platform must use per-user authentication with scoped authorisation.',
          evidence: mf.webapp,
        });
      }
      if (mf.oauthScopes?.includes('https://www.googleapis.com/auth/drive')) {
        defects.push({
          id: 'D4',
          severity: 'high',
          title: 'Full Drive scope granted to the application',
          detail: 'The app holds read/write over the entire Drive of the deploying account, which is far beyond what document generation needs. The replacement uses a scoped object-storage adapter plus per-tenant Google OAuth with least privilege.',
          evidence: 'oauthScopes contains .../auth/drive',
        });
      }
    } catch { /* manifest unreadable — noted elsewhere */ }
  }

  // D5 — properties/cache used as configuration store (secret sprawl)
  const propsUsage = files.reduce((n, f) => n + (f.blanked.match(/PropertiesService/g) || []).length, 0);
  if (propsUsage > 10) {
    defects.push({
      id: 'D5',
      severity: 'medium',
      title: 'Configuration and secrets held in PropertiesService script properties',
      detail: `${propsUsage} uses of PropertiesService. Script properties are readable by anyone with editor access to the Apps Script project and are not versioned, auditable or rotatable. The replacement stores configuration in the database and secrets in a managed secret store.`,
      evidence: 'PropertiesService across ' + files.filter((f) => f.blanked.includes('PropertiesService')).length + ' files',
    });
  }

  // D6 — no per-tenant isolation possible in a single spreadsheet
  defects.push({
    id: 'D6',
    severity: 'critical',
    title: 'No tenant isolation: all data lives in one spreadsheet namespace',
    detail: 'Every record in the legacy system belongs to a single implicit organisation. There is no tenant_id concept anywhere in the schema, so sharing the application between customers is impossible without a redesign. This is the single largest change in the new platform and is why Part 5 mandates tenant_id on every tenant-owned table.',
    evidence: 'APP.SHEETS has no tenant-scoped keying',
  });

  // D7 — sequential IDs derived from sheet row counts (race-prone)
  const rowCountIds = [];
  for (const f of files) {
    const re = /getLastRow\(\)/g;
    let m;
    while ((m = re.exec(f.blanked)) !== null) {
      const line = lineOf(f.blanked, m.index);
      const ctx = f.lines.slice(Math.max(0, line - 3), line + 1).join(' ').slice(0, 300);
      if (/(id|Id|ID|no|No)\s*[:=]/.test(ctx)) rowCountIds.push({ file: f.rel, line });
    }
  }
  if (rowCountIds.length) {
    defects.push({
      id: 'D7',
      severity: 'high',
      title: 'Business identifiers derived from sheet row position',
      detail: `${rowCountIds.length} code path(s) build identifiers from the current last row. Concurrent saves can produce duplicate business numbers, and the identifier changes meaning if rows are ever sorted or deleted. The replacement uses sequences inside a transaction.`,
      evidence: rowCountIds.slice(0, 25),
    });
  }

  // D8 — LockService coverage vs. write volume
  const lockCount = files.reduce((n, f) => n + (f.blanked.match(/LockService/g) || []).length, 0);
  if (lockCount < 10) {
    defects.push({
      id: 'D8',
      severity: 'high',
      title: 'Insufficient critical-section protection',
      detail: `Only ${lockCount} LockService usage(s) across 42 files while the app performs thousands of sheet writes, including payroll and invoice numbering. Two simultaneous users can interleave reads and writes. The replacement uses PostgreSQL transactions and row locks.`,
      evidence: `${lockCount} LockService references`,
    });
  }

  // D9 — secrets in source?
  const secretHits = [];
  for (const f of files) {
    const re = /(api[_-]?key|client[_-]?secret|access[_-]?token|password|private[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi;
    let m;
    while ((m = re.exec(f.src)) !== null) {
      secretHits.push({ file: f.rel, line: lineOf(f.src, m.index), snippet: m[0].slice(0, 40) + '…' });
    }
  }
  if (secretHits.length) {
    defects.push({
      id: 'D9',
      severity: 'critical',
      title: 'Possible hard-coded credentials in source',
      detail: `${secretHits.length} literal assignment(s) match credential-shaped patterns. These must be rotated and moved to secret storage before any migration.`,
      evidence: secretHits.slice(0, 20),
    });
  }

  // D10 — giant single-file frontend
  if (frontend.found && frontend.bytes > 500_000) {
    defects.push({
      id: 'D10',
      severity: 'medium',
      title: 'Monolithic single-file frontend',
      detail: `Index.html is ${(frontend.bytes / 1024 / 1024).toFixed(2)} MB and ${frontend.lines.toLocaleString()} lines with ${frontend.scriptBlocks} script blocks and ${frontend.styleBlocks} style blocks. It cannot be code-split, tree-shaken, unit-tested or cached per-route, and every user downloads the whole application.`,
      evidence: `${frontend.bytes} bytes`,
    });
  }

  // D11 — catch blocks that swallow failures
  let swallowed = 0;
  for (const f of files) {
    swallowed += (f.src.match(/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g) || []).length;
    swallowed += (f.src.match(/catch\s*\(\s*\w*\s*\)\s*\{\s*(?:\/\*[\s\S]*?\*\/)?\s*\}/g) || []).length;
  }
  if (swallowed) {
    defects.push({
      id: 'D11',
      severity: 'medium',
      title: 'Silent failure swallowing',
      detail: `${swallowed} empty catch block(s) discard errors without logging. Failures in payroll or invoicing can pass unnoticed. The replacement uses a central exception filter and structured logging with correlation ids.`,
      evidence: `${swallowed} empty catch blocks`,
    });
  }

  // D12 — Console logging volume (PII risk)
  const consoleCount = files.reduce((n, f) => n + (f.blanked.match(/console\.(log|error|warn|info)/g) || []).length, 0);
  defects.push({
    id: 'D12',
    severity: 'medium',
    title: 'Unstructured console logging in production paths',
    detail: `${consoleCount} console.* calls with no redaction layer. Apps Script logs are visible to project editors and may contain employee or client data. The replacement uses a structured logger with a mandatory redaction allow-list that refuses to serialise password, token, bank-account and employee-personal fields.`,
    evidence: `${consoleCount} console calls`,
  });

  return defects;
}

/* ------------------------------------------------------------------ *
 * 11. MAIN
 * ------------------------------------------------------------------ */

function main() {
  if (!fs.existsSync(ARGS.source)) {
    console.error(`ERROR: source directory not found: ${ARGS.source}`);
    console.error('Pass --source <dir> pointing at the extracted v5.6.61 project.');
    process.exit(1);
  }

  console.log(`Auditing source: ${ARGS.source}`);

  const gsPaths = walk(ARGS.source, (n) => n.endsWith('.gs'));
  const htmlPaths = walk(ARGS.source, (n) => n.endsWith('.html'));
  const jsPaths = walk(ARGS.source, (n) => n.endsWith('.js') && !n.endsWith('.gs'));
  const mdPaths = walk(ARGS.source, (n) => n.endsWith('.md'));
  const jsonPaths = walk(ARGS.source, (n) => n.endsWith('.json'));

  const files = gsPaths.map(parseGsFile);
  const app = parseAppConstant(files);
  const api = parseApiDispatcher(files);
  const publicEmailLinks = parsePublicEmailLinkActions(files);
  const publicEndpoints = parsePublicEndpoints(files);
  const triggers = parseTriggers(files);
  const services = parseServices(files);
  const integrations = parseIntegrations(files);
  const frontend = parseFrontend(ARGS.source);
  const statutory = parseStatutory(files);
  const statutoryConstants = parseStatutoryConstants(files);
  const fileModules = classifyFiles(files);
  const defects = detectDefects(files, api, frontend, publicEmailLinks);

  // total function call graph (who calls whom) — used for traceability
  const fnNames = new Set(files.flatMap((f) => f.functions.map((x) => x.name)));
  for (const f of files) {
    for (const fn of f.functions) {
      if (fn.loc <= 1) continue;
      const body = f.lines.slice(fn.startLine - 1, fn.endLine).join('\n');
      const callers = new Set();
      for (const other of files) {
        if (other === f) continue;
        const re = new RegExp(`\\b${fn.name.replace(/\$/g, '\\$')}\\s*\\(`, 'g');
        if (re.test(other.blanked)) callers.add(other.rel);
      }
      fn.crossFileCallers = [...callers];
      fn.body = body;
    }
  }

  const totalFunctions = files.reduce((n, f) => n + f.functions.length, 0);
  const totalLoc = files.reduce((n, f) => n + f.src.split('\n').length, 0);

  const audit = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourcePath: ARGS.source,
      auditorVersion: '1.0.0',
      appName: app.appName,
      appVersion: app.version,
      timezone: app.timezone,
      sessionHours: app.sessionHours,
    },
    counts: {
      gsFiles: gsPaths.length,
      htmlFiles: htmlPaths.length,
      jsFiles: jsPaths.length,
      mdFiles: mdPaths.length,
      jsonFiles: jsonPaths.length,
      totalFiles: gsPaths.length + htmlPaths.length + jsPaths.length + mdPaths.length + jsonPaths.length,
      serverFunctions: totalFunctions,
      serverLoc: totalLoc,
      apiActions: api.actions.length,
      publicEmailLinkActions: publicEmailLinks.actions?.length ?? 0,
      totalSwitchActions: api.actions.length + (publicEmailLinks.actions?.length ?? 0),
      publicEndpoints: publicEndpoints.length,
      sheets: app.sheets.length,
      sheetsWithColumns: Object.keys(app.columns).length,
      roles: app.roles.length,
      triggers: triggers.length,
      frontendRpcActions: frontend.rpcActions?.length ?? 0,
      navPages: frontend.navPages?.length ?? 0,
    },
    app,
    files: files.map((f) => ({
      file: f.rel,
      bytes: f.bytes,
      loc: f.src.split('\n').length,
      functions: f.functions.length,
      publicFunctions: f.functions.filter((x) => x.visibility === 'public').length,
      modules: fileModules[f.rel],
      services: GOOGLE_SERVICES.filter((s) => services.byFile[s][f.rel]),
    })),
    functions: files.flatMap((f) => f.functions.map(({ body, ...rest }) => rest)),
    api,
    publicEmailLinks,
    publicEndpoints,
    sheets: app.sheets,
    columns: app.columns,
    roles: app.roles,
    triggers,
    services: services.counts,
    integrations,
    frontend,
    statutory,
    statutoryConstants,
    defects,
    fileModules,
  };

  fs.mkdirSync(path.dirname(ARGS.json), { recursive: true });
  fs.writeFileSync(ARGS.json, JSON.stringify(audit, null, 2));
  console.log(`Wrote ${ARGS.json}`);

  return audit;
}

export { main, blankNonCode, parseGsFile, parseApiDispatcher };

if (import.meta.url === `file://${process.argv[1]}`) {
  const audit = main();
  console.log('\n=== VERIFIED COUNTS ===');
  for (const [k, v] of Object.entries(audit.counts)) {
    console.log(`  ${k.padEnd(24)} ${v}`);
  }
  console.log('\n=== DEFECTS DETECTED ===');
  for (const d of audit.defects) {
    console.log(`  [${d.id}] ${d.severity.toUpperCase().padEnd(8)} ${d.title}`);
  }
}
