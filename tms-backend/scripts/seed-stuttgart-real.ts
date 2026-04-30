/**
 * SEED SCRIPT - ECHTE STUTTGART-DATEN
 *
 * Quelle: Tagesbericht KED Stuttgart 17.03.2025 - 31.03.2026
 * 
 * Inhalt:
 * - 49 echte Kunden (Bitzer, Geze, Sika, HELU, Trelleborg etc.)
 * - 53 unique Versender-Adressen
 * - 438 unique Empfänger-Adressen  
 * - 767 echte Sendungen (Pro Kunde max. 20)
 * - Status: ALLE 'new' (frisch erfasst)
 * - transport_type: SAMMELGUT 73% / DIREKT 14% / DIREKT_UMSCHLAG 12%
 * 
 * IDEMPOTENT via shipment_number Lookup
 * DEMO-MARKER: shipment_number startet mit "REAL-XXXX"
 * 
 * Ausführung:
 *   ts-node --transpile-only scripts/seed-stuttgart-real.ts
 * 
 * ENV:
 *   DATABASE_URL muss gesetzt sein (Railway oder lokal)
 *   Lookup-User: carlos@ked-global-logistics.de
 */

import { PrismaClient } from '../generated/prisma';
import { v5 as uuidv5 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Fix UUID-Namespace für Idempotenz - jede Entität bekommt deterministische UUID
const SEED_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const generateId = (entity: string, key: string): string => {
  return uuidv5(`${entity}:${key}`, SEED_NS);
};

interface SeedData {
  customers: Array<{
    kunde_nr: string;
    name: string;
    land: string;
    plz: string;
    ort: string;
  }>;
  versender: Array<{
    name: string;
    strasse: string;
    plz: string;
    ort: string;
    land: string;
  }>;
  empfaenger: Array<{
    name: string;
    strasse: string;
    plz: string;
    ort: string;
    land: string;
  }>;
  shipments: Array<{
    auftragsnummer: string;
    sendungsdatum: string;
    leistungsdatum: string;
    kunde_nr: string;
    kunde_name: string;
    versender_name: string;
    versender_strasse: string | null;
    versender_plz: string;
    versender_ort: string;
    versender_land: string;
    empfaenger_name: string;
    empfaenger_strasse: string | null;
    empfaenger_plz: string;
    empfaenger_ort: string;
    empfaenger_land: string;
    transport_type: string;
    frankatur: string;
    colli: number;
    package_type: string;
    package_l_cm: number;
    package_w_cm: number;
    package_h_cm: number;
    gewicht_kg: number;
    gewicht_pro_stk_kg: number;
    volumen_m3: number | null;
    ldm: number | null;
    kundenreferenz: string | null;
  }>;
  meta: {
    source: string;
    total_shipments: number;
    total_customers: number;
    total_versender: number;
    total_empfaenger: number;
    note: string;
  };
}

async function loadSeedData(): Promise<SeedData> {
  const dataPath = path.join(__dirname, 'seed-data.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Seed-Daten nicht gefunden: ${dataPath}\nLege seed-data.json im scripts/ Ordner ab.`);
  }
  const content = fs.readFileSync(dataPath, 'utf-8');
  return JSON.parse(content);
}

async function findAdminUser() {
  const user = await prisma.users.findUnique({
    where: { email: 'carlos@ked-global-logistics.de' },
  });
  if (!user) {
    throw new Error(
      'User carlos@ked-global-logistics.de nicht gefunden in DB. ' +
      'Bitte zuerst Login-User anlegen.'
    );
  }
  return user;
}

async function seedCustomers(data: SeedData, createdBy: string) {
  console.log(`\n[1/4] Customers (${data.customers.length})...`);
  let created = 0;
  let skipped = 0;
  
  for (const c of data.customers) {
    const id = generateId('customer', c.kunde_nr);
    const customer_number = `REAL-${c.kunde_nr}`;
    
    try {
      await prisma.customers.upsert({
        where: { customer_number },
        create: {
          id,
          customer_number,
          name: c.name,
          country_code: c.land,
          postal_code: c.plz || '',
          city: c.ort || '',
          is_active: true,
          customer_note: '[REAL-DATA] Stuttgart Tagesbericht',
          created_by: createdBy,
        },
        update: {
          name: c.name,
          country_code: c.land,
          postal_code: c.plz || '',
          city: c.ort || '',
        },
      });
      created++;
    } catch (err: any) {
      console.error(`  Fehler bei Customer ${c.kunde_nr}: ${err.message}`);
      skipped++;
    }
  }
  console.log(`  ✓ ${created} angelegt/aktualisiert, ${skipped} übersprungen`);
}

async function seedShipments(data: SeedData, createdBy: string) {
  console.log(`\n[2/4] Shipments (${data.shipments.length})...`);
  let created = 0;
  let skipped = 0;
  let errors = 0;
  
  for (let i = 0; i < data.shipments.length; i++) {
    const s = data.shipments[i];
    const shipment_number = `REAL-${s.auftragsnummer}`;
    const id = generateId('shipment', s.auftragsnummer);
    
    try {
      // Customer per ID finden
      const customer_id = generateId('customer', s.kunde_nr);
      
      await prisma.shipments.upsert({
        where: { shipment_number },
        create: {
          id,
          shipment_number,
          customer_id,
          status: 'new',
          transport_type: s.transport_type,
          frankatur: s.frankatur,
          
          // Versender
          sender_name: s.versender_name,
          sender_street: s.versender_strasse || 'k.A.',
          sender_zip: s.versender_plz || '',
          sender_city: s.versender_ort || '',
          sender_country: s.versender_land,
          
          // Empfänger
          recipient_name: s.empfaenger_name,
          recipient_street: s.empfaenger_strasse || 'k.A.',
          recipient_zip: s.empfaenger_plz || '',
          recipient_city: s.empfaenger_ort || '',
          recipient_country: s.empfaenger_land,
          
          // Mengen
          total_packages: s.colli,
          total_weight_kg: s.gewicht_kg,
          total_volume_m3: s.volumen_m3 ?? undefined,
          total_ldm: s.ldm ?? undefined,
          
          // Datums
          pickup_date: new Date(s.sendungsdatum),
          
          // Referenzen
          customer_ref: s.kundenreferenz || s.auftragsnummer,
          customer_note: '[REAL-DATA] Aus Stuttgart-Tagesbericht',
          
          created_by: createdBy,
        },
        update: {
          // bei Re-Run nur sicherstellen dass es noch da ist
          customer_note: '[REAL-DATA] Aus Stuttgart-Tagesbericht (re-seeded)',
        },
      });
      
      // Package-Items dazu
      const packageId = generateId('package', s.auftragsnummer);
      try {
        await prisma.shipment_package_items.upsert({
          where: { id: packageId },
          create: {
            id: packageId,
            shipment_id: id,
            package_type: s.package_type,
            quantity: s.colli,
            length_cm: s.package_l_cm,
            width_cm: s.package_w_cm,
            height_cm: s.package_h_cm,
            weight_kg_per_unit: s.gewicht_pro_stk_kg,
            stackable: true,
          },
          update: {},
        });
      } catch (pkgErr) {
        // package items optional
      }
      
      created++;
      if ((i + 1) % 50 === 0) {
        console.log(`  ... ${i + 1} / ${data.shipments.length}`);
      }
    } catch (err: any) {
      errors++;
      if (errors <= 3) {
        console.error(`  Fehler bei Shipment ${s.auftragsnummer}: ${err.message}`);
      }
    }
  }
  console.log(`  ✓ ${created} angelegt, ${errors} Fehler`);
}

async function summary() {
  console.log('\n=== ZUSAMMENFASSUNG ===');
  const customerCount = await prisma.customers.count({
    where: { customer_number: { startsWith: 'REAL-' } },
  });
  const shipmentCount = await prisma.shipments.count({
    where: { shipment_number: { startsWith: 'REAL-' } },
  });
  console.log(`Customers (REAL-*):  ${customerCount}`);
  console.log(`Shipments (REAL-*):  ${shipmentCount}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('SEED: ECHTE STUTTGART-DATEN');
  console.log('═══════════════════════════════════════════════════════');
  
  const data = await loadSeedData();
  console.log(`\nQuelle: ${data.meta.source}`);
  console.log(`${data.meta.total_shipments} Sendungen, ${data.meta.total_customers} Kunden`);
  
  const adminUser = await findAdminUser();
  console.log(`Created by: ${adminUser.email} (${adminUser.id})`);
  
  await seedCustomers(data, adminUser.id);
  await seedShipments(data, adminUser.id);
  await summary();
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('FERTIG');
  console.log('═══════════════════════════════════════════════════════');
}

main()
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
