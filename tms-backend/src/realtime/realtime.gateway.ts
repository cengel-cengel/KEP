/**
 * PERF-1: Realtime-Sync via Socket.IO.
 *
 * Event-Set (PERF-1 Scope):
 *   tour.updated       — status, hub, fahrzeug_typ, overload-Change
 *   shipment.assigned  — add/remove/reorder
 *
 * Auth: JWT via handshake.auth.token; verify mit JwtService.
 * Single-Tenant aktuell — alle Connected joinen Room 'all'.
 * Multi-Tenant-Hook: resolveRoom() ändern auf `tenant:<id>`.
 *
 * No-Self-Event: Sender setzt X-Client-Id Header, Service
 * gibt diesen als origin_client_id durch. Receiver-Client
 * skipt wenn origin_client_id === eigener clientId.
 */
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';

export const GLOBAL_ROOM = 'all';

export function resolveRoom(_tenantId?: string | null): string {
  // PERF-1: Single-Tenant. Multi-Tenant-Stub.
  return GLOBAL_ROOM;
}

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  path: '/ws/realtime',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers?.authorization
          ?.toString()
          .replace(/^Bearer\s+/i, '') ??
          '');
      if (!token) {
        this.logger.warn('connect rejected — no token');
        socket.disconnect(true);
        return;
      }
      const secret = this.config.get<string>('JWT_SECRET');
      const payload = await this.jwt.verifyAsync(token, { secret });
      const userId = (payload as { sub?: string })?.sub;
      if (!userId) {
        socket.disconnect(true);
        return;
      }
      const room = resolveRoom();
      void socket.join(room);
      this.logger.log(
        `connect ok user=${userId} sid=${socket.id} room=${room}`,
      );
    } catch (err: any) {
      this.logger.warn(`connect rejected: ${err?.message ?? err}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    this.logger.log(`disconnect sid=${socket.id}`);
  }
}
