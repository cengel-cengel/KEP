import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMockDocumentById } from '@/mocks/documents';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const TMS_API_URL = process.env.TMS_API_URL ?? 'http://localhost:3001';

/**
 * Minimaler PDF-Stub - genug für Browser-Display ohne externe Abhängigkeit.
 */
const MOCK_PDF = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 83 >>stream
BT /F1 18 Tf 70 770 Td (KED Global Logistics - Mock document) Tj ET
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f
0000000010 00000 n
0000000058 00000 n
0000000108 00000 n
0000000211 00000 n
0000000345 00000 n
trailer<< /Size 6 /Root 1 0 R >>
startxref
410
%%EOF`;

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
    const doc = getMockDocumentById(id);
    if (!doc) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }
    return new NextResponse(MOCK_PDF, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${doc.filename}"`,
      },
    });
  }

  try {
    const tmsRes = await fetch(`${TMS_API_URL}/api/portal/documents/${id}/download`, {
      headers: { 'X-Customer-Id': session.customerId },
      cache: 'no-store',
    });
    if (!tmsRes.ok) {
      return NextResponse.json({ success: false, error: 'tms_error' }, { status: tmsRes.status });
    }
    const blob = await tmsRes.blob();
    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': tmsRes.headers.get('Content-Type') ?? 'application/pdf',
        'Content-Disposition':
          tmsRes.headers.get('Content-Disposition') ?? 'attachment',
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'network_error' }, { status: 503 });
  }
}
