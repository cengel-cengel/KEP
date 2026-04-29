import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

try {
  const rows = await prisma.tours.findMany({
    where: { status: { in: ['closed', 'completed'] } },
    take: 2,
    include: {
      subcontractors: { select: { id: true, name: true } },
      shipments: {
        where: { deleted_at: null },
        include: {
          customers: { select: { id: true, name: true } },
          business_partner: {
            select: { id: true, name: true, partner_number: true },
          },
          addresses_shipments_loading_address_idToaddresses: true,
          addresses_shipments_delivery_address_idToaddresses: true,
          inbound_routing: {
            select: {
              id: true,
              rule_name: true,
              delivery_type: true,
              partner_name: true,
            },
          },
          outbound_routing: {
            select: {
              id: true,
              rule_name: true,
              delivery_type: true,
              partner_name: true,
            },
          },
          pre_carriage_shipments: {
            include: {
              pre_carriage_tours: {
                select: {
                  id: true,
                  tour_date: true,
                  total_cost: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: [{ tour_position: 'asc' }, { created_at: 'asc' }],
      },
    },
    orderBy: [{ closed_at: 'desc' }, { completed_at: 'desc' }, { tour_date: 'desc' }],
  });
  console.log('ok rows', rows.length);
  console.log(JSON.stringify(rows, (_, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 500));
} catch (e) {
  console.error('QUERY_FAILED', e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await pool.end();
}
