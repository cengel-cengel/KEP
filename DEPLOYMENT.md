# TMS – Deployment

End-to-End-Anleitung um das TMS für die GF-Test-Phase live zu bringen.
Ziel: drei Geschäftsführer testen via öffentlicher URL, hinter Login + optional
Cloudflare Access.

---

## Architektur (Ziel)

```
            ┌──────────────────────┐
            │  Cloudflare Access   │  (optional, E-Mail-Whitelist)
            └──────────┬───────────┘
                       │
        ┌──────────────┴────────────────┐
        │                               │
        ▼                               ▼
┌──────────────────┐          ┌──────────────────────┐
│ tms-frontend     │          │ tms-backend (API)    │
│ Vercel/Railway   │  HTTPS   │ Railway              │
│ Vite + React     │ ───────▶ │ NestJS + Prisma      │
└──────────────────┘          └──────────┬───────────┘
                                         │
                              ┌──────────┴───────────┐
                              │                      │
                              ▼                      ▼
                       ┌─────────────┐       ┌─────────────┐
                       │ PostgreSQL  │       │ Redis (Bull)│
                       │ Railway     │       │ Railway     │
                       └─────────────┘       └─────────────┘
```

---

## Voraussetzungen

- [ ] GitHub-Repo `cengel-cengel/kep` mit Branch `tms-import` (oder
      `tms-deploy-ready` nach der Härtung)
- [ ] Railway-Account ([railway.app](https://railway.app))
- [ ] Vercel-Account ([vercel.com](https://vercel.com)) – nur falls Frontend
      auf Vercel deployed werden soll
- [ ] Cloudflare-Account (optional, für Access-Whitelist)

---

## Phase 1 – Backend auf Railway (~10 Min)

### 1.1 Neues Railway-Projekt anlegen

1. railway.app → **New Project** → **Deploy from GitHub repo**
2. Repository: `cengel-cengel/kep`
3. Branch: `tms-deploy-ready` (oder `tms-import`)
4. **Root Directory**: `tms-backend`
5. Service umbenennen: `tms-backend`

### 1.2 PostgreSQL und Redis hinzufügen

Im selben Projekt:

1. **+ New** → **Database** → **PostgreSQL**
   → erzeugt automatisch `DATABASE_URL` und macht sie verfügbar
2. **+ New** → **Database** → **Redis**
   → erzeugt automatisch `REDIS_URL` und stellt `REDIS_HOST/PORT`-Variablen bereit

### 1.3 Environment-Variablen am Backend setzen

Service `tms-backend` → **Variables** → folgende setzen
(die mit `${{...}}` referenzieren die Plugin-Werte):

```
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_HOST=${{Redis.REDISHOST}}
REDIS_PORT=${{Redis.REDISPORT}}
REDIS_PASSWORD=${{Redis.REDISPASSWORD}}

# Generieren: openssl rand -hex 32
JWT_SECRET=<HIER EIGENEN GENERIERTEN WERT EINSETZEN>

JWT_EXPIRES_IN=8h
THROTTLE_TTL=60
THROTTLE_LIMIT=100

# In Phase 2 ergänzen:
FRONTEND_URL=
ENABLE_SWAGGER=true
```

### 1.4 Deploy auslösen

Railway baut automatisch:
- `npm ci && npm run build`
- `npm run deploy:start`
  – das ruft erst `node scripts/apply-migrations.mjs`
    (Initial-Schema + 16 Raw-SQL-Migrations) und dann
    `node dist/main`.

**Erwartete Logs:**
```
==> _schema_migrations-Tracker sicherstellen
==> Initial-Schema
  [apply] database/001_initial_schema.sql
==> Raw-Migrations
  [apply] prisma/migrations/add_cost_model.sql
  ...
==> Fertig. 17 neue Migration(en) von 16 Datei(en) angewandt.
TMS Backend listening on port 3001
```

### 1.5 Smoke-Test

1. Service-URL kopieren (z.B. `https://tms-backend-production.up.railway.app`)
2. `GET /api/healthz` → `{"status":"ok",...}`
3. `GET /docs` → Swagger UI lädt

---

## Phase 2 – Frontend (~5 Min)

### Option A – Vercel (empfohlen)

1. vercel.com → **Add New Project** → Import `cengel-cengel/kep`
2. Branch: `tms-deploy-ready`
3. **Root Directory**: `tms-frontend`
4. Framework: Vite (auto-detected)
5. Environment Variables:
   ```
   VITE_API_URL=https://<dein-backend>.up.railway.app/api
   ```
6. Deploy

`vercel.json` im Repo erledigt SPA-Rewrites.

### Option B – Railway

Im selben Railway-Projekt wie das Backend:

1. **+ New** → **GitHub Repo** → `cengel-cengel/kep`
2. **Root Directory**: `tms-frontend`
3. Variables: `VITE_API_URL=https://<backend-domain>/api`

`railway.json` im Frontend nutzt `serve` als statischen Server.

### Backend-CORS verkabeln

Nach Frontend-Deploy: am Backend `FRONTEND_URL` setzen
(Komma-separiert, falls mehrere):

```
FRONTEND_URL=https://tms-frontend.vercel.app,https://kunden-test.ked-global-logistics.de
```

Backend redeployen, damit CORS greift.

---

## Phase 3 – Test-User für die drei Geschäftsführer

Aktuell legt das Seed-Script `seed-demo-flow.ts` Users an. Für GF-Accounts
gibt es zwei Wege:

### 3.1 Seed via Railway One-off-Job

```bash
railway run --service tms-backend npm run seed:demo
```

(setzt voraus dass die Demo-Daten zu eurem Test-Setup passen)

### 3.2 GF-Accounts manuell

Ein Helper-Skript fehlt bisher – wird im nächsten Sprint ergänzt. Bis dahin
direkt via SQL gegen die Postgres-Instanz (Railway → Postgres → Connect):

```sql
-- bcrypt-Hash mit:  htpasswd -bnBC 12 "" "passwort" | tr -d ':\n'
INSERT INTO users (id, email, password_hash, full_name, role, is_active)
VALUES
  (gen_random_uuid(), 'carlos@ked-global-logistics.de', '<bcrypt-hash>', 'Carlos Engel', 'superadmin', true),
  (gen_random_uuid(), 'dawoud@ked-global-logistics.de', '<bcrypt-hash>', 'Dawoud The Navi', 'superadmin', true),
  (gen_random_uuid(), 'markus@ked-global-logistics.de', '<bcrypt-hash>', 'Markus Long John Kempf', 'superadmin', true);
```

Passwörter NICHT in Slack/Mail teilen. 1Password / Bitwarden Shared Vault.

---

## Phase 4 – Härtung vor externem Zugang (optional, empfohlen)

### Cloudflare Access (E-Mail-Whitelist)

1. Cloudflare → **Zero Trust** → **Access** → **Applications**
2. **Add an application** → Self-hosted
3. Application Domain: deine TMS-Domain (z.B. `tms.ked-global-logistics.de`)
4. Policy:
   - Action: Allow
   - Include → Emails:
     `carlos@ked-global-logistics.de`, `dawoud@...`, `markus@...`, `du@...`
5. Authentication-Methode: One-Time-PIN (kein zusätzlicher Account nötig)

Vor jeder Anfrage muss man sich per E-Mail-Code authentifizieren.
Bypass für `/api/healthz` einrichten, damit Railway-Healthcheck nicht
blockiert wird.

### Backend-Hardening

In Production:
- `ENABLE_SWAGGER=false` – `/docs` ist nicht öffentlich nötig
- `THROTTLE_LIMIT=60` – Schutz vor Mass-Scraping
- Rate-Limit auf `/api/auth/login` – im nächsten Sprint, falls nicht eh
  über Cloudflare gelöst

---

## Was im Code für den Deploy gemacht wurde

(Branch `tms-deploy-ready`)

- `tms-backend/src/auth/jwt.strategy.ts` – `'changeme'`-Fallback entfernt,
  Fail-fast wenn `JWT_SECRET < 32 Zeichen`
- `tms-backend/src/auth/auth.module.ts` – gleiche Härtung +
  `JWT_EXPIRES_IN` aus ENV
- `tms-backend/src/main.ts` – CORS aus `FRONTEND_URL`,
  Production-Fail-fast wenn nicht gesetzt; Swagger nur bei
  `ENABLE_SWAGGER=true` oder im Dev-Mode
- `tms-backend/src/app.controller.ts` – `/healthz`-Endpoint
- `tms-backend/scripts/apply-migrations.mjs` – idempotenter
  Migration-Runner (Initial-Schema + 16 Raw-SQL via `pg` aus
  Dependencies)
- `tms-backend/package.json` – Scripts `deploy:db`, `deploy:start`,
  `postinstall: prisma generate`
- `tms-backend/.env.example` – komplette ENV-Liste mit Erklärungen
- `tms-backend/railway.json` – Build/Start/Healthcheck
- `tms-frontend/.env.example` – `VITE_API_URL`
- `tms-frontend/package.json` – `serve` als Runtime-Dep + `start`-Script
- `tms-frontend/railway.json` + `vercel.json`

---

## Bekannte Themen für später

- Puppeteer (PDF-Generation) ist in den Dependencies. Im Railway-Default-
  Image fehlt Chromium. Falls PDF-Features für die GF-Demo gebraucht werden:
  Custom Dockerfile mit Chromium-Installation.
- AWS S3 + SES sind eingebunden. Falls Document-Upload genutzt wird:
  AWS-Credentials in den Backend-ENVs setzen.
- Driver-App-Auth (`tms-backend/src/driver/`) hat eigene Auth-Logik –
  separat reviewen, ob sie für externe GF-Tests sicher ist.
