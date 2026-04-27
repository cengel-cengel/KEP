import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMockShipments } from '@/mocks/shipments';
import { newShipmentSchema } from '@/lib/validators';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const TMS_API_URL = process.env.TMS_API_URL ?? 'http://localhost:3001';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  if (USE_MOCKS) {
    return NextResponse.json({ success: true, shipments: getMockShipments() });
  }

  try {
    const tmsRes = await fetch(`${TMS_API_URL}/api/portal/shipments`, {
      headers: { 'X-Customer-Id': session.customerId },
      cache: 'no-store',
    });
    if (!tmsRes.ok) {
      return NextResponse.json({ success: false, error: 'tms_error' }, { status: 502 });
    }
    const data = await tmsRes.json();
    return NextResponse.json({ success: true, ...data });
  } catch {
    return NextResponse.json({ success: false, error: 'network_error' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
  }

  const parsed = newShipmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'validation', issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  if (USE_MOCKS) {
    // Simuliertes Delay fuer realistisches Loading-Feel
    await new Promise((r) => setTimeout(r, 700));
    const seq = Math.floor(1000 + Math.random() * 8999);
    const id = `KED-2026-${seq}`;
    // eslint-disable-next-line no-console
    console.info('[Shipment Mock]', id, parsed.data);
    return NextResponse.json({ success: true, id, trackingNumber: id });
  }

  try {
    const tmsRes = await fetch(`${TMS_API_URL}/api/portal/shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Customer-Id': session.customerId,
      },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });
    if (!tmsRes.ok) {
      return NextResponse.json(
        { success: false, error: 'tms_error' },
        { status: tmsRes.status },
      );
    }
    const data = (await tmsRes.json()) as { id: string; trackingNumber?: string };
    return NextResponse.json({ success: true, id: data.id, trackingNumber: data.trackingNumber });
  } catch {
    return NextResponse.json({ success: false, error: 'network_error' }, { status: 503 });
  }
}
