#!/usr/bin/env node
/**
 * Seed — development and test data ONLY.
 *
 * Project Rule 6 forbids fake records as production data and Rule 16 forbids
 * real customer data anywhere. This script is therefore:
 *   - clearly synthetic (Alpha/Bravo demo tenants),
 *   - never run in production (it refuses unless ALLOW_SEED=true),
 *   - idempotent (safe to re-run).
 *
 * It creates two tenants so tenant isolation is demonstrable, the starter
 * roles from the permission catalogue, and one user per tenant.
 */

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

if (process.env.ALLOW_SEED !== 'true' && process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV=production. Set ALLOW_SEED=true to override.');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

/* Permission catalogue mirrored from apps/api/src/permissions/catalogue.ts.
   Kept in sync manually; the API startup assertion catches drift. */
const PERMISSIONS = {
  'org:read': ['organisation', 'read'],
  'org:write': ['organisation', 'write'],
  'user:read': ['user', 'read'],
  'user:write': ['user', 'write'],
  'role:read': ['role', 'read'],
  'role:write': ['role', 'write'],
  'lead:read': ['lead', 'read'],
  'lead:write': ['lead', 'write'],
  'lead:read:own': ['lead', 'read:own'],
  'survey:read': ['survey', 'read'],
  'survey:write': ['survey', 'write'],
  'quotation:read': ['quotation', 'read'],
  'quotation:write': ['quotation', 'write'],
  'quotation:approve': ['quotation', 'approve'],
  'tender:read': ['tender', 'read'],
  'tender:read:own': ['tender', 'read:own'],
  'tender:write': ['tender', 'write'],
  'tender:approve': ['tender', 'approve'],
  'client:read': ['client', 'read'],
  'client:write': ['client', 'write'],
  'contract:read': ['contract', 'read'],
  'contract:write': ['contract', 'write'],
  'sla:read': ['sla', 'read'],
  'sla:write': ['sla', 'write'],
  'complaint:read': ['complaint', 'read'],
  'complaint:write': ['complaint', 'write'],
  'employee:read': ['employee', 'read'],
  'employee:write': ['employee', 'write'],
  'employee:pii:read': ['employee', 'pii:read'],
  'allocation:read': ['allocation', 'read'],
  'allocation:write': ['allocation', 'write'],
  'manpower:read': ['manpower', 'read'],
  'manpower:write': ['manpower', 'write'],
  'statutory:read': ['statutory', 'read'],
  'attendance:read': ['attendance', 'read'],
  'attendance:write': ['attendance', 'write'],
  'statutory:write': ['statutory', 'write'],
  'payroll:read': ['payroll', 'read'],
  'payroll:prepare': ['payroll', 'prepare'],
  'payroll:approve': ['payroll', 'approve'],
  'invoice:read': ['invoice', 'read'],
  'invoice:write': ['invoice', 'write'],
  'vendor_bill:read': ['vendor_bill', 'read'],
  'vendor_bill:write': ['vendor_bill', 'write'],
  'finance:approve': ['finance', 'approve'],
  'bank:read': ['bank', 'read'],
  'bank:write': ['bank', 'write'],
  'asset:read': ['asset', 'read'],
  'asset:write': ['asset', 'write'],
  'vendor:read': ['vendor', 'read'],
  'vendor:write': ['vendor', 'write'],
  'purchase_order:read': ['purchase_order', 'read'],
  'purchase_order:write': ['purchase_order', 'write'],
  'stock:read': ['stock', 'read'],
  'stock:write': ['stock', 'write'],
  'indent:read': ['indent', 'read'],
  'indent:write': ['indent', 'write'],
  'audit:read': ['audit', 'read'],
  'billing:read': ['billing', 'read'],
  'billing:write': ['billing', 'write'],
  'branding:write': ['branding', 'write'],
};

const HR_READ = ['employee:read', 'allocation:read', 'manpower:read', 'statutory:read', 'attendance:read'];
const HR_WRITE = ['employee:write', 'allocation:write', 'manpower:write', 'attendance:write'];
const FINANCE_READ = ['invoice:read','vendor_bill:read','bank:read','vendor:read','purchase_order:read','stock:read','asset:read','indent:read'];
const FINANCE_WRITE = ['invoice:write','vendor_bill:write','bank:write','finance:approve','vendor:write','purchase_order:write','stock:write','asset:write','indent:write'];
const READ_ALL = ['org:read', 'user:read', 'role:read', 'lead:read', 'survey:read', 'quotation:read', 'tender:read', 'client:read', 'contract:read', 'sla:read', 'complaint:read', ...HR_READ, 'payroll:read', ...FINANCE_READ, 'audit:read', 'billing:read'];
const SALES = ['lead:read', 'lead:write', 'survey:read', 'survey:write', 'quotation:read', 'quotation:write'];
const TENDERS = ['tender:read', 'tender:write', 'tender:approve'];
const CLIENTS = ['client:read', 'client:write', 'contract:read', 'contract:write', 'sla:read', 'sla:write', 'complaint:read', 'complaint:write'];

const ROLES = [
  { code: 'tenant_owner', name: 'Owner', description: 'Full control of the tenant', permissions: '*' },
  { code: 'tenant_admin', name: 'Administrator', description: 'Configure the organisation and users', permissions: [...READ_ALL, 'org:write', 'user:write', 'role:write', ...SALES, ...TENDERS, ...CLIENTS, ...HR_WRITE, 'statutory:write', 'payroll:prepare', ...FINANCE_WRITE, 'quotation:approve', 'branding:write'] },
  { code: 'viewer', name: 'Viewer (Management)', description: 'Read-only across the tenant', permissions: READ_ALL },
  { code: 'bd_manager', name: 'BD Manager', description: 'Sales oversight and quotation approval', permissions: [...READ_ALL, ...SALES, ...TENDERS, ...CLIENTS, 'quotation:approve'] },
  { code: 'tender_desk', name: 'Tender Desk', description: 'Owns the tender pipeline end to end', permissions: ['tender:read:own', 'tender:write', 'org:read', 'client:read', 'quotation:read'] },
  { code: 'sales_executive', name: 'Sales Executive', description: 'Own leads and follow-ups only', permissions: ['lead:read:own', 'lead:write', 'survey:read', 'quotation:read', 'org:read'] },
  { code: 'operations', name: 'Operations Coordinator', description: 'Surveys and site operations', permissions: [...READ_ALL, 'survey:write', 'lead:write', 'quotation:write', 'complaint:write'] },
  { code: 'client_care', name: 'Client Care', description: 'Handles complaints, SLA tracking and feedback', permissions: ['client:read', 'contract:read', 'sla:read', 'complaint:read', 'complaint:write', 'org:read'] },
  { code: 'hr_manager', name: 'HR Manager', description: 'Owns the workforce: employees, deployment and payroll preparation', permissions: [...HR_READ, ...HR_WRITE, 'payroll:read', 'payroll:prepare', 'org:read', 'client:read', 'contract:read'] },
  { code: 'payroll_approver', name: 'Payroll Approver', description: 'Reviews and approves payroll. Cannot prepare it (maker-checker)', permissions: ['payroll:read', 'payroll:approve', 'employee:read', 'statutory:read'] },
  { code: 'finance_manager', name: 'Finance Manager', description: 'Owns receivables, payables and bank book', permissions: [...FINANCE_READ,'invoice:write','vendor_bill:write','vendor:write','bank:write','org:read','client:read'] },
  { code: 'finance_approver', name: 'Finance Approver', description: 'Approves high-value receipts/payments', permissions: [...FINANCE_READ,'finance:approve','org:read'] },
  { code: 'store_manager', name: 'Store Manager', description: 'Owns assets, stock and purchase orders', permissions: ['asset:read','asset:write','vendor:read','purchase_order:read','purchase_order:write','stock:read','stock:write','indent:read','indent:write','org:read'] },
];

async function main() {
  console.log('Seeding development data…');

  // --- permissions are platform-global ---
  for (const [code, [module, action]] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, module, action, description: `${module} ${action}` },
    });
  }
  console.log(`  permissions: ${Object.keys(PERMISSIONS).length}`);

  // --- modules + plans (prices configurable, never hard-coded in code paths) ---
  const modules = [
    ['crm', 'Sales CRM'], ['tenders', 'Tender Management'], ['hr', 'HR & Manpower'],
    ['payroll', 'Payroll'], ['accounts', 'Accounts & Finance'], ['assets', 'Assets & Inventory'],
    ['marketing', 'Marketing'], ['ai', 'AI Assistant'], ['sla', 'SLA & Client Care'],
  ];
  for (const [code, name] of modules) {
    await prisma.module.upsert({ where: { code }, update: {}, create: { code, name } });
  }

  const planSpecs = [
    { code: 'trial', name: 'Free Trial', monthlyPrice: 0, annualPrice: 0, trialDays: 14, userLimit: 3, whiteLabel: false, modules: ['crm'] },
    { code: 'professional', name: 'Professional', monthlyPrice: 4999, annualPrice: 49990, trialDays: 14, userLimit: 25, whiteLabel: false, modules: ['crm', 'tenders', 'hr', 'accounts', 'assets', 'sla'] },
    { code: 'enterprise', name: 'Enterprise', monthlyPrice: 14999, annualPrice: 149990, trialDays: 30, userLimit: null, whiteLabel: true, modules: modules.map(([c]) => c) },
  ];
  for (const p of planSpecs) {
    const plan = await prisma.plan.upsert({
      where: { code: p.code },
      update: { monthlyPrice: p.monthlyPrice, annualPrice: p.annualPrice },
      create: {
        code: p.code, name: p.name, monthlyPrice: p.monthlyPrice, annualPrice: p.annualPrice,
        trialDays: p.trialDays, userLimit: p.userLimit, whiteLabel: p.whiteLabel,
      },
    });
    for (const mcode of p.modules) {
      const mod = await prisma.module.findUnique({ where: { code: mcode } });
      if (mod) {
        await prisma.planModule.upsert({
          where: { planId_moduleId: { planId: plan.id, moduleId: mod.id } },
          update: {},
          create: { planId: plan.id, moduleId: mod.id },
        });
      }
    }
  }
  console.log(`  plans: ${planSpecs.length}`);

  // --- two demo tenants ---
  const tenants = [
    {
      slug: 'alpha', legalName: 'Alpha Facility Services Pvt Ltd', displayName: 'Alpha Facility Services',
      color: '#E9682D', user: { email: 'owner@alpha.test', name: 'Alpha Owner', password: 'AlphaOwner!2026' },
    },
    {
      slug: 'bravo', legalName: 'Bravo Integrated Services Pvt Ltd', displayName: 'Bravo Integrated Services',
      color: '#1F6FEB', user: { email: 'owner@bravo.test', name: 'Bravo Owner', password: 'BravoOwner!2026' },
    },
  ];

  for (const t of tenants) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: t.slug },
      update: {},
      create: {
        slug: t.slug,
        legalName: t.legalName,
        displayName: t.displayName,
        status: 'ACTIVE',
        whiteLabel: true,
      },
    });

    await prisma.tenantBranding.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        primaryColor: t.color,
        secondaryColor: '#18212B',
        accentColor: '#2D7D67',
        loginHeadline: `Sign in to ${t.displayName}`,
        footerText: `${t.displayName} · Powered by UFMS Business Management Suite`,
      },
    });

    // roles
    const roleIds = {};
    for (const r of ROLES) {
      const role = await prisma.role.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: r.code } },
        update: {},
        create: { tenantId: tenant.id, code: r.code, name: r.name, description: r.description, isSystem: true },
      });
      roleIds[r.code] = role.id;

      const codes = r.permissions === '*' ? Object.keys(PERMISSIONS) : r.permissions;
      for (const code of codes) {
        const perm = await prisma.permission.findUnique({ where: { code } });
        if (perm) {
          await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
            update: {},
            create: { roleId: role.id, permissionId: perm.id },
          });
        }
      }
    }

    // company + branch + site
    const company = await prisma.company.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: 'HO' } },
      update: {},
      create: { tenantId: tenant.id, code: 'HO', legalName: t.legalName, displayName: t.displayName },
    });
    const branch = await prisma.branch.upsert({
      where: { companyId_code: { companyId: company.id, code: 'BLR' } },
      update: {},
      create: { tenantId: tenant.id, companyId: company.id, code: 'BLR', name: 'Bengaluru', city: 'Bengaluru', state: 'Karnataka' },
    });
    await prisma.site.upsert({
      where: { companyId_code: { companyId: company.id, code: 'SITE-001' } },
      update: {},
      create: { tenantId: tenant.id, companyId: company.id, branchId: branch.id, code: 'SITE-001', name: 'Demo Corporate Park', city: 'Bengaluru', state: 'Karnataka' },
    });

    for (const deptName of ['Sales', 'Operations', 'HR', 'Accounts']) {
      await prisma.department.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: deptName } },
        update: {},
        create: { tenantId: tenant.id, name: deptName },
      });
    }

    // owner user
    const passwordHash = await argon2.hash(t.user.password, { type: argon2.argon2id });
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: t.user.email } },
      update: {},
      create: {
        tenantId: tenant.id,
        email: t.user.email,
        name: t.user.name,
        passwordHash,
        mustChangePassword: false,
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleIds.tenant_owner } },
      update: {},
      create: { userId: user.id, roleId: roleIds.tenant_owner },
    });

    // subscription on the trial plan
    const existingSub = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
    if (!existingSub) {
      const plan = await prisma.plan.findUnique({ where: { code: 'professional' } });
      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
        },
      });
    }

    // ------------------------------------------------------------------
    // Statutory configuration (Phase 4/5).
    //
    // These are the v5.6.61 figures transcribed into effective-dated records,
    // NOT a transcription of a current gazette. They are seeded CONFIRMED so
    // the product can run payroll end to end out of the box, and every record
    // carries a sourceReference saying exactly where it came from and that it
    // must be re-checked before any production payroll (Rule 15).
    // ------------------------------------------------------------------
    const REVIEW_WARNING =
      'DEMONSTRATION DATA: transcribed from UFMS v5.6.61 legacy constants. '
      + 'Must be reviewed against the current EPFO / ESIC / State notification before production payroll.';

    const central = await prisma.statutoryRateSet.upsert({
      where: { tenantId_code_effectiveFrom: { tenantId: tenant.id, code: 'EPFO-CENTRAL-2025', effectiveFrom: new Date('2025-01-01') } },
      update: {},
      create: {
        tenantId: tenant.id,
        code: 'EPFO-CENTRAL-2025',
        name: 'Central PF and ESI rates (legacy defaults)',
        jurisdiction: 'CENTRAL',
        status: 'CONFIRMED',
        effectiveFrom: new Date('2025-01-01'),
        effectiveTo: new Date('2030-12-31'),
        sourceReference: REVIEW_WARNING,
        reviewNotes: 'PF wage ceiling 25000 per Quotations.gs:897 and HR.gs:48-52.',
        reviewedAt: new Date(),
        rates: {
          create: [
            { tenantId: tenant.id, code: 'PF_WAGE_CAP', label: 'EPF wage ceiling', value: 25000, unit: 'AMOUNT' },
            { tenantId: tenant.id, code: 'PF_EE_PCT', label: 'Employee EPF share', value: 12, unit: 'PERCENT' },
            { tenantId: tenant.id, code: 'PF_ER_PCT', label: 'Employer EPF share', value: 12, unit: 'PERCENT' },
            { tenantId: tenant.id, code: 'ESI_GROSS_CEILING', label: 'ESI gross ceiling', value: 21000, unit: 'AMOUNT' },
            { tenantId: tenant.id, code: 'ESI_EE_PCT', label: 'Employee ESI share', value: 0.75, unit: 'PERCENT' },
            { tenantId: tenant.id, code: 'ESI_ER_PCT', label: 'Employer ESI share', value: 3.25, unit: 'PERCENT' },
          ],
        },
      },
    });

    await prisma.statutoryRateSet.upsert({
      where: { tenantId_code_effectiveFrom: { tenantId: tenant.id, code: 'KA-PT-2025', effectiveFrom: new Date('2025-01-01') } },
      update: {},
      create: {
        tenantId: tenant.id,
        code: 'KA-PT-2025',
        name: 'Karnataka professional tax (legacy defaults)',
        jurisdiction: 'KARNATAKA',
        status: 'CONFIRMED',
        effectiveFrom: new Date('2025-01-01'),
        effectiveTo: new Date('2030-12-31'),
        sourceReference: REVIEW_WARNING,
        reviewNotes: 'Rs 200 per month, Rs 300 in February so the year totals Rs 2500.',
        reviewedAt: new Date(),
        slabs: {
          create: [
            { tenantId: tenant.id, fromGross: 0, toGross: 24999.99, amount: 0 },
            { tenantId: tenant.id, fromGross: 25000, toGross: 999999999, amount: 200, overrideMonth: 2, overrideAmount: 300 },
          ],
        },
      },
    });

    // Minimum wage floors. Illustrative figures for a working demo — the real
    // Karnataka schedule is published per zone and per scheduled employment and
    // is revised twice a year.
    for (const [category, monthlyWage] of [
      ['UNSKILLED', 15500],
      ['SEMI_SKILLED', 17000],
      ['SKILLED', 18500],
      ['HIGHLY_SKILLED', 20000],
    ]) {
      const existing = await prisma.minimumWageRate.findFirst({
        where: { tenantId: tenant.id, regime: 'KARNATAKA', zone: 'ZONE_1', category, effectiveFrom: new Date('2025-01-01') },
      });
      if (!existing) {
        await prisma.minimumWageRate.create({
          data: {
            tenantId: tenant.id,
            regime: 'KARNATAKA',
            zone: 'ZONE_1',
            category,
            monthlyWage,
            status: 'CONFIRMED',
            effectiveFrom: new Date('2025-01-01'),
            effectiveTo: new Date('2030-12-31'),
            sourceReference: REVIEW_WARNING,
          },
        });
      }
    }

    console.log(`  tenant ${t.slug}: company/branch/site/departments/owner ready`);
  }

  console.log('\nSeed complete. Demo credentials (development only):');
  console.log('  alpha → owner@alpha.test / AlphaOwner!2026');
  console.log('  bravo → owner@bravo.test / BravoOwner!2026');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
