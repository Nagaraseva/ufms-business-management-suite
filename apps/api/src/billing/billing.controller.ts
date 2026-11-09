import { Body, Controller, Get, Headers, Post, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser, AuthUser, RequirePermission, Public } from '../common/decorators';
import { PERMISSIONS } from '../permissions/catalogue';
import { BillingService, BillingProvider } from './billing.service';
import type { Request } from 'express';

@ApiTags('Billing')
@Controller('api/v1/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('entitlement')
  @ApiOperation({ summary: 'Current tenant entitlement (plan, limits, modules)' })
  @RequirePermission(PERMISSIONS.ORG_READ)
  async entitlement(@CurrentUser() user: AuthUser) {
    return this.billing.entitlement(user.tenantId);
  }

  @Get('entitlement/check')
  @ApiOperation({ summary: 'Check if tenant may use a module (enforce plan gating)' })
  @RequirePermission(PERMISSIONS.ORG_READ)
  async check(@CurrentUser() user: AuthUser) {
    // Exposes same data as entitlement but via enforce path (logs billing blocks)
    const ent = await this.billing.entitlement(user.tenantId);
    return { allowed: !ent.suspendedForBilling, ...ent };
  }

  @Public()
  @Post('webhook/:provider')
  @ApiOperation({ summary: 'Provider webhook (Stripe/Razorpay/console) — HMAC verified, idempotent' })
  async webhook(@Req() req: Request, @Headers('x-webhook-signature') sig: string, @Headers('stripe-signature') stripeSig: string) {
    const provider = (req.params as any).provider as BillingProvider;
    if (!['stripe', 'razorpay', 'console'].includes(provider)) throw new BadRequestException('Unknown provider');
    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body ?? {});
    const signature = provider === 'stripe' ? (stripeSig ?? sig ?? '') : (sig ?? '');
    let event: any = req.body;
    try { if (typeof rawBody === 'string') event = JSON.parse(rawBody); } catch {}
    return this.billing.handleWebhook(provider, typeof rawBody === 'string' ? rawBody : JSON.stringify(event), signature, event);
  }
}
