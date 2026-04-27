import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMockShipmentById } from '@/mocks/shipments';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const TMS_API_URL = process.env.TMS_API_URL ?? 'http://localhost:3001';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;

  if (USE_MOCKS) {
    const shipment = getMockShipmentById(id);
    if (!shipment) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, shipment });
  }

  try {
    const tmsRes = await fetch(`${TMS_API_URL}/api/portal/shipments/${id}`, {
      headers: { 'X-Customer-Id': session.customerId },
      cache: 'no-store',
    });
    if (!tmsRes.ok) {
      return NextResponse.json(
        { success: false, error: 'tms_error' },
        { status: tmsRes.status },
      );
    }
    const data = await tmsRes.json();
    return NextResponse.json({ success: true, ...data });
  } catch {
    return NextResponse.json({ success: false, error: 'network_error' }, { status: 503 });
  }
}
