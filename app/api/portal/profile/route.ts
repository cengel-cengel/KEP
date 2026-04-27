import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { DEMO_USER } from '@/mocks/user';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const TMS_API_URL = process.env.TMS_API_URL ?? 'http://localhost:3001';

const patchSchema = z.object({
  salutation: z.enum(['mr', 'mrs', 'diverse']).optional(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  position: z.string().trim().optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  mobile: z.string().trim().optional().or(z.literal('')),
  preferredLocale: z.enum(['de', 'en']).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  if (USE_MOCKS) {
    return NextResponse.json({
      success: true,
      profile: {
        ...DEMO_USER,
        salutation: 'mr',
        mobile: '+49 171 1234567',
        industry: 'Maschinenbau',
        customerSince: '2018-04',
        ustId: 'DE123456789',
        preferredLocale: 'de',
      },
    });
  }

  try {
    const tmsRes = await fetch(`${TMS_API_URL}/api/portal/profile`, {
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

export async function PATCH(request: Request) {
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'validation' }, { status: 422 });
  }

  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ success: true });
  }

  try {
    const tmsRes = await fetch(`${TMS_API_URL}/api/portal/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Customer-Id': session.customerId,
      },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });
    if (!tmsRes.ok) {
      return NextResponse.json({ success: false, error: 'tms_error' }, { status: tmsRes.status });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'network_error' }, { status: 503 });
  }
}
