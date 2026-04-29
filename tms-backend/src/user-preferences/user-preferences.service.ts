import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShipmentsPageVisibleColumnsDto } from './dto/shipments-page-visible-columns.dto';
import { ShipmentsPageColumnWidthsDto } from './dto/shipments-page-column-widths.dto';

@Injectable()
export class UserPreferencesService {
  private readonly shipmentsPageVisibleColumnsKey = 'shipmentsPage.visibleColumns.v1';
  private readonly shipmentsPageColumnWidthsKey = 'shipmentsPage.columnWidths.v1';

  constructor(private readonly prisma: PrismaService) {}

  async getShipmentsPageVisibleColumns(userId: string): Promise<string[] | null> {
    const pref = await this.prisma.user_ui_preferences.findUnique({
      where: { user_id_key: { user_id: userId, key: this.shipmentsPageVisibleColumnsKey } },
      select: { value: true },
    });

    const v = pref?.value as unknown;
    if (!v) return null;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
    return null;
  }

  async upsertShipmentsPageVisibleColumns(
    userId: string,
    dto: ShipmentsPageVisibleColumnsDto,
  ): Promise<string[]> {
    await this.prisma.user_ui_preferences.upsert({
      where: { user_id_key: { user_id: userId, key: this.shipmentsPageVisibleColumnsKey } },
      update: { value: dto.columns, updated_at: new Date() },
      create: {
        user_id: userId,
        key: this.shipmentsPageVisibleColumnsKey,
        value: dto.columns,
      },
    });

    return dto.columns;
  }

  async getShipmentsPageColumnWidths(
    userId: string,
  ): Promise<Record<string, number> | null> {
    const pref = await this.prisma.user_ui_preferences.findUnique({
      where: { user_id_key: { user_id: userId, key: this.shipmentsPageColumnWidthsKey } },
      select: { value: true },
    });

    const v = pref?.value as unknown;
    if (!v || typeof v !== 'object') return null;
    const obj = v as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, raw] of Object.entries(obj)) {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isNaN(n) && Number.isFinite(n)) out[k] = n;
    }
    return Object.keys(out).length ? out : null;
  }

  async upsertShipmentsPageColumnWidths(
    userId: string,
    dto: ShipmentsPageColumnWidthsDto,
  ): Promise<Record<string, number>> {
    const cleaned: Record<string, number> = {};
    for (const [k, raw] of Object.entries(dto.columnWidths ?? {})) {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isNaN(n) && Number.isFinite(n)) cleaned[k] = n;
    }

    await this.prisma.user_ui_preferences.upsert({
      where: { user_id_key: { user_id: userId, key: this.shipmentsPageColumnWidthsKey } },
      update: { value: cleaned, updated_at: new Date() },
      create: {
        user_id: userId,
        key: this.shipmentsPageColumnWidthsKey,
        value: cleaned,
      },
    });

    return cleaned;
  }
}

