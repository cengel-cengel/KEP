import type { pricing_rules } from '../../generated/prisma';

export type RuleType =
  | 'CUSTOMER_TARIFF'
  | 'PARTNER_NACHLAUF'
  | 'SUB_VORLAUF'
  | 'SUB_HAUPTLAUF'
  | 'CHARTER'
  | 'OWN_NV';

export type PriceBasisInput = {
  weightKg: number;
  ldm: number;
  cbm: number;
  packageCount: number;
  stopCount?: number;
  distanceKm?: number;
  isAdr?: boolean;
  isTimeslot?: boolean;
  isB2c?: boolean;
  originZip?: string;
  destZip?: string;
};

export type PriceBreakdown = {
  baseAmount: number;
  fuelExtra: number;
  adrExtra: number;
  timeExtra: number;
  b2cExtra: number;
  minApplied: number;
  maxApplied: number | null;
  ruleAmountRaw?: number;
  tierOrZone?: unknown;
};

export type PriceResult = {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  chargeableWeight: number;
  fpgMethod: string;
  baseAmount: number;
  surcharges: {
    fuel: number;
    adr: number;
    timeslot: number;
    b2c: number;
  };
  totalAmount: number;
  breakdown: PriceBreakdown;
};

export type PricingRule = pricing_rules;

