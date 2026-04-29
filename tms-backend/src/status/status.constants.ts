/** Sperrtypen (DB lock_type) */
export const LOCK_TYPES = [
  'ZOLL',
  'ADR',
  'ADRESSFEHLER',
  'KLAERFALL',
  'AVIS',
  'VORKASSE',
  'BESCHAEDIGUNG',
  'FEHLMENGE',
  'TEILAUFTRAG',
  'SONSTIGES',
] as const;

export type LockType = (typeof LOCK_TYPES)[number];

/** Blockiert Tour-Freigabe */
export const RELEASE_BLOCKING_LOCK_TYPES: LockType[] = ['ADR', 'ZOLL'];

export const STATUS_EVENT_TYPES = [
  'ERFASST',
  'EINGELAGERT',
  'DISPONIERT',
  'VERLADEN',
  'ABGEFERTIGT',
  'UNTERWEGS',
  'ZUGESTELLT',
  'ZUSTELLHINDERNIS',
  'RETOURE',
  'BESCHAEDIGT',
  'KLAERFALL',
  'SPERRE_GESETZT',
  'SPERRE_AUFGEHOBEN',
  'AVISIERT',
] as const;
