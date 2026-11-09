import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  LEGACY_STATUTORY_DEFAULTS, LEGACY_KA_PT_SLABS, setInForceOn,
} from '@ufms/shared/hr/employee-rules';
import type { StatutoryConfig, PtSlabRule } from '@ufms/shared/hr/employee-rules';

/**
 * Resolves the statutory configuration that governs a pay period.
 *
 * Rule 15 forbids permanently hardcoded statutory rates. The legacy app baked
 * PF 12%, ESI 0.75/3.25%, the ₹25,000 PF cap and the ₹21,000 ESI ceiling into
 * module constants (HR.gs:48-52), so every tenant was on whatever the vendor
 * last deployed.
 *
 * Here every figure comes from a StatutoryRateSet. The set must be CONFIRMED
 * to be used for payroll — a PROVISIONAL set is a draft and must not silently
 * determine what people are paid. If no confirmed set covers the date, payroll
 * refuses to compute rather than falling back to the legacy constants; the
 * LEGACY_STATUTORY_DEFAULTS are returned only so the UI can show what the
 * fallback would have been.
 */

export interface ResolvedStatutory {
  config: StatutoryConfig;
  ptSlabs: PtSlabRule[];
  /** CONFIRMED set used for the calculation, or null when none covers the date. */
  rateSet: { id: string; code: string; name: string; jurisdiction: string; effectiveFrom: Date } | null;
  source: 'RATE_SET' | 'LEGACY_DEFAULTS';
  /** Reasons the caller cannot treat `config` as authoritative. */
  problems: string[];
}

type Tx = Prisma.TransactionClient;

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Load the rate set in force on `asOn` for a jurisdiction.
 *
 * Tenant-scoped sets win over platform defaults (tenantId = null), which is how
 * a customer with a state-specific PT schedule overrides the central one.
 */
export async function resolveStatutory(
  tx: Tx,
  opts: { jurisdiction?: string; asOn: string; requireConfirmed?: boolean },
): Promise<ResolvedStatutory> {
  const jurisdiction = opts.jurisdiction ?? 'CENTRAL';
  const requireConfirmed = opts.requireConfirmed !== false;

  const sets = await tx.statutoryRateSet.findMany({
    where: { jurisdiction },
    include: { rates: true, slabs: { orderBy: { fromGross: 'asc' } } },
    orderBy: { effectiveFrom: 'desc' },
  });

  // A tenant-owned set shadows a platform default *only where it actually
  // applies*. Ignoring platform defaults entirely whenever a tenant had ever
  // created one would leave a period with no rates at all.
  const range = (s: any) => ({ ...s, effectiveFrom: s.effectiveFrom, effectiveTo: s.effectiveTo });
  const inForceTenant = setInForceOn(sets.filter((s) => s.tenantId !== null).map(range), opts.asOn);
  const inForcePlatform = setInForceOn(sets.filter((s) => s.tenantId === null).map(range), opts.asOn);
  const inForce = inForceTenant ?? inForcePlatform;

  if (!inForce) {
    return {
      config: LEGACY_STATUTORY_DEFAULTS,
      ptSlabs: LEGACY_KA_PT_SLABS,
      rateSet: null,
      source: 'LEGACY_DEFAULTS',
      problems: [
        `No statutory rate set covers ${opts.asOn} for jurisdiction ${jurisdiction}.`,
      ],
    };
  }

  const problems: string[] = [];
  if (requireConfirmed && inForce.status !== 'CONFIRMED') {
    problems.push(
      `Rate set ${inForce.code} is ${inForce.status}. Only a CONFIRMED set may drive payroll.`,
    );
  }

  const byCode = new Map(inForce.rates.map((r) => [r.code, Number(r.value)]));
  const config: StatutoryConfig = {
    pfWageCap: num(byCode.get('PF_WAGE_CAP'), LEGACY_STATUTORY_DEFAULTS.pfWageCap),
    pfEmployeePct: num(byCode.get('PF_EE_PCT'), LEGACY_STATUTORY_DEFAULTS.pfEmployeePct),
    pfEmployerPct: num(byCode.get('PF_ER_PCT'), LEGACY_STATUTORY_DEFAULTS.pfEmployerPct),
    esiGrossCeiling: num(byCode.get('ESI_GROSS_CEILING'), LEGACY_STATUTORY_DEFAULTS.esiGrossCeiling),
    esiEmployeePct: num(byCode.get('ESI_EE_PCT'), LEGACY_STATUTORY_DEFAULTS.esiEmployeePct),
    esiEmployerPct: num(byCode.get('ESI_ER_PCT'), LEGACY_STATUTORY_DEFAULTS.esiEmployerPct),
  };

  const ptSlabs: PtSlabRule[] = inForce.slabs.length
    ? inForce.slabs.map((s) => ({
      fromGross: Number(s.fromGross),
      toGross: Number(s.toGross),
      amount: Number(s.amount),
      overrideMonth: s.overrideMonth ?? null,
      overrideAmount: s.overrideAmount == null ? null : Number(s.overrideAmount),
    }))
    : LEGACY_KA_PT_SLABS;

  if (!inForce.rates.length) {
    problems.push(`Rate set ${inForce.code} carries no rate lines; legacy defaults were used for the gaps.`);
  }

  return {
    config,
    ptSlabs,
    rateSet: {
      id: inForce.id,
      code: inForce.code,
      name: inForce.name,
      jurisdiction: inForce.jurisdiction,
      effectiveFrom: inForce.effectiveFrom,
    },
    source: 'RATE_SET',
    problems,
  };
}

/** Rate codes the payroll engine understands, exposed for the settings screen. */
export const REQUIRED_RATE_CODES = [
  'PF_WAGE_CAP', 'PF_EE_PCT', 'PF_ER_PCT',
  'ESI_GROSS_CEILING', 'ESI_EE_PCT', 'ESI_ER_PCT',
];

@Injectable()
export class StatutoryConfigService {}
