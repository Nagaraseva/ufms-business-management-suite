import { describe, it, expect } from 'vitest';
import {
  canTransitionCampaign, canTransitionSocialPost, canTransitionCreative, canTransitionAiTool,
  isValidEmail, normalizeEmail, dedupeEmails, canAutoPublish, isHighRiskTool, isOverdueAction,
} from '@ufms/shared/marketing/marketing-rules';

describe('Phase 7 parity — marketing state machines match legacy EmailMarketing.gs / SocialMedia.gs', () => {
  it('campaign transitions enforce approval gate (Rule 19)', () => {
    expect(canTransitionCampaign('DRAFT','PENDING_APPROVAL')).toBe(true);
    expect(canTransitionCampaign('PENDING_APPROVAL','APPROVED')).toBe(true);
    expect(canTransitionCampaign('DRAFT','APPROVED')).toBe(false); // must go via PENDING_APPROVAL
    expect(canTransitionCampaign('SENT','DRAFT')).toBe(false);
    expect(canTransitionCampaign('SENT','SENT')).toBe(false);
  });
  it('social post transitions mirror EmailMarketing + SocialMedia.gs', () => {
    expect(canTransitionSocialPost('DRAFT','PENDING_APPROVAL')).toBe(true);
    expect(canTransitionSocialPost('DRAFT','SCHEDULED')).toBe(true);
    expect(canTransitionSocialPost('PUBLISHED','DRAFT')).toBe(false);
    expect(canTransitionSocialPost('SCHEDULED','PUBLISHED')).toBe(true);
  });
  it('creative transitions mirror CreativeStudio.gs', () => {
    expect(canTransitionCreative('DRAFT','IN_REVIEW')).toBe(true);
    expect(canTransitionCreative('DRAFT','PUBLISHED')).toBe(false);
    expect(canTransitionCreative('APPROVED','PUBLISHED')).toBe(true);
  });
  it('AI tool transitions enforce Rule 19', () => {
    expect(canTransitionAiTool('PENDING_APPROVAL','APPROVED')).toBe(true);
    expect(canTransitionAiTool('PENDING_APPROVAL','REJECTED')).toBe(true);
    expect(canTransitionAiTool('APPROVED','EXECUTED')).toBe(true);
    expect(canTransitionAiTool('EXECUTED','APPROVED')).toBe(false);
  });
});

describe('Email helpers — EmailDirectory.gs dedup / normalization', () => {
  it('normalizeEmail lowercases and trims', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
  it('isValidEmail rejects malformed', () => {
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('good@example.com')).toBe(true);
    expect(isValidEmail('')).toBe(false);
  });
  it('dedupeEmails lowercases, validates and dedupes', () => {
    expect(dedupeEmails(['A@b.com','a@B.com','bad','A@b.com'])).toEqual(['a@b.com']);
  });
});

describe('Rule 20 — auto-publish only where allowed', () => {
  it('LINKEDIN allows auto-publish', () => expect(canAutoPublish('LINKEDIN')).toBe(true));
  it('FACEBOOK does not', () => expect(canAutoPublish('FACEBOOK')).toBe(false));
  it('INSTAGRAM does not', () => expect(canAutoPublish('INSTAGRAM')).toBe(false));
});

describe('AI tool registry — CrmAssistant.gs parity', () => {
  it('send_email is high-risk', () => expect(isHighRiskTool('send_email')).toBe(true));
  it('schedule_social_post is high-risk', () => expect(isHighRiskTool('schedule_social_post')).toBe(true));
  it('search_leads is not', () => expect(isHighRiskTool('search_leads')).toBe(false));
  it('unknown tool defaults to high-risk (fail-closed)', () => expect(isHighRiskTool('unknown_tool')).toBe(true));
});

describe('MOM overdue — Moms.gs', () => {
  it('is overdue when dueDate < today and status not DONE/CANCELLED', () => {
    expect(isOverdueAction('2026-01-01','OPEN','2026-06-01')).toBe(true);
    expect(isOverdueAction('2026-01-01','DONE','2026-06-01')).toBe(false);
    expect(isOverdueAction(null,'OPEN','2026-06-01')).toBe(false);
  });
});
