import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const TMS_API_URL = process.env.TMS_API_URL ?? 'http://localhost:3001';

const entrySchema = z.object({
  company: z.string().trim().min(1),
  contact: z.string().trim().min(1),
  street: z.string().trim().min(1),
  addressAddition: z.string().optional().or(z.literal('')),
  zip: z.string().trim().min(2),
  city: z.string().trim().min(1),
  country: z.string().trim().length(2),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
  }

  const parsed = entrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'validation' }, { status: 422 });
  }

  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 300));
    return NextResponse.json({ success: true, entry: { id, ...parsed.data } });
  }

  try {
    const tmsRes = await fetch(`${TMS_API_URL}/api/portal/address-book/${id}`, {
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

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 200));
    return NextResponse.json({ success: true, id });
  }

  try {
    const tmsRes = await fetch(`${TMS_API_URL}/api/portal/address-book/${id}`, {
      method: 'DELETE',
      headers: { 'X-Customer-Id': session.customerId },
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
