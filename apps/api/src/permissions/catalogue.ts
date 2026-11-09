/**
 * Permission catalogue
 * ====================
 * Every API route declares one of these codes. `PermissionsGuard` fails
 * CLOSED: a route with no `@RequirePermission()` is rejected at startup by
 * `assertCatalogueCoverage()` and again at request time.
 *
 * This exists because the legacy system left 392 of 537 actions guarded by
 * nothing but "is there a session?" (see docs/known-defects-and-risks.md, D2).
 */

export const PERMISSIONS = {
  // organisation
  ORG_READ: 'org:read',
  ORG_WRITE: 'org:write',
  // users & access
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  ROLE_READ: 'role:read',
  ROLE_WRITE: 'role:write',
  // sales crm
  LEAD_READ: 'lead:read',
  LEAD_WRITE: 'lead:write',
  LEAD_READ_OWN: 'lead:read:own',
  SURVEY_READ: 'survey:read',
  SURVEY_WRITE: 'survey:write',
  // quotations
  QUOTATION_READ: 'quotation:read',
  QUOTATION_WRITE: 'quotation:write',
  QUOTATION_APPROVE: 'quotation:approve',
  // tender management
  TENDER_READ: 'tender:read',
  TENDER_READ_OWN: 'tender:read:own',
  TENDER_WRITE: 'tender:write',
  TENDER_APPROVE: 'tender:approve',
  // clients & contracts
  CLIENT_READ: 'client:read',
  CLIENT_WRITE: 'client:write',
  CONTRACT_READ: 'contract:read',
  CONTRACT_WRITE: 'contract:write',
  // SLA & client care
  SLA_READ: 'sla:read',
  SLA_WRITE: 'sla:write',
  COMPLAINT_READ: 'complaint:read',
  COMPLAINT_WRITE: 'complaint:write',
  // HR & workforce
  EMPLOYEE_READ: 'employee:read',
  EMPLOYEE_WRITE: 'employee:write',
  /** Decrypt and reveal a full Aadhaar/PAN/bank value. Deliberately separate. */
  EMPLOYEE_PII_READ: 'employee:pii:read',
  ALLOCATION_READ: 'allocation:read',
  ALLOCATION_WRITE: 'allocation:write',
  MANPOWER_READ: 'manpower:read',
  MANPOWER_WRITE: 'manpower:write',
  STATUTORY_READ: 'statutory:read',
  STATUTORY_WRITE: 'statutory:write',
  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_WRITE: 'attendance:write',
  PAYROLL_PREPARE: 'payroll:prepare',
  PAYROLL_APPROVE: 'payroll:approve',
  PAYROLL_READ: 'payroll:read',
  // finance & accounts
  INVOICE_READ: 'invoice:read',
  INVOICE_WRITE: 'invoice:write',
  VENDOR_BILL_READ: 'vendor_bill:read',
  VENDOR_BILL_WRITE: 'vendor_bill:write',
  FINANCE_APPROVE: 'finance:approve',
  BANK_READ: 'bank:read',
  BANK_WRITE: 'bank:write',
  // assets & inventory
  ASSET_READ: 'asset:read',
  ASSET_WRITE: 'asset:write',
  VENDOR_READ: 'vendor:read',
  VENDOR_WRITE: 'vendor:write',
  PURCHASE_ORDER_READ: 'purchase_order:read',
  PURCHASE_ORDER_WRITE: 'purchase_order:write',
  STOCK_READ: 'stock:read',
  STOCK_WRITE: 'stock:write',
  INDENT_READ: 'indent:read',
  INDENT_WRITE: 'indent:write',
  // marketing & communication
  MARKETING_CONTACT_READ: 'marketing:contact:read',
  MARKETING_CONTACT_WRITE: 'marketing:contact:write',
  MARKETING_CAMPAIGN_READ: 'marketing:campaign:read',
  MARKETING_CAMPAIGN_WRITE: 'marketing:campaign:write',
  MARKETING_CAMPAIGN_APPROVE: 'marketing:campaign:approve',
  MARKETING_TEMPLATE_READ: 'marketing:template:read',
  MARKETING_TEMPLATE_WRITE: 'marketing:template:write',
  SOCIAL_READ: 'social:read',
  SOCIAL_WRITE: 'social:write',
  SOCIAL_APPROVE: 'social:approve',
  // reports & dashboards
  REPORT_READ: 'report:read',
  REPORT_WRITE: 'report:write',
  MOM_READ: 'mom:read',
  MOM_WRITE: 'mom:write',
  DAILY_REPORT_READ: 'daily_report:read',
  DAILY_REPORT_WRITE: 'daily_report:write',
  // AI assistant
  AI_READ: 'ai:read',
  AI_WRITE: 'ai:write',
  AI_APPROVE: 'ai:approve',
  AI_ADMIN: 'ai:admin',
  // creative studio
  CREATIVE_READ: 'creative:read',
  CREATIVE_WRITE: 'creative:write',
  // platform
  AUDIT_READ: 'audit:read',
  BILLING_READ: 'billing:read',
  BILLING_WRITE: 'billing:write',
  BRANDING_WRITE: 'branding:write',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** All codes, for seeding and for the coverage assertion. */
export const ALL_PERMISSIONS: PermissionCode[] = Object.values(PERMISSIONS);

export interface RoleDefinition {
  code: string;
  name: string;
  description: string;
  permissions: PermissionCode[] | '*';
}

const SALES = [
  PERMISSIONS.LEAD_READ,
  PERMISSIONS.LEAD_WRITE,
  PERMISSIONS.SURVEY_READ,
  PERMISSIONS.SURVEY_WRITE,
  PERMISSIONS.QUOTATION_READ,
  PERMISSIONS.QUOTATION_WRITE,
];

const TENDERS = [
  PERMISSIONS.TENDER_READ,
  PERMISSIONS.TENDER_WRITE,
  PERMISSIONS.TENDER_APPROVE,
];

const CLIENTS = [
  PERMISSIONS.CLIENT_READ,
  PERMISSIONS.CLIENT_WRITE,
  PERMISSIONS.CONTRACT_READ,
  PERMISSIONS.CONTRACT_WRITE,
  PERMISSIONS.SLA_READ,
  PERMISSIONS.SLA_WRITE,
  PERMISSIONS.COMPLAINT_READ,
  PERMISSIONS.COMPLAINT_WRITE,
];

const HR_READ = [
  PERMISSIONS.EMPLOYEE_READ,
  PERMISSIONS.ALLOCATION_READ,
  PERMISSIONS.MANPOWER_READ,
  PERMISSIONS.STATUTORY_READ,
  PERMISSIONS.ATTENDANCE_READ,
];

const HR_WRITE = [
  PERMISSIONS.EMPLOYEE_WRITE,
  PERMISSIONS.ALLOCATION_WRITE,
  PERMISSIONS.MANPOWER_WRITE,
  PERMISSIONS.ATTENDANCE_WRITE,
];

const FINANCE_READ = [
  PERMISSIONS.INVOICE_READ,
  PERMISSIONS.VENDOR_BILL_READ,
  PERMISSIONS.BANK_READ,
  PERMISSIONS.VENDOR_READ,
  PERMISSIONS.PURCHASE_ORDER_READ,
  PERMISSIONS.STOCK_READ,
  PERMISSIONS.ASSET_READ,
  PERMISSIONS.INDENT_READ,
];
const FINANCE_WRITE = [
  PERMISSIONS.INVOICE_WRITE,
  PERMISSIONS.VENDOR_BILL_WRITE,
  PERMISSIONS.BANK_WRITE,
  PERMISSIONS.FINANCE_APPROVE,
  PERMISSIONS.VENDOR_WRITE,
  PERMISSIONS.PURCHASE_ORDER_WRITE,
  PERMISSIONS.STOCK_WRITE,
  PERMISSIONS.ASSET_WRITE,
  PERMISSIONS.INDENT_WRITE,
];

const MARKETING_READ = [
  PERMISSIONS.MARKETING_CONTACT_READ,
  PERMISSIONS.MARKETING_CAMPAIGN_READ,
  PERMISSIONS.MARKETING_TEMPLATE_READ,
  PERMISSIONS.SOCIAL_READ,
];
const MARKETING_WRITE = [
  PERMISSIONS.MARKETING_CONTACT_WRITE,
  PERMISSIONS.MARKETING_CAMPAIGN_WRITE,
  PERMISSIONS.MARKETING_CAMPAIGN_APPROVE,
  PERMISSIONS.MARKETING_TEMPLATE_WRITE,
  PERMISSIONS.SOCIAL_WRITE,
  PERMISSIONS.SOCIAL_APPROVE,
];
const REPORTS_ALL = [
  PERMISSIONS.REPORT_READ,
  PERMISSIONS.REPORT_WRITE,
  PERMISSIONS.MOM_READ,
  PERMISSIONS.MOM_WRITE,
  PERMISSIONS.DAILY_REPORT_READ,
  PERMISSIONS.DAILY_REPORT_WRITE,
];
const AI_ALL = [
  PERMISSIONS.AI_READ,
  PERMISSIONS.AI_WRITE,
  PERMISSIONS.AI_APPROVE,
  PERMISSIONS.AI_ADMIN,
];
const CREATIVE_ALL = [PERMISSIONS.CREATIVE_READ, PERMISSIONS.CREATIVE_WRITE];

const READ_EVERYTHING = [
  PERMISSIONS.ORG_READ,
  PERMISSIONS.USER_READ,
  PERMISSIONS.ROLE_READ,
  PERMISSIONS.LEAD_READ,
  PERMISSIONS.SURVEY_READ,
  PERMISSIONS.QUOTATION_READ,
  PERMISSIONS.TENDER_READ,
  PERMISSIONS.CLIENT_READ,
  PERMISSIONS.CONTRACT_READ,
  PERMISSIONS.SLA_READ,
  PERMISSIONS.COMPLAINT_READ,
  PERMISSIONS.EMPLOYEE_READ,
  PERMISSIONS.ALLOCATION_READ,
  PERMISSIONS.MANPOWER_READ,
  PERMISSIONS.STATUTORY_READ,
  PERMISSIONS.ATTENDANCE_READ,
  PERMISSIONS.PAYROLL_READ,
  ...FINANCE_READ,
  ...MARKETING_READ,
  ...REPORTS_ALL,
  ...AI_ALL,
  ...CREATIVE_ALL,
  PERMISSIONS.AUDIT_READ,
  PERMISSIONS.BILLING_READ,
];

/**
 * Starter roles seeded for every new tenant, derived from the nine legacy roles
 * (docs/existing-role-permission-mapping.md §6).
 */
export const STARTER_ROLES: RoleDefinition[] = [
  {
    code: 'tenant_owner',
    name: 'Owner',
    description: 'Full control of the tenant. Cannot leave the tenant boundary.',
    permissions: '*',
  },
  {
    code: 'tenant_admin',
    name: 'Administrator',
    description: 'Configure the organisation, users and all business modules.',
    permissions: [
      ...READ_EVERYTHING,
      PERMISSIONS.ORG_WRITE,
      PERMISSIONS.USER_WRITE,
      PERMISSIONS.ROLE_WRITE,
      ...SALES,
      PERMISSIONS.QUOTATION_APPROVE,
      ...TENDERS,
      ...CLIENTS,
      ...HR_WRITE,
      PERMISSIONS.STATUTORY_WRITE,
      PERMISSIONS.PAYROLL_PREPARE,
      ...FINANCE_WRITE,
      PERMISSIONS.BRANDING_WRITE,
    ],
  },
  {
    code: 'viewer',
    name: 'Viewer (Management)',
    description: 'Read-only across the tenant, matching the legacy MANAGEMENT role.',
    permissions: READ_EVERYTHING,
  },
  {
    code: 'bd_manager',
    name: 'BD Manager',
    description: 'Sales and tenders oversight.',
    permissions: [...READ_EVERYTHING, ...SALES, ...TENDERS, ...CLIENTS, PERMISSIONS.QUOTATION_APPROVE],
  },
  {
    code: 'tender_desk',
    name: 'Tender Desk',
    description: 'Owns the tender pipeline end to end.',
    permissions: [
      PERMISSIONS.TENDER_READ_OWN,
      PERMISSIONS.TENDER_WRITE,
      PERMISSIONS.ORG_READ,
      PERMISSIONS.CLIENT_READ,
      PERMISSIONS.QUOTATION_READ,
    ],
  },
  {
    code: 'sales_executive',
    name: 'Sales Executive',
    description: 'Owns their own leads and follow-ups only.',
    permissions: [
      PERMISSIONS.LEAD_READ_OWN,
      PERMISSIONS.LEAD_WRITE,
      PERMISSIONS.SURVEY_READ,
      PERMISSIONS.QUOTATION_READ,
      PERMISSIONS.ORG_READ,
    ],
  },
  {
    code: 'operations',
    name: 'Operations Coordinator',
    description: 'Surveys, manpower deployment and site operations.',
    permissions: [
      ...READ_EVERYTHING,
      PERMISSIONS.SURVEY_WRITE,
      PERMISSIONS.LEAD_WRITE,
      PERMISSIONS.QUOTATION_WRITE,
      PERMISSIONS.COMPLAINT_WRITE,
    ],
  },
  {
    code: 'client_care',
    name: 'Client Care',
    description: 'Handles complaints, SLA tracking and customer feedback.',
    permissions: [
      PERMISSIONS.CLIENT_READ,
      PERMISSIONS.CONTRACT_READ,
      PERMISSIONS.SLA_READ,
      PERMISSIONS.COMPLAINT_READ,
      PERMISSIONS.COMPLAINT_WRITE,
      PERMISSIONS.ORG_READ,
    ],
  },
  {
    code: 'hr_manager',
    name: 'HR Manager',
    description: 'Owns the workforce: employees, deployment and payroll preparation.',
    // Note: employee:pii:read is deliberately NOT granted. Aadhaar/PAN/bank
    // values stay encrypted even for the HR role; masked hints are enough to
    // verify a record. Revealing a full value is a separate, audited grant.
    permissions: [
      ...HR_READ,
      ...HR_WRITE,
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_WRITE,
      PERMISSIONS.PAYROLL_READ,
      PERMISSIONS.PAYROLL_PREPARE,
      PERMISSIONS.ORG_READ,
      PERMISSIONS.CLIENT_READ,
      PERMISSIONS.CONTRACT_READ,
    ],
  },
  {
    code: 'payroll_approver',
    name: 'Payroll Approver',
    description: 'Reviews and approves payroll. Cannot prepare it (maker-checker).',
    permissions: [
      PERMISSIONS.PAYROLL_READ,
      PERMISSIONS.PAYROLL_APPROVE,
      PERMISSIONS.EMPLOYEE_READ,
      PERMISSIONS.STATUTORY_READ,
    ],
  },
  {
    code: 'finance_manager',
    name: 'Finance Manager',
    description: 'Owns receivables, payables and bank book. Can prepare but not self-approve over threshold.',
    permissions: [
      ...FINANCE_READ,
      PERMISSIONS.INVOICE_WRITE,
      PERMISSIONS.VENDOR_BILL_WRITE,
      PERMISSIONS.VENDOR_WRITE,
      PERMISSIONS.BANK_WRITE,
      PERMISSIONS.PURCHASE_ORDER_READ,
      PERMISSIONS.STOCK_READ,
      PERMISSIONS.ORG_READ,
      PERMISSIONS.CLIENT_READ,
    ],
  },
  {
    code: 'finance_approver',
    name: 'Finance Approver',
    description: 'Approves high-value receipts and vendor payments (Rule: >₹2L).',
    permissions: [
      ...FINANCE_READ,
      PERMISSIONS.FINANCE_APPROVE,
      PERMISSIONS.ORG_READ,
    ],
  },
  {
    code: 'store_manager',
    name: 'Store Manager',
    description: 'Owns assets, stock and purchase orders.',
    permissions: [
      PERMISSIONS.ASSET_READ,
      PERMISSIONS.ASSET_WRITE,
      PERMISSIONS.VENDOR_READ,
      PERMISSIONS.PURCHASE_ORDER_READ,
      PERMISSIONS.PURCHASE_ORDER_WRITE,
      PERMISSIONS.STOCK_READ,
      PERMISSIONS.STOCK_WRITE,
      PERMISSIONS.INDENT_READ,
      PERMISSIONS.INDENT_WRITE,
      PERMISSIONS.ORG_READ,
    ],
  },
  {
    code: 'marketing_manager',
    name: 'Marketing Manager',
    description: 'Owns contacts, lists, campaigns, templates and social publishing (with approval gate).',
    permissions: [
      ...MARKETING_READ,
      ...MARKETING_WRITE,
      PERMISSIONS.REPORT_READ,
      PERMISSIONS.ORG_READ,
      PERMISSIONS.CLIENT_READ,
    ],
  },
  {
    code: 'marketing_approver',
    name: 'Marketing Approver',
    description: 'Approves campaigns and social posts before they can be sent/published (Rule 19).',
    permissions: [...MARKETING_READ, PERMISSIONS.MARKETING_CAMPAIGN_APPROVE, PERMISSIONS.SOCIAL_APPROVE, PERMISSIONS.ORG_READ],
  },
  {
    code: 'report_viewer',
    name: 'Report Viewer',
    description: 'Exec dashboards, daily reports, MOM and report snapshots.',
    permissions: [...REPORTS_ALL, ...FINANCE_READ, PERMISSIONS.ORG_READ],
  },
  {
    code: 'ai_operator',
    name: 'AI Operator',
    description: 'Uses the AI assistant; can propose tool calls but not approve high-risk ones.',
    permissions: [...AI_ALL.filter(p => p !== PERMISSIONS.AI_ADMIN), PERMISSIONS.ORG_READ, PERMISSIONS.LEAD_READ, PERMISSIONS.TENDER_READ],
  },
  {
    code: 'creative_designer',
    name: 'Creative Designer',
    description: 'Creative studio projects, assets and templates.',
    permissions: [...CREATIVE_ALL, ...MARKETING_READ, PERMISSIONS.ORG_READ],
  },
];

/** Expand a role definition into a concrete code list. */
export function permissionsForRole(role: RoleDefinition): PermissionCode[] {
  return role.permissions === '*' ? ALL_PERMISSIONS : role.permissions;
}

/**
 * Startup assertion: every route must declare a permission.
 * Called from AppModule bootstrap so a missing decorator cannot ship.
 */
export function assertCatalogueCoverage(declared: string[]): void {
  const known = new Set<string>(ALL_PERMISSIONS);
  const unknown = declared.filter((p) => !known.has(p));
  if (unknown.length) {
    throw new Error(
      `Unknown permission code(s) declared on routes: ${unknown.join(', ')}. ` +
      `Add them to PERMISSIONS in apps/api/src/permissions/catalogue.ts.`,
    );
  }
}
