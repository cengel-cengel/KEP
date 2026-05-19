/**
 * PERF-1: Realtime-Broadcast-Helper.
 *
 * Services rufen emit() nach erfolgreicher Mutation (NACH
 * $transaction.commit). origin_client_id kommt aus dem
 * HTTP-Request-Header X-Client-Id und wird per Service
 * durchgereicht.
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RealtimeGateway, resolveRoom } from './realtime.gateway';

export type RealtimeEventType = 'tour.updated' | 'shipment.assigned';

export interface RealtimeEvent {
  event: RealtimeEventType;
  event_id: string;
  origin_client_id: string | null;
  entityType: 'tour' | 'shipment';
  entityId: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  emit(
    event: RealtimeEventType,
    entityType: 'tour' | 'shipment',
    entityId: string,
    originClientId: string | null | undefined,
    payload?: Record<string, unknown>,
  ): void {
    const evt: RealtimeEvent = {
      event,
      event_id: randomUUID(),
      origin_client_id: originClientId ?? null,
      entityType,
      entityId,
      timestamp: new Date().toISOString(),
      payload,
    };
    try {
      this.gateway.server?.to(resolveRoom()).emit('event', evt);
      this.logger.log(`emit ${event} ${entityType}:${entityId}`);
    } catch (err: any) {
      this.logger.warn(`emit failed: ${err?.message ?? err}`);
    }
  }
}
