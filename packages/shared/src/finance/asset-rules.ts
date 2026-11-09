/**
 * Asset / Inventory domain rules — port of Assets.gs (v4.0.0-admin-erp)
 * Legacy: Assets.gs:37-2711
 */

export const ASSET_STATUSES = ['AVAILABLE', 'ASSIGNED', 'RETURNED', 'RETIRED', 'LOST'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_CATEGORIES = [
  'EQUIPMENT',
  'VEHICLE',
  'FURNITURE',
  'IT_ASSET',
  'UNIFORM',
  'TOOL',
  'SAFETY_GEAR',
  'OTHER',
] as const;
export type AssetCategory = string; // legacy allows custom

export const STOCK_CATEGORIES = ['CONSUMABLE', 'UNIFORM', 'SAFETY', 'CLEANING', 'STATIONERY', 'SPARE', 'OTHER'] as const;

export function isValidAssetStatus(s: string): boolean {
  return (ASSET_STATUSES as readonly string[]).includes(String(s).toUpperCase());
}

export function assertAssetStatus(s: string): AssetStatus {
  const u = String(s).toUpperCase() as AssetStatus;
  if (!isValidAssetStatus(u)) throw new Error('Invalid asset status.');
  return u;
}

// Stock balance helpers — stored model (chosen for Phase 6: user selected "stored")
// We keep the computed helper for parity tests though.

export interface StockMovement {
  itemId: string;
  quantity: number; // +in / -out
}

export function computeBalancesFromMovements(
  purchases: Array<{ itemId: string; qty: number }>,
  distributions: Array<{ itemId: string; qty: number }>,
): Map<string, { in: number; out: number; balance: number }> {
  const m = new Map<string, { in: number; out: number; balance: number }>();
  for (const p of purchases) {
    const e = m.get(p.itemId) ?? { in: 0, out: 0, balance: 0 };
    e.in += p.qty; e.balance += p.qty; m.set(p.itemId, e);
  }
  for (const d of distributions) {
    const e = m.get(d.itemId) ?? { in: 0, out: 0, balance: 0 };
    e.out += d.qty; e.balance -= d.qty; m.set(d.itemId, e);
  }
  return m;
}

export function stockAvailable(balance: number, requiredQty: number): boolean {
  return balance >= requiredQty;
}

export function nextAssetCode(prefix = 'AST', year = new Date().getFullYear(), seq: number, pad = 4): string {
  return `${prefix}-${year}-${String(seq).padStart(pad, '0')}`;
}

export function nextChallanNumber(prefix = 'CHN', seq: number): string {
  return `${prefix}-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
}
