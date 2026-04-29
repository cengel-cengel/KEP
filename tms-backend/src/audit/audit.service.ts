import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

export interface AuditLogEntry {
  tableName: string;
  recordId: string;
  action: AuditAction;
  oldValues?: unknown;
  newValues?: unknown;
  userId?: string;
  userIp?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, user_id, user_ip)
      VALUES (
        ${entry.tableName},
        ${entry.recordId}::uuid,
        ${entry.action}::audit_action,
        ${entry.oldValues === undefined ? null : JSON.stringify(entry.oldValues)}::jsonb,
        ${entry.newValues === undefined ? null : JSON.stringify(entry.newValues)}::jsonb,
        ${entry.userId ?? null}::uuid,
        ${entry.userIp ?? null}::inet
      )
    `;
  }
}
