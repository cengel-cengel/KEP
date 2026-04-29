export interface CockpitKpis {
  shipmentsToday: number;
  shipmentsPendingDispatch: number;
  criticalTours: number;
  toursToday: number;
  mtd: {
    revenue: number;
    contributionMargin: number;
    cmPercent: number;
    revenueGrowthVsLastMonth: number;
  };
  returnQuotePct: number;
  openNvDispositionsCount: number;
  openDamageReportsCount: number;
  mtdReturnCostsEur: number;
}

export interface OpenTask {
  type: string;
  severity: string;
  message: string;
  entityId?: string;
}
