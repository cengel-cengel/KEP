#!/usr/bin/env node
// ============================================================
// TMS - Migration Runner
//
// Applied bei Production-Deploy:
//   1. Initial-Schema (../database/001_initial_schema.sql)
//   2. Alle prisma/migrations/*.sql in alphabetischer Reihenfolge
//
// Idempotent: nutzt eine _schema_migrations-Tabelle als Tracker.
// Wiederholtes Ausführen ueberspringt bereits angewandte Files.
//
// Nutzung:
//   DATABASE_URL=postgres://... node scripts/apply-migrations.mjs
// ============================================================

import pg from 'pg';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const BACKEND_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(BACKEND_DIR, '..');
// Initial-Schema bevorzugt aus tms-backend/database/ (deployt mit dem Service),
// fallback auf Repo-Root (lokales Mono-Repo-Dev).
const INITIAL_SCHEMA_LOCAL = resolve(BACKEND_DIR, 'database/001_initial_schema.sql');
const INITIAL_SCHEMA_REPO = resolve(REPO_ROOT, 'database/001_initial_schema.sql');
const RAW_MIGRATIONS_DIR = resolve(BACKEND_DIR, 'prisma/migrations');

async function resolveInitialSchemaPath() {
  for (const candidate of [INITIAL_SCHEMA_LOCAL, INITIAL_SCHEMA_REPO]) {
    try {
      await stat(candidate);
      return candidate;
    } catch {}
  }
  throw new Error(
    `Initial-Schema nicht gefunden. Gesucht: ${INITIAL_SCHEMA_LOCAL} und ${INITIAL_SCHEMA_REPO}`,
  );
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function ensureTrackerTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      id           SERIAL PRIMARY KEY,
      filename     TEXT NOT NULL UNIQUE,
      checksum     TEXT NOT NULL,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function alreadyApplied(client, filename) {
  const r = await client.query(
    'SELECT 1 FROM _schema_migrations WHERE filename = $1',
    [filename],
  );
  return r.rowCount > 0;
}

async function recordApplied(client, filename, checksum) {
  await client.query(
    'INSERT INTO _schema_migrations (filename, checksum) VALUES ($1, $2)',
    [filename, checksum],
  );
}

async function applyFile(client, label, filePath, filename) {
  const sql = await readFile(filePath, 'utf8');
  const checksum = sha256(sql);

  if (await alreadyApplied(client, filename)) {
    console.log(`  [skip]  ${label}  (bereits angewandt)`);
    return false;
  }

  console.log(`  [apply] ${label}`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await recordApplied(client, filename, checksum);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`Migration ${filename} fehlgeschlagen: ${err.message}`);
  }
}

async function listMigrations(dir) {
  try {
    await stat(dir);
  } catch {
    return [];
  }
  const all = await readdir(dir);
  return all.filter((f) => f.endsWith('.sql')).sort();
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('FEHLER: DATABASE_URL nicht gesetzt.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log('==> _schema_migrations-Tracker sicherstellen');
    await ensureTrackerTable(client);

    console.log('==> Initial-Schema');
    const initialSchemaPath = await resolveInitialSchemaPath();
    await applyFile(
      client,
      'database/001_initial_schema.sql',
      initialSchemaPath,
      '001_initial_schema.sql',
    );

    console.log('==> Raw-Migrations');
    const files = await listMigrations(RAW_MIGRATIONS_DIR);
    let appliedCount = 0;
    for (const file of files) {
      const did = await applyFile(
        client,
        `prisma/migrations/${file}`,
        join(RAW_MIGRATIONS_DIR, file),
        file,
      );
      if (did) appliedCount++;
    }

    console.log(
      `==> Fertig. ${appliedCount} neue Migration(en) von ${files.length} Datei(en) angewandt.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migrations-Fehler:', err.message);
  process.exit(1);
});
