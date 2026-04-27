import { NextResponse } from 'next/server';
import { serverLeadSchema } from '@/lib/validators';
import { limitLeads } from '@/lib/ratelimit';
import { anonymizeIp, getClientIp } from '@/lib/security';
import type { LeadResponse } from '@/types/lead';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const TMS_API_URL = process.env.TMS_API_URL ?? 'http://localhost:3001';

/**
 * Bot-Confusion: simuliert success ohne den Lead weiterzuleiten.
 * Der Bot bekommt 200 OK und gibt Ruhe.
 */
function fakeSuccess(): NextResponse<LeadResponse> {
  return NextResponse.json<LeadResponse>({
    success: true,
    leadId: `IGN-${Date.now().toString(36).toUpperCase()}`,
  });
}

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);

  // Rate-Limit: 3 Leads / Stunde / IP. Bei Überschreitung
  // simulieren wir success (Bot-Confusion), keine 429.
  const rl = await limitLeads(ip);
  if (!rl.success) {
    // eslint-disable-next-line no-console
    console.warn('[leads] rate-limit hit', anonymizeIp(ip));
    return fakeSuccess();
  }

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
    // Honeypot-Feld 'website' ausgefüllt? → fakeSuccess
    const issues = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    if (issues.website && issues.website.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('[leads] honeypot triggered (validation)', anonymizeIp(ip));
      return fakeSuccess();
    }
    return NextResponse.json<LeadResponse>(
      { success: false, error: 'Validation failed' },
      { status: 422 },
    );
  }

  // Doppel-Check: auch wenn Schema durchläuft, leeres Honeypot-Feld erwarten
  if (parsed.data.website && parsed.data.website.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[leads] honeypot triggered', anonymizeIp(ip));
    return fakeSuccess();
  }

  // Mock-Modus
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
