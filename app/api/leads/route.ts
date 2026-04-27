import { NextResponse } from 'next/server';
import { serverLeadSchema } from '@/lib/validators';
import type { LeadResponse } from '@/types/lead';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const TMS_API_URL = process.env.TMS_API_URL ?? 'http://localhost:3001';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<LeadResponse>(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = serverLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<LeadResponse>(
      { success: false, error: 'Validation failed' },
      { status: 422 },
    );
  }

  // Mock-Modus: keine echte API-Anbindung
  if (USE_MOCKS) {
    const leadId = `MOCK-${Date.now().toString(36).toUpperCase()}`;
    // eslint-disable-next-line no-console
    console.info('[Lead Mock]', leadId, parsed.data);
    return NextResponse.json<LeadResponse>({ success: true, leadId });
  }

  // Echte Weiterleitung an TMS
  try {
    const tmsRes = await fetch(`${TMS_API_URL}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });

    if (!tmsRes.ok) {
      return NextResponse.json<LeadResponse>(
        { success: false, error: 'TMS request failed' },
        { status: 502 },
      );
    }

    const tmsData = (await tmsRes.json()) as { id?: string };
    return NextResponse.json<LeadResponse>({
      success: true,
      leadId: tmsData.id,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Lead Forwarding Error]', err);
    return NextResponse.json<LeadResponse>(
      { success: false, error: 'Network error' },
      { status: 503 },
    );
  }
}
