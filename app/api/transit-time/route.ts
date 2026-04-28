import { NextResponse } from 'next/server';
import { z } from 'zod';
import { calculateTransitTime } from '@/lib/transit-times';
import { limitApi, rateLimitResponse } from '@/lib/ratelimit';
import { getClientIp } from '@/lib/security';

const querySchema = z.object({
  fromCountry: z.string().trim().length(2).toUpperCase(),
  fromZip: z.string().trim().min(2).max(15),
  toCountry: z.string().trim().length(2).toUpperCase(),
  toZip: z.string().trim().min(2).max(15),
  type: z.enum(['sammelgut', 'direkt', 'uk']),
});

export async function GET(request: Request) {
  const ip = getClientIp(request.headers);
  const rl = await limitApi(ip);
  if (!rl.success) {
    return rateLimitResponse(rl.reset);
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    fromCountry: url.searchParams.get('fromCountry') ?? '',
    fromZip: url.searchParams.get('fromZip') ?? '',
    toCountry: url.searchParams.get('toCountry') ?? '',
    toZip: url.searchParams.get('toZip') ?? '',
    type: url.searchParams.get('type') ?? 'sammelgut',
  });

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'validation' }, { status: 400 });
  }

  const { fromCountry, fromZip, toCountry, toZip, type } = parsed.data;
  const result = calculateTransitTime(fromCountry, fromZip, toCountry, toZip, type);

  return NextResponse.json({ success: true, ...result });
}
