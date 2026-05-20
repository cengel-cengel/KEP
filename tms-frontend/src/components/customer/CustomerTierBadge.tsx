/**
 * M-1.1: CustomerTierBadge — Dot + Letter Badge für Customer-Tier.
 *
 * Usage:
 *   <CustomerTierBadge tier={customer.priority_tier} />
 *   <CustomerTierBadge tier={…} compact />   // nur Dot, kein Letter
 */
import { tierMeta } from '../../lib/customerTier';

export default function CustomerTierBadge({
  tier,
  compact = false,
}: {
  tier: string | null | undefined;
  compact?: boolean;
}) {
  const meta = tierMeta(tier);
  return (
    <span
      className={`inline-flex items-center gap-1 ${compact ? 'text-[10px]' : 'text-xs'} ${meta.textClass}`}
      title={`Tier: ${meta.label}`}
    >
      <span
        className={`inline-block rounded-full ${meta.dotClass} ${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'}`}
        aria-hidden
      />
      {!compact && <span className="font-mono">{meta.letter}</span>}
    </span>
  );
}
