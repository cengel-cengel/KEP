/**
 * Sicherheits-Helfer: IP-Extraktion + Anonymisierung.
 */

/**
 * Liefert die IP eines Requests aus den üblichen Proxy-Headern.
 * Fallback auf 'unknown' (führt zu schwächerem Rate-Limiting).
 */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // erste IP (linkster Eintrag) ist der Original-Client
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/**
 * Anonymisiert IPv4 (letztes Oktett) bzw. IPv6 (letzte 80 bit).
 * Für Logs/Telemetrie geeignet, GDPR-konform.
 */
export function anonymizeIp(ip: string): string {
  if (ip === 'unknown') return ip;
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.slice(0, 3).join(':') + ':xxxx:xxxx:xxxx:xxxx:xxxx';
  }
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.xx`;
  return ip;
}
