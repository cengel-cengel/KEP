# TMS – Sprint 1: Fundament

## Was ist in diesem Paket

```
tms/
├── database/
│   └── 001_initial_schema.sql     ← Komplettes PostgreSQL Schema
├── backend/
│   └── src/
│       ├── app.module.ts           ← NestJS Hauptmodul
│       ├── shipments/
│       │   └── shipments.service.ts ← Kern-Businesslogik Sendungen
│       ├── conditions/
│       │   └── conditions.service.ts ← Frachtpreisberechnung
│       ├── cockpit/
│       │   └── cockpit.service.ts  ← Live DB-Dashboard
│       └── invoices/
│           └── datev-export.service.ts ← DATEV EXTF Export
├── docker-compose.yml             ← Lokale DB + Redis
├── .env.template                  ← Alle Umgebungsvariablen
└── setup.sh                       ← Projekt-Setup Script
```

---

## Tag 1: Lokale Umgebung in 30 Minuten aufsetzen

### Schritt 1 – Voraussetzungen prüfen
```bash
node --version    # Muss >= 18 sein
npm --version     # Muss >= 9 sein
docker --version  # Für lokale DB
```

### Schritt 2 – Datenbank starten
```bash
# Im tms/ Verzeichnis:
docker-compose up -d

# Prüfen ob alles läuft:
docker-compose ps
# postgres: healthy ✓
# redis:    healthy ✓
```

### Schritt 3 – NestJS Projekt erstellen
```bash
# Setup Script ausführen:
chmod +x setup.sh
./setup.sh

# Oder manuell:
npm install -g @nestjs/cli
nest new tms-backend --package-manager npm --skip-git
cd tms-backend
```

### Schritt 4 – .env konfigurieren
```bash
cp ../.env.template .env

# .env öffnen und ausfüllen:
# DATABASE_URL=postgresql://tms_user:tms_password@localhost:5432/tms_db
# JWT_SECRET=<generieren: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
```

### Schritt 5 – Datenbank initialisieren
```bash
# Option A: SQL direkt ausführen (schnellste Methode)
docker exec -i tms_postgres psql -U tms_user -d tms_db < ../database/001_initial_schema.sql

# Option B: Über Prisma (später für Migrationen)
npx prisma db push
```

### Schritt 6 – Server starten
```bash
npm run start:dev
# Server läuft auf http://localhost:3001
# Swagger UI: http://localhost:3001/api
```

---

## Projektstruktur die du aufbauen wirst

```
tms-backend/
├── src/
│   ├── app.module.ts              ← ✅ Fertig
│   ├── main.ts                    ← Erstellen (Swagger, Helmet, CORS)
│   ├── prisma/
│   │   ├── prisma.module.ts       ← Erstellen
│   │   └── prisma.service.ts      ← Erstellen
│   ├── auth/
│   │   ├── auth.module.ts         ← Sprint 1
│   │   ├── auth.service.ts        ← Sprint 1
│   │   ├── auth.controller.ts     ← Sprint 1
│   │   ├── jwt.strategy.ts        ← Sprint 1
│   │   └── guards/
│   │       └── jwt-auth.guard.ts  ← Sprint 1
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.service.ts
│   │   └── users.controller.ts
│   ├── customers/                 ← Sprint 1
│   ├── addresses/                 ← Sprint 1
│   ├── subcontractors/            ← Sprint 1
│   ├── conditions/
│   │   └── conditions.service.ts  ← ✅ Fertig
│   ├── shipments/
│   │   └── shipments.service.ts   ← ✅ Fertig (Kern-Logik)
│   ├── tours/                     ← Sprint 2
│   ├── invoices/
│   │   └── datev-export.service.ts ← ✅ Fertig
│   ├── cockpit/
│   │   └── cockpit.service.ts     ← ✅ Fertig
│   ├── documents/                 ← Sprint 3 (CMR PDF)
│   └── audit/                     ← Sprint 1
```

---

## Cursor AI Prompts für Sprint 1

Kopiere diese Prompts direkt in Cursor um die fehlenden Dateien zu generieren:

### Prompt 1: main.ts
```
Erstelle die main.ts für eine NestJS Anwendung mit folgenden Anforderungen:
- Swagger UI unter /api aktiviert mit Titel "TMS API", Version "1.0"
- Helmet für Security-Headers
- CORS nur für http://localhost:3000 (Frontend) erlaubt
- Global ValidationPipe mit whitelist: true, forbidNonWhitelisted: true
- ThrottlerGuard global
- Port aus .env (PORT), Fallback 3001
- Shutdown Hooks aktiviert
```

### Prompt 2: Prisma Service
```
Erstelle prisma.module.ts und prisma.service.ts für NestJS.
PrismaService soll:
- PrismaClient erweitern
- onModuleInit: this.$connect() aufrufen
- onModuleDestroy: this.$disconnect() aufrufen
- Global als Module exportiert werden
- Logging in development: ['query', 'error', 'warn']
```

### Prompt 3: Auth Module
```
Erstelle ein vollständiges Auth-Modul für NestJS mit:
- JWT Login (POST /auth/login) mit E-Mail + Passwort
- JWT Refresh Token (POST /auth/refresh)
- Logout (POST /auth/logout)
- GET /auth/me für aktuellen User
- Passwort-Vergleich mit bcrypt
- AccessToken: 15 Minuten, RefreshToken: 7 Tage
- JWT Strategie für Guards
- Passwort-Hash aus users Tabelle (PostgreSQL via PrismaService)
- Alle DTOs mit class-validator dekoriert
```

### Prompt 4: Customers CRUD
```
Erstelle vollständigen CRUD für Customers in NestJS:
- GET /customers (Liste mit Paginierung, Suche per ?search=)
- GET /customers/:id (Einzelkunde mit Adressen und aktiven Konditionen)
- POST /customers (Erstellen, Kundennummer auto aus Sequence)
- PATCH /customers/:id (Aktualisieren)
- DELETE /customers/:id (Soft-Delete via is_active=false)
- Alle Endpunkte mit JwtAuthGuard geschützt
- Swagger Dekoratoren auf allen Endpunkten
- PrismaService für Datenbankzugriff
- AuditService für Logging aller Änderungen
```

### Prompt 5: Shipments Controller
```
Erstelle den ShipmentsController für NestJS der den vorhandenen ShipmentsService verwendet:
- GET /shipments (Liste, Filter: status, customerId, loadingDate, tourId, search)
- GET /shipments/:id
- POST /shipments (CreateShipmentDto validiert)
- PATCH /shipments/:id
- DELETE /shipments/:id (Soft-Delete)
- POST /shipments/:id/dispatch (DispatchShipmentDto mit tourId)
- POST /shipments/bulk-dispatch (Array von IDs + tourId)
- GET /shipments/price-preview (Query-Params für Live-Kalkulation)
- WebSocket Event 'shipment:updated' nach jeder Änderung emittieren
- Alle Endpunkte mit Swagger dokumentiert
```

---

## Tägliche Arbeitsroutine (30h/Woche = 4-5h/Tag)

```
1. Cursor öffnen, aktuellen Branch pullen
2. docker-compose up -d (DB sicherstellen)
3. npm run start:dev starten
4. Geplantes Feature als Prompt in Cursor eingeben
5. Generierten Code prüfen und testen (Swagger UI / Postman)
6. Einheit testen: npm run test
7. Commit: git commit -m "feat: [was du gebaut hast]"
8. Code-Review: Cursor fragen "Review diesen Code auf Sicherheit und Fehler"
```

---

## Wichtige Commands

```bash
# Entwicklung
npm run start:dev          # Server mit Hot-Reload
npm run test               # Unit Tests
npm run test:e2e           # E2E Tests

# Datenbank
docker-compose up -d       # DB + Redis starten
docker-compose down        # Stoppen
docker-compose logs -f     # Logs

# DB direkt befragen
docker exec -it tms_postgres psql -U tms_user -d tms_db

# Schema neu einlesen nach Änderungen
docker exec -i tms_postgres psql -U tms_user -d tms_db < database/001_initial_schema.sql

# pgAdmin (Datenbank-GUI)
docker-compose --profile tools up -d
# → http://localhost:5050 (admin@tms.local / admin)
```

---

## Nächste Session: Sprint 2 – Dispo-Board Backend

Was in Sprint 2 gebaut wird:
- Tours Controller + Service komplett
- WebSocket Gateway für Echtzeit-Updates im Dispo-Board
- Bulk-Dispatch Optimierung
- Cockpit Controller mit allen KPI-Endpunkten
- Frontend-Start: React + Vite Projekt, TailwindCSS, shadcn/ui

Einfach sagen "Sprint 2 starten" und ich liefere das komplette nächste Paket.
