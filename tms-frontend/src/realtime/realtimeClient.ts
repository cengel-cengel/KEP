/**
 * PERF-1: Socket.IO-Singleton mit Reconnect + Dedup.
 *
 * Auth: handshake.auth.token (JWT aus localStorage).
 * Reconnect-Backoff: 1s → 16s, max.
 * Dedup: LRU-Set der letzten 100 event_ids.
 * No-Self-Event: skipt msg wenn origin_client_id === eigene clientId.
 *
 * clientId: persistiert in sessionStorage 'tms_client_id'.
 * Wird auch via api.ts axios-interceptor als X-Client-Id-
 * Header an jede HTTP-Mutation gehängt.
 */
import { io, Socket } from 'socket.io-client';

const TOKEN_KEY = 'tms_token';
const CLIENT_ID_KEY = 'tms_client_id';
const DEDUP_CAPACITY = 100;

export type RealtimeEventType =
  | 'tour.updated'
  | 'shipment.assigned'
  | 'shipment.updated';

export interface RealtimeEvent {
  event: RealtimeEventType;
  event_id: string;
  origin_client_id: string | null;
  entityType: 'tour' | 'shipment';
  entityId: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export type RealtimeHandler = (evt: RealtimeEvent) => void;

/** Generiert oder holt eine stabile clientId pro Browser-Tab. */
export function getClientId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = sessionStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const fresh =
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `cid-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    sessionStorage.setItem(CLIENT_ID_KEY, fresh);
    return fresh;
  } catch {
    return `cid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** LRU-Dedup-Set, gibt true zurück wenn id schon gesehen. */
function makeDedup(capacity = DEDUP_CAPACITY) {
  const seen = new Set<string>();
  const order: string[] = [];
  return {
    has(id: string): boolean {
      return seen.has(id);
    },
    add(id: string): void {
      if (seen.has(id)) return;
      seen.add(id);
      order.push(id);
      while (order.length > capacity) {
        const old = order.shift();
        if (old) seen.delete(old);
      }
    },
  };
}

let socket: Socket | null = null;
let handlers: Set<RealtimeHandler> = new Set();
let statusListeners: Set<(s: RealtimeStatus) => void> = new Set();
let currentStatus: RealtimeStatus = 'disconnected';
const dedup = makeDedup();

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected';

function setStatus(s: RealtimeStatus) {
  if (s === currentStatus) return;
  currentStatus = s;
  for (const l of statusListeners) {
    try {
      l(s);
    } catch {
      /* noop */
    }
  }
}

export function getRealtimeStatus(): RealtimeStatus {
  return currentStatus;
}

export function onRealtimeStatus(
  cb: (s: RealtimeStatus) => void,
): () => void {
  statusListeners.add(cb);
  // emit current state immediate (caller bekommt initialen Wert)
  cb(currentStatus);
  return () => {
    statusListeners.delete(cb);
  };
}

/**
 * Connect (idempotent). Wird beim Auth-State 'authenticated'
 * aus AuthProvider gerufen.
 *
 * PERF: Guard prueft jetzt sowohl `connected` als auch das nicht-
 * disconnected-Flag, damit zwei Caller waehrend der Handshake-Phase
 * NICHT zwei parallele Sockets erzeugen (alter Guard `socket?.connected`
 * traf nicht waehrend `connecting`). Transports auf `['websocket']`
 * festgenagelt — kein HTTP-poll-Handshake mehr, der DevTools-Network
 * als zweite Verbindung anzeigt (Railway-BE unterstuetzt WS first-class).
 */
export function connectRealtime(): void {
  if (typeof window === 'undefined') return;
  // PERF-Fix: socket existiert + ist nicht disconnected → schon ein
  // Connect-Versuch laeuft (connecting ODER connected). Zweiter Caller
  // wird komplett ignoriert.
  if (socket && !socket.disconnected) return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  setStatus('connecting');
  // baseURL aus VITE_API_URL ableiten — wenn /api am Ende,
  // wird es zu Socket-URL ohne /api transformiert.
  const apiUrl =
    (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
  const base = apiUrl.replace(/\/api\/?$/, '');
  const wsUrl = base || window.location.origin;
  socket = io(wsUrl, {
    path: '/ws/realtime',
    // PERF-Fix: nur websocket — kein polling-Fallback. Polling+upgrade
    // erscheinen im DevTools-Network als zweite Verbindung (XHR-Handshake
    // + WS-Upgrade). Railway/Vercel haben durchgaengig WS-Support.
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 16000,
    randomizationFactor: 0.3,
  });
  const myId = getClientId();
  socket.on('event', (msg: RealtimeEvent) => {
    if (!msg || !msg.event_id) return;
    if (dedup.has(msg.event_id)) return;
    if (msg.origin_client_id && msg.origin_client_id === myId) {
      dedup.add(msg.event_id);
      return;
    }
    dedup.add(msg.event_id);
    for (const h of handlers) {
      try {
        h(msg);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[realtime] handler error', err);
      }
    }
  });
  socket.on('connect_error', (err) => {
    // eslint-disable-next-line no-console
    console.warn('[realtime] connect_error', err.message);
    setStatus('disconnected');
  });
  socket.on('connect', () => setStatus('connected'));
  socket.on('disconnect', () => setStatus('disconnected'));
  socket.on('reconnect_attempt', () => setStatus('connecting'));
}

export function disconnectRealtime(): void {
  if (!socket) return;
  socket.disconnect();
  socket = null;
  setStatus('disconnected');
}

/** Handler-Subscribe. Liefert unsubscribe-Funktion. */
export function onRealtimeEvent(handler: RealtimeHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

// Test-Hook: erlaubt Reset zwischen Tests.
export function _resetRealtimeClient(): void {
  if (socket) {
    try {
      socket.disconnect();
    } catch {
      /* noop */
    }
  }
  socket = null;
  handlers = new Set();
  statusListeners = new Set();
  currentStatus = 'disconnected';
}
