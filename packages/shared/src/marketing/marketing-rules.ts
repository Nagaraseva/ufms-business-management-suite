/**
 * Marketing & Reports & AI & Creative domain rules — Phase 7
 * Legacy refs: EmailMarketing.gs, EmailDirectory.gs, SocialMedia.gs,
 *   Reports.gs, DailyReports.gs, Moms.gs, CrmAssistant.gs, CreativeStudio.gs
 *
 * Rules enforced here (never in the browser):
 * - Campaign sending requires approval (Rule 19)
 * - Marketing uses official APIs / OAuth scopes only (Rule 20)
 * - No hardcoded credentials (Rule 3)
 * - AI never sends emails or takes financial actions without approval (Rule 19)
 */

// ---------------------------------------------------------------------------
// MARKETING — Contact & Campaign state machines
// ---------------------------------------------------------------------------

export const CONTACT_STATUSES = ['ACTIVE', 'UNSUBSCRIBED', 'BOUNCED', 'INVALID'] as const;
export const CONTACT_SOURCES = ['MANUAL', 'IMPORT', 'LEAD_CONVERSION', 'FORM', 'API'] as const;
export const LIST_TYPES = ['STATIC', 'DYNAMIC'] as const;
export const CAMPAIGN_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED'] as const;
export const CAMPAIGN_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const;
export const SEND_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED'] as const;

export function canTransitionCampaign(from: string, to: string): boolean {
  const graph: Record<string, string[]> = {
    DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
    PENDING_APPROVAL: ['APPROVED', 'CANCELLED', 'DRAFT'],
    APPROVED: ['SCHEDULED', 'SENDING', 'CANCELLED'],
    SCHEDULED: ['SENDING', 'CANCELLED'],
    SENDING: ['SENT', 'CANCELLED'],
    SENT: [],
    CANCELLED: [],
  };
  return (graph[from] ?? []).includes(to);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function dedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const n = normalizeEmail(e);
    if (!isValidEmail(n)) continue;
    if (!seen.has(n)) { seen.add(n); out.push(n); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// SOCIAL — Post state machine
// ---------------------------------------------------------------------------

export const SOCIAL_PLATFORMS = ['LINKEDIN', 'FACEBOOK', 'INSTAGRAM', 'TWITTER', 'YOUTUBE', 'GOOGLE_BUSINESS'] as const;
export const SOCIAL_POST_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'CANCELLED'] as const;

export function canTransitionSocialPost(from: string, to: string): boolean {
  const graph: Record<string, string[]> = {
    DRAFT: ['PENDING_APPROVAL', 'SCHEDULED', 'CANCELLED'],
    PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
    APPROVED: ['SCHEDULED', 'PUBLISHED', 'CANCELLED'],
    SCHEDULED: ['PUBLISHED', 'FAILED', 'CANCELLED'],
    PUBLISHED: [],
    FAILED: ['SCHEDULED', 'CANCELLED'],
    CANCELLED: [],
  };
  return (graph[from] ?? []).includes(to);
}

export function canAutoPublish(platform: string): boolean {
  // Rule 20: do not promise auto-publish where platform forbids it.
  // Currently only LinkedIn Company Page via official API supports it.
  // All others require manual or approved-scheduler path.
  const autoPublishAllowed = new Set(['LINKEDIN']);
  return autoPublishAllowed.has(platform);
}

// ---------------------------------------------------------------------------
// REPORTS — Daily report & MOM
// ---------------------------------------------------------------------------

export const REPORT_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'ON_DEMAND'] as const;
export const MOM_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const MOM_ACTION_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'OVERDUE', 'CANCELLED'] as const;

export function isOverdueAction(dueDate: string | null, status: string, today = new Date().toISOString().slice(0, 10)): boolean {
  if (!dueDate) return false;
  if (['DONE', 'CANCELLED'].includes(status)) return false;
  return dueDate < today;
}

// ---------------------------------------------------------------------------
// AI ASSISTANT — Conversation & tool-call approval
// ---------------------------------------------------------------------------

export const AI_ROLES = ['USER', 'ASSISTANT', 'SYSTEM', 'TOOL'] as const;
export const AI_TOOL_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED'] as const;
export const AI_PROVIDERS = ['OPENAI', 'GROQ', 'GEMINI', 'DEEPSEEK', 'OPENROUTER', 'ZAI', 'ANTHROPIC'] as const;

// Tools the AI may propose. Anything that sends email, posts to social,
// or moves money is high-risk and requires explicit approval (Rule 19).
export const AI_TOOL_DEFINITIONS: Array<{ name: string; highRisk: boolean; description: string }> = [
  { name: 'search_leads', highRisk: false, description: 'Search leads by filters' },
  { name: 'search_tenders', highRisk: false, description: 'Search tenders by filters' },
  { name: 'get_client_summary', highRisk: false, description: 'Get client & contract summary' },
  { name: 'get_employee_summary', highRisk: false, description: 'Get employee & allocation summary' },
  { name: 'get_finance_summary', highRisk: false, description: 'Get finance overview (no PII)' },
  { name: 'draft_email', highRisk: true, description: 'Draft an email (requires approval before sending)' },
  { name: 'send_email', highRisk: true, description: 'Send an email (requires approval)' },
  { name: 'create_campaign', highRisk: true, description: 'Create a marketing campaign (requires approval)' },
  { name: 'schedule_social_post', highRisk: true, description: 'Schedule a social post (requires approval)' },
  { name: 'create_lead', highRisk: false, description: 'Create a new lead' },
  { name: 'create_tender_followup', highRisk: false, description: 'Add a tender follow-up' },
  { name: 'generate_report', highRisk: false, description: 'Generate a report snapshot' },
];

export function isHighRiskTool(name: string): boolean {
  return AI_TOOL_DEFINITIONS.find(t => t.name === name)?.highRisk ?? true;
}

export function canTransitionAiTool(from: string, to: string): boolean {
  const graph: Record<string, string[]> = {
    PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
    APPROVED: ['EXECUTED', 'FAILED'],
    REJECTED: [],
    EXECUTED: [],
    FAILED: ['PENDING_APPROVAL'],
  };
  return (graph[from] ?? []).includes(to);
}

// ---------------------------------------------------------------------------
// CREATIVE STUDIO — Project & template types
// ---------------------------------------------------------------------------

export const CREATIVE_TYPES = ['PRESENTATION', 'PROPOSAL', 'BROCHURE', 'SOCIAL_POST', 'LOGO', 'BANNER', 'OTHER'] as const;
export const CREATIVE_STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED'] as const;
export const TEMPLATE_CATEGORIES = ['EMAIL', 'SOCIAL', 'PRESENTATION', 'PROPOSAL', 'MOM', 'REPORT'] as const;

export function canTransitionCreative(from: string, to: string): boolean {
  const graph: Record<string, string[]> = {
    DRAFT: ['IN_REVIEW', 'ARCHIVED'],
    IN_REVIEW: ['APPROVED', 'DRAFT', 'ARCHIVED'],
    APPROVED: ['PUBLISHED', 'ARCHIVED'],
    PUBLISHED: ['ARCHIVED'],
    ARCHIVED: [],
  };
  return (graph[from] ?? []).includes(to);
}
