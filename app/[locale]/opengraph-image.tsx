import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'KED Global Logistics – Spedition Stuttgart';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 80px',
          background:
            'linear-gradient(135deg, #0f2744 0%, #1a385c 60%, #264a73 100%)',
          color: 'white',
          fontFamily: 'system-ui',
        }}
      >
        {/* Top - Logo wordmark */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: -0.5,
              lineHeight: 1.1,
            }}
          >
            KED
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: '#C9A961',
              marginTop: 4,
            }}
          >
            Global Logistics
          </div>
        </div>

        {/* Center - Slogan */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: '#C9A961',
            }}
          >
            We move. You grow.
          </div>
          <div
            style={{
              fontSize: 88,
              fontWeight: 800,
              letterSpacing: -2,
              lineHeight: 1.05,
              marginTop: 12,
            }}
          >
            Sammelgut. Direkt. UK.
          </div>
        </div>

        {/* Bottom - Locations */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: 22,
            color: '#dbe5f0',
          }}
        >
          <div>Stuttgart · Witham · Stoke</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: '#C9A961',
            }}
          >
            ked-global-logistics.de
          </div>
        </div>
      </div>
    ),
    size,
  );
}
