import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { MOCK_ADDRESS_BOOK } from '@/mocks/addressBook';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const TMS_API_URL = process.env.TMS_API_URL ?? 'http://localhost:3001';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  if (USE_MOCKS) {
    return NextResponse.json({ success: true, entries: MOCK_ADDRESS_BOOK });
  }

  try {
    const tmsRes = await fetch(`${TMS_API_URL}/api/portal/address-book`, {
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
