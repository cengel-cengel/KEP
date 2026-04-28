import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MOCK_SHIPMENTS } from '@/mocks/shipments';
import {
  findShipmentByReference,
  sanitizeForPublicTracking,
} from '@/lib/tracking';
import { limitApi, rateLimitResponse } from '@/lib/ratelimit';
import { getClientIp } from '@/lib/security';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const TMS_API_URL = process.env.TMS_API_URL ?? 'http://localhost:3001';

const querySchema = z.object({
  reference: z.string().trim().min(2).max(50).regex(/^[A-Za-z0-9_\-\.\/]+$/, {
    message: 'invalid_chars',
  }),
});

export async function GET(request: Request) {
  // Rate-Limit: nutzt apiLimiter (60/min) - reicht für Public-Tracking
  const ip = getClientIp(request.headers);
  const rl = await limitApi(ip);
  if (!rl.success) {
    return rateLimitResponse(rl.reset);
  }

  const url = new URL(request.url);
  const reference = url.searchParams.get('reference') ?? '';

  const parsed = querySchema.safeParse({ reference });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'invalid_reference' },
      { status: 400 },
    );
  }

  if (USE_MOCKS) {
    const shipment = findShipmentByReference(MOCK_SHIPMENTS, parsed.data.reference);
    if (!shipment) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      tracking: sanitizeForPublicTracking(shipment),
    });
  }

  try {
    const tmsRes = await fetch(
      `${TMS_API_URL}/api/public-tracking?reference=${encodeURIComponent(parsed.data.reference)}`,
      { cache: 'no-store' },
    );
    if (tmsRes.status === 404) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }
    if (!tmsRes.ok) {
      return NextResponse.json({ success: false, error: 'tms_error' }, { status: 502 });
    }
    const data = await tmsRes.json();
    return NextResponse.json({ success: true, ...data });
  } catch {
    return NextResponse.json({ success: false, error: 'network_error' }, { status: 503 });
  }
}
