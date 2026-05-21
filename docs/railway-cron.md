# Railway Cron — recompute-all-tours

## Zweck

Nightly-Recompute aller aktiven Touren (NV + FV). Triggert
`POST /admin/cron/recompute-all-tours` mit `CronAuthGuard`.

Background: Recompute fires `recomputeTourFull(tourId)` pro Tour
(safe-Methoden, idempotent, swallow-per-Tour-Errors). Use-Case
nach Schema- oder Logik-Änderungen (z.B. classification, cost-
rates, is_charter-derive).

## Setup

### 1. ENV-Variable setzen

Railway-Dashboard → tms-backend Service → Variables:

```
CRON_SECRET=<32+ char random string>
```

Generate-Beispiel (lokal):

```bash
openssl rand -hex 32
```

**Fail-closed**: wenn `CRON_SECRET` nicht gesetzt ist, lehnt der
Guard alle Cron-Calls mit HTTP 503 ab. Nie offen.

### 2. Cron-Service anlegen

Railway-Dashboard → New Service → Cron.

| Feld | Wert |
|---|---|
| Schedule | `0 3 * * *` (täglich 03:00 UTC) |
| Command | siehe unten |

Command:

```bash
curl -sfX POST \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"mode":"all","batchSize":10}' \
  https://tms-backend-production-1950.up.railway.app/admin/cron/recompute-all-tours
```

`CRON_SECRET` als ENV-Var auf dem Cron-Service teilen (gleicher
Wert wie tms-backend-Service).

### 3. Verifikation

Manueller Test ohne Cron-Service:

```bash
# OK (200/202):
curl -X POST -H "X-Cron-Secret: $CRON_SECRET" \
  https://tms-backend-production-1950.up.railway.app/admin/cron/recompute-all-tours

# 401 ohne Secret:
curl -X POST \
  https://tms-backend-production-1950.up.railway.app/admin/cron/recompute-all-tours

# 401 mit falschem Secret:
curl -X POST -H "X-Cron-Secret: falsch" \
  https://tms-backend-production-1950.up.railway.app/admin/cron/recompute-all-tours
```

Railway-Backend-Log sollte zeigen:

```
[CronController] CRON recompute-all-tours START mode=all nv=N fv=M
[CronController] CRON nv: N/N (errors=0)
[CronController] CRON fv: M/M (errors=0)
[CronController] CRON recompute-all-tours DONE
```

## Architektur-Note

Zwei getrennte Endpoints:

- `POST /admin/recompute-all-tours` — **JwtAuthGuard** (Mensch via UI)
- `POST /admin/cron/recompute-all-tours` — **CronAuthGuard** (Railway-Cron)

Kein Guard-Mix. CronController + AdminController teilen Logik
nicht — minimal-redundante runRecomputeLoop bewusst dupliziert,
damit Auth-Kontamination ausgeschlossen ist.

## Backlog

Wenn später mehr Cron-Jobs nötig (z.B. nightly-eligibility-
backfill, classification-refresh), eigenen Endpoint pro Job
unter `/admin/cron/*`. Guard teilen sich alle.
