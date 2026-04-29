export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function num(v: unknown, fallback = 0): number {
  if (v == null) return fallback;
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export function applyFuelSurcharge(cost: number, pct: unknown): number {
  const p = num(pct, 0);
  return roundMoney(cost * (1 + p / 100));
}
