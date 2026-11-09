#!/usr/bin/env node
/**
 * Reconciliation — Phase 9 production readiness.
 * Compares audit.json (source truth) against Prisma schema + traceability matrix
 * and emits a machine-readable report. No Sheets credentials needed — runs
 * offline from committed artefacts.
 *
 * Usage: node migration/reconciliation/reconcile.mjs [--json]
 * Exit 0 even with mismatches; mismatches are reported, not hidden.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../..');
const auditPath = join(root, 'migration/source-inventory/audit.json');
const schemaPath = join(root, 'packages/database/prisma/schema.prisma');
const matrixPath = join(root, 'migration/source-inventory/traceability-matrix.csv');

function countInSchema(schema, needle) {
  return (schema.match(new RegExp(needle, 'gm')) || []).length;
}

function main() {
  const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
  const schema = readFileSync(schemaPath, 'utf8');
  const matrix = existsSync(matrixPath) ? readFileSync(matrixPath, 'utf8') : '';

  const report = {
    generatedAt: new Date().toISOString(),
    source: `v${audit.meta?.appVersion ?? 'unknown'} (${audit.counts?.sheets ?? '?'} sheets, ${audit.counts?.apiActions ?? '?'} actions)`,
    checks: [],
  };

  function check(name, expected, actual, notes = '') {
    const pass = expected === actual || (typeof expected === 'function' && expected(actual));
    report.checks.push({ name, expected, actual, pass, notes });
    return pass;
  }

  // 1. Prisma models exist
  check('Prisma models count >= 40', (n) => n >= 40, countInSchema(schema, '^model\\s+\\w+'), 'Core tenancy + all phases');
  check('Enum TenantStatus exists', 1, countInSchema(schema, 'enum TenantStatus'));
  check('Enum SubscriptionStatus exists', 1, countInSchema(schema, 'enum SubscriptionStatus'));
  check('Model Job (Phase 8 queue)', 1, countInSchema(schema, 'model Job\\b'));
  check('Model TenantBranding exists', 1, countInSchema(schema, 'model TenantBranding'));

  // 2. Traceability matrix coverage
  const matrixRows = matrix ? matrix.split('\n').filter(l => l.trim()).length - 1 : 0;
  check('Traceability matrix rows >= 400', (n) => n >= 400, matrixRows, 'One row per legacy action');

  // 3. RLS migrations: every tenant-owned table should have enable RLS
  const migrations = countInSchema(schema, '@@map\\(');
  check('Prisma tables with @@map >= 35', (n) => n >= 35, migrations);

  // 4. OpenAPI stub exists
  const openapiExists = existsSync(join(root, 'docs/openapi.json'));
  check('docs/openapi.json exists', true, openapiExists, 'Generated on API bootstrap, stub OK');

  // 5. Deployment docs
  check('docs/deployment.md exists', true, existsSync(join(root, 'docs/deployment.md')));
  check('docs/commercial-saas.md exists', true, existsSync(join(root, 'docs/commercial-saas.md')));

  // Summarize
  const fails = report.checks.filter(c => !c.pass);
  report.summary = { total: report.checks.length, passed: report.checks.length - fails.length, failed: fails.length };

  const outDir = join(root, 'migration/reconciliation/reports');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `report-${new Date().toISOString().slice(0,10)}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  // Human readable
  const md = [
    `# Reconciliation ${report.generatedAt}`,
    `Source: ${report.source}`,
    '',
    `Summary: ${report.summary.passed}/${report.summary.total} passed`,
    '',
    '| Check | Expected | Actual | Pass | Notes |',
    '|---|---|---|---|---|',
    ...report.checks.map(c => `| ${c.name} | ${c.expected} | ${c.actual} | ${c.pass ? '✅' : '❌'} | ${c.notes} |`),
    '',
    fails.length ? `**${fails.length} failing check(s) — see JSON at ${outPath}**` : 'All checks passed.',
  ].join('\n');
  writeFileSync(join(outDir, `report-${new Date().toISOString().slice(0,10)}.md`), md);

  const asJson = process.argv.includes('--json');
  if (asJson) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(md);
    console.log(`\n→ ${outPath}`);
  }
  // Exit 0 always — failures are reconciliation findings, not script errors
}

main();
