# KED Global Logistics – Mono-Repo

Hybrid-Setup aus Marketing-Website, Kundenportal und Transport-Management-System (TMS).

## Struktur

```
/
├── app/, components/, lib/, ...   ← Marketing-Website + Kundenportal
│                                    (Next.js 14, deployed auf Vercel)
├── tms-backend/                   ← TMS-API (NestJS 11 + Prisma 7 + Postgres)
├── tms-frontend/                  ← TMS-UI (Vite + React 19)
├── database/                      ← Initial-Schema (PostgreSQL)
├── docker-compose.yml             ← lokale DB + Redis + pgAdmin
└── scripts/, setup.sh             ← Onboarding-Helper
```

Die Website lebt am Repo-Root. Das TMS lebt in eigenen Subordnern und
wird unabhängig deployed.

## Branches

| Branch                                   | Inhalt                                      |
| ---------------------------------------- | ------------------------------------------- |
| `main`                                   | (Webseite, falls weitergepflegt)            |
| `claude/ked-logistics-website-EH0Na`     | Aktuelle Website-Entwicklung                |
| `tms-import`                             | TMS-Initialimport                           |
| `tms-deploy-ready`                       | TMS-Härtung für Production-Deployment       |

## Komponenten – Quick-Start

### Website (Root)

```bash
npm install
cp .env.local.example .env.local
npm run dev
# → http://localhost:3000
```

### TMS-Backend

```bash
cd tms-backend
npm install
cp .env.example .env
# JWT_SECRET via `openssl rand -hex 32` setzen

# Lokale Datenbank starten
cd .. && docker-compose up -d
cd tms-backend

# Schema + Migrations anwenden
npm run deploy:db

# Dev-Server
npm run start:dev
# → http://localhost:3001
# → Swagger: http://localhost:3001/docs
```

### TMS-Frontend

```bash
cd tms-frontend
npm install
cp .env.example .env.local
# VITE_API_URL=http://localhost:3001/api
npm run dev
# → http://localhost:5173
```

## Deployment

| Komponente       | Empfohlene Plattform | Konfig                |
| ---------------- | -------------------- | --------------------- |
| Website          | Vercel               | `next.config.mjs`     |
| TMS-Backend      | Railway              | `tms-backend/railway.json` |
| TMS-Frontend     | Vercel oder Railway  | `tms-frontend/vercel.json` bzw. `railway.json` |
| Datenbank        | Railway Postgres-Plugin | (Railway-managed)  |
| Redis (Bull)     | Railway Redis-Plugin    | (Railway-managed)  |

Detailliertere Deployment-Anleitung: siehe [DEPLOYMENT.md](./DEPLOYMENT.md).

## Lizenz

UNLICENSED – internes Projekt der Engel, The Navi & Kempf Global Logistics GmbH.
