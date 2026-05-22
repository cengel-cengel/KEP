# Nightly-Recompute — in-process Scheduler

## Zweck

Nightly-Recompute aller aktiven Touren (NV + FV). Läuft täglich
02:00 **Europe/Berlin** (DST-safe) im **tms-backend-Prozess** selbst
— kein externer Cron-Service nötig.

Background: `RecomputeSchedulerService.@Cron('0 2 * * *')` →
`RecomputeService.runRecomputeLoop('all', 10)` → fires
`recomputeTourFull(tourId)` pro Tour (safe-Methoden, idempotent,
swallow-per-Tour-Errors). Use-Case nach Schema- oder Logik-
Änderungen (z.B. classification, cost-rates, is_charter-derive).

## Setup

Nichts. Der `@nestjs/schedule`-Decorator wird automatisch beim
NestJS-Bootstrap registriert (`ScheduleModule.forRoot()` in
`app.module.ts`). Solange tms-backend läuft, läuft der Cron.

## Manuelle Trigger-Pfade (HTTP-Endpoints)

Falls man den Recompute ad-hoc anstoßen will (z.B. nach Migration):

| Pfad | Auth | Use-Case |
|---|---|---|
| `POST /admin/recompute-all-tours` | JwtAuthGuard | Mensch via UI/curl |
| `POST /admin/cron/recompute-all-tours` | CronAuthGuard (`X-Cron-Secret`) | Externer Caller (Railway-Cron-Service, Monitoring-Tool, on-demand-Diagnose) |

Beide HTTP-Endpoints rufen `RecomputeService.runRecomputeLoop`
— identische Logik, eigener Auth-Pfad.

### Manueller Test (CRON_SECRET-Endpoint)

```bash
# OK (202):
curl -X POST -H "X-Cron-Secret: $CRON_SECRET" \
  https://tms-backend-production-1950.up.railway.app/admin/cron/recompute-all-tours

# 401 ohne Secret:
curl -X POST \
  https://tms-backend-production-1950.up.railway.app/admin/cron/recompute-all-tours

# 401 mit falschem Secret:
curl -X POST -H "X-Cron-Secret: falsch" \
  https://tms-backend-production-1950.up.railway.app/admin/cron/recompute-all-tours
```

## ENV-Variable

```
CRON_SECRET=<32+ char random string>     # NUR für HTTP-Endpoint /admin/cron/*
```

**Fail-closed**: ohne `CRON_SECRET` lehnt der Guard alle Cron-Calls
mit HTTP 503 ab. Der **In-Process-Scheduler** ist DAVON unabhängig
und läuft trotzdem.

Generieren: `openssl rand -hex 32`.

## Verifikation Live-Log

Railway-Backend-Log sollte nach 02:00 Berlin-Zeit zeigen:

```
[RecomputeService] recompute START mode=all nv=N fv=M batch=10
[RecomputeService] recompute NV: N/N (errors=0)
[RecomputeService] recompute FV: M/M (errors=0)
[RecomputeService] recompute DONE mode=all nv=N/N fv=M/M errors=0 duration=Xms
[RecomputeSchedulerService] nightlyRecompute OK nv=N/N fv=M/M errors=0 duration=Xms
```

## Architektur

```
                ┌────────────────────────────────────────────┐
                │  RecomputeService.runRecomputeLoop()       │
                │  (DRY — eine Methode, eine Quelle)         │
                └─────────────────▲──────────────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
   ┌────────┴─────────┐  ┌────────┴────────┐  ┌────────┴──────────┐
   │ AdminController  │  │ CronController  │  │ RecomputeScheduler│
   │ /admin/recompute │  │ /admin/cron/    │  │ @Cron('0 2 * * *')│
   │ JwtAuthGuard     │  │ recompute       │  │ Europe/Berlin     │
   │ (Mensch)         │  │ CronAuthGuard   │  │ (in-process)      │
   └──────────────────┘  └─────────────────┘  └───────────────────┘
```

3 Trigger-Pfade, eine Loop-Implementation. Auth-Pfade getrennt
(kein Guard-Mix). Scheduler bypassed HTTP → kein Round-Trip
zur eigenen API.

## Backlog

Wenn später mehr Cron-Jobs nötig (z.B. nightly-eligibility-
backfill, classification-refresh): zusätzlicher @Cron-Decorator
im RecomputeSchedulerService oder eigener SchedulerService.
