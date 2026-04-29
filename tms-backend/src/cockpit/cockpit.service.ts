// ============================================================
// TMS – Cockpit Service (Live DB-Dashboard)
// src/cockpit/cockpit.service.ts
// ============================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CockpitService {
  constructor(private prisma: PrismaService) {}

  // ── Haupt-KPIs für heute / diesen Monat ─────────────────
  async getDashboardKpis() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfLastMonth = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    const [
      shipmentsToday,
      shipmentsPendingDispatch,
      mtdRevenue,
      mtdCm,
      lastMonthRevenue,
      toursToday,
      criticalTours,
    ] = await Promise.all([
      this.prisma.shipments.count({
        where: {
          deleted_at: null,
          created_at: { gte: new Date(today.setHours(0, 0, 0, 0)) },
        },
      }),

      this.prisma.shipments.count({
        where: {
          deleted_at: null,
          tour_id: null,
          status: 'new',
        },
      }),

      this.prisma.shipments.aggregate({
        where: {
          deleted_at: null,
          status: { notIn: ['cancelled'] },
          created_at: { gte: startOfMonth },
        },
        _sum: { freight_revenue: true },
      }),

      this.prisma.shipments.aggregate({
        where: {
          deleted_at: null,
          status: { notIn: ['cancelled'] },
          created_at: { gte: startOfMonth },
        },
        _sum: { contribution_margin: true, freight_revenue: true },
      }),

      this.prisma.shipments.aggregate({
        where: {
          deleted_at: null,
          status: { notIn: ['cancelled'] },
          created_at: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
        _sum: { freight_revenue: true },
      }),

      this.prisma.tours.count({
        where: { tour_date: new Date(today), status: { notIn: ['cancelled'] } },
      }),

      this.prisma.tours.count({
        where: {
          status: { in: ['planned', 'dispatched'] },
          OR: [{ subcontractor_id: null }, { cm_percent: { lt: 0 } }],
        },
      }),
    ]);

    const mtdRevenueValue = Number(mtdRevenue._sum.freight_revenue ?? 0);
    const mtdCmValue = Number(mtdCm._sum.contribution_margin ?? 0);
    const mtdCmPercent =
      mtdRevenueValue > 0
        ? Math.round((mtdCmValue / mtdRevenueValue) * 10000) / 100
        : 0;

    const lastMonthRevenueValue = Number(
      lastMonthRevenue._sum.freight_revenue ?? 0,
    );
    const revenueGrowth =
      lastMonthRevenueValue > 0
        ? Math.round(
            ((mtdRevenueValue - lastMonthRevenueValue) /
              lastMonthRevenueValue) *
              10000,
          ) / 100
        : 0;

    const [
      mtdShipmentsTotal,
      mtdReturnedShipments,
      openNvDispositionsCount,
      openDamageReportsCount,
      mtdReturnCostsAgg,
    ] = await Promise.all([
      this.prisma.shipments.count({
        where: {
          deleted_at: null,
          status: { notIn: ['cancelled'] },
          created_at: { gte: startOfMonth },
        },
      }),
      this.prisma.shipments.count({
        where: {
          deleted_at: null,
          status: 'returned',
          created_at: { gte: startOfMonth },
        },
      }),
      this.prisma.nv_dispositions.count({ where: { status: 'open' } }),
      this.prisma.damage_reports.count({ where: { status: 'open' } }),
      this.prisma.returns.aggregate({
        where: { created_at: { gte: startOfMonth } },
        _sum: { return_cost_eur: true },
      }),
    ]);

    const mtdReturnQuotePct =
      mtdShipmentsTotal > 0
        ? Math.round((mtdReturnedShipments / mtdShipmentsTotal) * 10000) / 100
        : 0;

    const mtdReturnCostsEur = Number(mtdReturnCostsAgg._sum.return_cost_eur ?? 0);

    return {
      shipmentsToday,
      shipmentsPendingDispatch,
      criticalTours,
      toursToday,
      mtd: {
        revenue: mtdRevenueValue,
        contributionMargin: mtdCmValue,
        cmPercent: mtdCmPercent,
        revenueGrowthVsLastMonth: revenueGrowth,
      },
      returnQuotePct: mtdReturnQuotePct,
      openNvDispositionsCount,
      openDamageReportsCount,
      mtdReturnCostsEur,
    };
  }

  // ── Kunden-Ranking nach DB% (für Cockpit) ────────────────
  async getCustomerRanking(monthsBack = 1) {
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const result = await this.prisma.$queryRaw<any[]>`
      SELECT
        c.id AS customer_id,
        c.customer_number,
        c.name AS customer_name,
        c.min_contribution_pct,
        COUNT(s.id)::int AS shipment_count,
        COALESCE(SUM(s.freight_revenue), 0)::float AS total_revenue,
        COALESCE(SUM(s.contribution_margin), 0)::float AS total_cm,
        CASE
          WHEN COALESCE(SUM(s.freight_revenue), 0) > 0
          THEN ROUND(
            COALESCE(SUM(s.contribution_margin), 0) /
            COALESCE(SUM(s.freight_revenue), 0) * 100, 2
          )::float
          ELSE 0
        END AS avg_cm_percent,
        CASE
          WHEN COALESCE(SUM(s.freight_revenue), 0) <= 0 THEN 'red'
          WHEN ROUND(COALESCE(SUM(s.contribution_margin),0)/COALESCE(SUM(s.freight_revenue),1)*100,2)
               >= c.min_contribution_pct THEN 'green'
          WHEN ROUND(COALESCE(SUM(s.contribution_margin),0)/COALESCE(SUM(s.freight_revenue),1)*100,2)
               >= 5 THEN 'yellow'
          ELSE 'red'
        END AS db_traffic_light
      FROM customers c
      LEFT JOIN shipments s ON s.customer_id = c.id
        AND s.deleted_at IS NULL
        AND s.status != 'cancelled'
        AND s.created_at >= ${since}
      WHERE c.is_active = TRUE
      GROUP BY c.id, c.customer_number, c.name, c.min_contribution_pct
      HAVING COUNT(s.id) > 0
      ORDER BY avg_cm_percent DESC
    `;

    return result;
  }

  // ── DB-Trend der letzten 30 Tage ─────────────────────────
  async getDbTrend(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const result = await this.prisma.$queryRaw<any[]>`
      SELECT
        DATE(s.created_at) AS date,
        COALESCE(SUM(s.freight_revenue), 0)::float AS revenue,
        COALESCE(SUM(s.contribution_margin), 0)::float AS cm,
        CASE
          WHEN COALESCE(SUM(s.freight_revenue), 0) > 0
          THEN ROUND(
            COALESCE(SUM(s.contribution_margin), 0) /
            COALESCE(SUM(s.freight_revenue), 0) * 100, 2
          )::float
          ELSE 0
        END AS cm_percent
      FROM shipments s
      WHERE s.deleted_at IS NULL
        AND s.status != 'cancelled'
        AND s.created_at >= ${since}
      GROUP BY DATE(s.created_at)
      ORDER BY DATE(s.created_at) ASC
    `;

    return result;
  }

  // ── Offene Aufgaben (Alert-Liste) ────────────────────────
  async getOpenTasks() {
    const tasks: Array<{
      type: string;
      severity: string;
      message: string;
      entityId?: string;
    }> = [];

    const toursWithoutSub = await this.prisma.tours.findMany({
      where: {
        status: { in: ['planned', 'dispatched'] },
        subcontractor_id: null,
      },
      select: { id: true, tour_number: true },
    });
    toursWithoutSub.forEach((t) =>
      tasks.push({
        type: 'tour',
        severity: 'warning',
        message: `Tour ${t.tour_number} – kein Subunternehmer zugeordnet`,
        entityId: t.id,
      }),
    );

    const hazmatIncomplete = await this.prisma.shipments.count({
      where: {
        deleted_at: null,
        is_hazmat: true,
        status: { in: ['new', 'dispatched'] },
        OR: [{ hazmat_class: null }, { hazmat_un_number: null }],
      },
    });
    if (hazmatIncomplete > 0) {
      tasks.push({
        type: 'shipment',
        severity: 'error',
        message: `${hazmatIncomplete} Gefahrgut-Sendung(en) mit unvollständigen ADR-Daten`,
      });
    }

    const invoicesDraft = await this.prisma.invoices.count({
      where: { status: 'draft' },
    });
    if (invoicesDraft > 0) {
      tasks.push({
        type: 'invoice',
        severity: 'info',
        message: `${invoicesDraft} Rechnung(en) bereit zum Versand`,
      });
    }

    const datevPending = await this.prisma.invoices.count({
      where: { status: 'sent', datev_exported_at: null },
    });
    if (datevPending > 0) {
      tasks.push({
        type: 'datev',
        severity: 'info',
        message: `${datevPending} Rechnung(en) noch nicht an DATEV übergeben`,
      });
    }

    return tasks;
  }
}
