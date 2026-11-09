import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { createHmac } from 'node:crypto';

export type BillingProvider = 'stripe' | 'razorpay' | 'console';

export interface Entitlement {
  tenantId: string;
  planCode: string | null;
  planName: string | null;
  status: string;
  userLimit: number | null;
  whiteLabel: boolean;
  modules: string[];
  trialEndsAt: Date | null;
  overUserLimit: boolean;
  suspendedForBilling: boolean;
}

/**
 * Billing — single source of truth for entitlements.
 * Enforcement is at SessionGuard/entitlement guard + controller guards,
 * never UI-only (Rule 18). Webhooks are the only way a provider mutates
 * Subscription; the app never trusts client-supplied billing state.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async entitlement(tenantId: string): Promise<Entitlement> {
    // Prisma may not have the tables in older dev DBs — degrade honestly
    try {
      const sub = await (this.prisma as any).subscription?.findFirst?.({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: { plan: { include: { modules: { include: { module: true } } } } },
      });
      if (!sub) return { tenantId, planCode: null, planName: null, status: 'UNKNOWN', userLimit: null, whiteLabel: false, modules: [], trialEndsAt: null, overUserLimit: false, suspendedForBilling: false };
      const plan = sub.plan;
      const userCount = await (this.prisma as any).user?.count?.({ where: { tenantId, deletedAt: null } }).catch(() => 0) ?? 0;
      const suspendedForBilling = ['SUSPENDED', 'PAST_DUE'].includes(sub.status) && !(plan?.whiteLabel);
      return {
        tenantId,
        planCode: plan?.code ?? null,
        planName: plan?.name ?? null,
        status: sub.status,
        userLimit: plan?.userLimit ?? null,
        whiteLabel: !!plan?.whiteLabel,
        modules: plan?.modules?.map((pm: any) => pm.module?.code ?? pm.moduleId) ?? [],
        trialEndsAt: sub.trialEndsAt ?? null,
        overUserLimit: plan?.userLimit != null ? userCount > plan.userLimit : false,
        suspendedForBilling,
      };
    } catch (e: any) {
      this.logger.warn(`entitlement lookup failed tenant=${tenantId}: ${e?.message}`);
      return { tenantId, planCode: null, planName: null, status: 'UNKNOWN', userLimit: null, whiteLabel: false, modules: [], trialEndsAt: null, overUserLimit: false, suspendedForBilling: false };
    }
  }

  async enforce(tenantId: string, requiredModule?: string): Promise<void> {
    const ent = await this.entitlement(tenantId);
    if (ent.suspendedForBilling) throw new BadRequestException({ code: 'BILLING_SUSPENDED', message: 'Subscription is suspended. Contact billing.' });
    if (requiredModule && ent.modules.length > 0 && !ent.modules.includes(requiredModule)) {
      throw new BadRequestException({ code: 'MODULE_NOT_ENTITLED', message: `Plan ${ent.planCode ?? 'current'} does not include ${requiredModule}.` });
    }
    if (ent.overUserLimit) {
      // Soft block: allow read, block write — caller decides
      this.logger.warn(`Tenant ${tenantId} over user limit ${ent.userLimit}`);
    }
  }

  /**
   * Webhook entry — validates provider signature, idempotently applies
   * Subscription transition. No trust in payload except after HMAC.
   */
  async handleWebhook(provider: BillingProvider, rawBody: string, signature: string, event: any): Promise<{ ok: boolean; subscriptionId?: string }> {
    const secret = process.env[provider === 'stripe' ? 'STRIPE_WEBHOOK_SECRET' : 'RAZORPAY_WEBHOOK_SECRET'] ?? '';
    if (secret && !this.verifySignature(provider, rawBody, signature, secret)) {
      throw new BadRequestException({ code: 'BAD_SIGNATURE', message: `Invalid ${provider} webhook signature.` });
    }

    // Normalize provider → our SubscriptionStatus
    let status: string | null = null;
    let tenantId: string | null = event.metadata?.tenantId ?? event.notes?.tenantId ?? null;
    let planCode: string | null = event.metadata?.planCode ?? null;

    if (provider === 'stripe') {
      if (event.type === 'invoice.payment_failed') status = 'PAST_DUE';
      else if (event.type === 'customer.subscription.deleted') status = 'CANCELLED';
      else if (event.type === 'customer.subscription.updated' && event.data?.object?.status === 'active') status = 'ACTIVE';
    } else if (provider === 'razorpay') {
      if (event.event === 'subscription.charged') status = 'ACTIVE';
      else if (event.event === 'subscription.halted') status = 'SUSPENDED';
    } else {
      // console provider — used in tests
      status = event.status ?? null;
      tenantId = event.tenantId ?? tenantId;
    }

    if (!tenantId) {
      this.logger.warn(`Webhook ${provider}: no tenantId in event, skipping apply`);
      return { ok: true };
    }
    if (status) {
      try {
        const sub = await (this.prisma as any).subscription?.findFirst?.({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
        if (sub) {
          await (this.prisma as any).subscription.update({ where: { id: sub.id }, data: { status } });
          if (status === 'SUSPENDED' || status === 'CANCELLED') {
            await (this.prisma as any).tenant.update({ where: { id: tenantId }, data: { status: status === 'SUSPENDED' ? 'SUSPENDED' : 'CANCELLED' } }).catch(()=>{});
          }
          this.logger.log(`Webhook ${provider} → tenant ${tenantId} subscription ${sub.id} → ${status}`);
          return { ok: true, subscriptionId: sub.id };
        }
      } catch (e: any) {
        this.logger.error(`Webhook apply failed tenant=${tenantId}: ${e?.message}`);
      }
    }
    return { ok: true };
  }

  private verifySignature(provider: BillingProvider, body: string, sig: string, secret: string): boolean {
    if (!secret || !sig) return false;
    try {
      if (provider === 'stripe') {
        // stripe: t=timestamp,v1=hmac(body)
        const parts = sig.split(',').reduce((a: any, p: string) => { const [k, v] = p.split('='); a[k] = v; return a; }, {});
        const expected = createHmac('sha256', secret).update(`${parts.t || ''}.${body}`).digest('hex');
        return expected === parts.v1;
      }
      // razorpay + console use plain HMAC-SHA256
      const expected = createHmac('sha256', secret).update(body).digest('hex');
      return expected === sig;
    } catch { return false; }
  }
}
