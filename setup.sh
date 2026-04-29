#!/bin/bash
# ============================================================
# TMS – Projekt-Setup Script
# Führe dieses Script einmal aus um das komplette Projekt zu erstellen
# Voraussetzung: Node.js >= 18, npm, git installiert
# ============================================================

set -e

echo "🚀 TMS Backend Setup startet..."

# NestJS CLI global installieren
npm install -g @nestjs/cli

# Projekt erstellen
nest new tms-backend --package-manager npm --skip-git
cd tms-backend

# Kern-Dependencies installieren
echo "📦 Dependencies installieren..."
npm install \
  @nestjs/config \
  @nestjs/jwt \
  @nestjs/passport \
  @nestjs/swagger \
  @nestjs/websockets \
  @nestjs/platform-socket.io \
  @nestjs/throttler \
  passport \
  passport-jwt \
  passport-local \
  @prisma/client \
  prisma \
  bcrypt \
  class-validator \
  class-transformer \
  socket.io \
  bull \
  @nestjs/bull \
  handlebars \
  puppeteer \
  nodemailer \
  @aws-sdk/client-s3 \
  @aws-sdk/client-ses \
  uuid \
  dayjs \
  helmet \
  compression

# Dev-Dependencies
npm install -D \
  @types/passport-jwt \
  @types/passport-local \
  @types/bcrypt \
  @types/nodemailer \
  @types/uuid \
  prisma

echo "✅ Dependencies installiert"

# Prisma initialisieren
npx prisma init --datasource-provider postgresql

echo "✅ Prisma initialisiert"
echo ""
echo "📋 Nächste Schritte:"
echo "  1. .env Datei ausfüllen (DATABASE_URL, JWT_SECRET, etc.)"
echo "  2. npx prisma migrate dev --name init"
echo "  3. npm run start:dev"
