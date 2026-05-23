import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceLayoutDto } from './dto/create-workspace-layout.dto';
import { UpdateWorkspaceLayoutDto } from './dto/update-workspace-layout.dto';

/**
 * S-3b-1 Workspace-Layouts Service.
 *
 * Persistenz fuer Dock-Layouts pro User+Workspace (z.B. workspace
 * "nv"/"fv"). Loest die localStorage-only-Loesung aus S-3a ab und
 * macht Layouts geraete-uebergreifend.
 *
 * Sicherheits-Konvention (KRITISCH):
 *   JEDE Query filtert mit user_id=ownerId. User A darf NIE
 *   Layouts von User B sehen oder aendern. Wir machen das nicht
 *   ueber einen Prisma-Middleware-Hack, sondern explizit per Query —
 *   sichtbarer im Code-Review, schwerer zu vergessen, einfacher
 *   zu testen.
 *
 * is_default-Constraint:
 *   Max. 1 Default pro (User, Workspace). Wenn jemand ein zweites
 *   Layout auf is_default=true setzt, wuerde die DB-PARTIAL-UNIQUE
 *   einen Insert/Update werfen. Wir bauen das in einer Prisma-
 *   $transaction ab: erst alle anderen des Users im Workspace
 *   auf false, dann das Ziel-Layout auf true. So gibt's KEIN
 *   Zwischen-State mit 2 Defaults.
 */
@Injectable()
export class WorkspaceLayoutsService {
  private readonly logger = new Logger(WorkspaceLayoutsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Eigene Layouts des Users fuer den gegebenen Workspace-Slug.
   * Defaults zuerst, dann alphabetisch nach Name.
   */
  async list(ownerId: string, workspace: string) {
    return this.prisma.user_workspace_layouts.findMany({
      where: { user_id: ownerId, workspace },
      orderBy: [{ is_default: 'desc' }, { layout_name: 'asc' }],
    });
  }

  async create(ownerId: string, dto: CreateWorkspaceLayoutDto) {
    const wantDefault = dto.is_default === true;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (wantDefault) {
          // Andere des Users im Workspace zuerst zurueck-setzen,
          // damit der PARTIAL-UNIQUE-Index (user_id, workspace
          // WHERE is_default) nicht gegen den neuen Insert
          // kollidiert.
          await tx.user_workspace_layouts.updateMany({
            where: {
              user_id: ownerId,
              workspace: dto.workspace,
              is_default: true,
            },
            data: { is_default: false },
          });
        }
        return tx.user_workspace_layouts.create({
          data: {
            user_id: ownerId,
            workspace: dto.workspace,
            layout_name: dto.layout_name,
            layout_json: dto.layout_json as Prisma.InputJsonValue,
            is_default: wantDefault,
          },
        });
      });
    } catch (e) {
      this.handlePrismaError(e);
      throw e;
    }
  }

  async update(ownerId: string, id: string, dto: UpdateWorkspaceLayoutDto) {
    // Existence + Ownership in EINEM Schritt — wenn Owner nicht
    // matcht, sieht der Anrufer "Nicht gefunden" (nicht "Forbidden") —
    // verraet einem anderen User die Existenz fremder IDs nicht.
    const existing = await this.prisma.user_workspace_layouts.findFirst({
      where: { id, user_id: ownerId },
    });
    if (!existing) {
      throw new NotFoundException('Layout nicht gefunden.');
    }

    const wantDefault = dto.is_default === true;
    const dropDefault = dto.is_default === false;

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (wantDefault) {
          // Andere des Users im SELBEN workspace auf false.
          // Ziel-Layout-id explizit ausschliessen, damit wir
          // nicht das eigene Default-Flag direkt wieder kippen.
          await tx.user_workspace_layouts.updateMany({
            where: {
              user_id: ownerId,
              workspace: existing.workspace,
              is_default: true,
              NOT: { id },
            },
            data: { is_default: false },
          });
        }
        const data: Prisma.user_workspace_layoutsUpdateInput = {
          updated_at: new Date(),
        };
        if (dto.layout_name !== undefined) data.layout_name = dto.layout_name;
        if (dto.layout_json !== undefined) {
          data.layout_json = dto.layout_json as Prisma.InputJsonValue;
        }
        if (wantDefault) data.is_default = true;
        else if (dropDefault) data.is_default = false;

        return tx.user_workspace_layouts.update({
          where: { id },
          data,
        });
      });
    } catch (e) {
      this.handlePrismaError(e);
      throw e;
    }
  }

  async remove(ownerId: string, id: string) {
    // Ownership-Check via WHERE { id, user_id } — wenn nicht eigen:
    // 404 (siehe update-Kommentar zur Begruendung).
    const res = await this.prisma.user_workspace_layouts.deleteMany({
      where: { id, user_id: ownerId },
    });
    if (res.count === 0) {
      throw new NotFoundException('Layout nicht gefunden.');
    }
    return { ok: true };
  }

  private handlePrismaError(e: unknown): void {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      // Unique-Constraint: entweder (user_id, workspace, layout_name)
      // oder (user_id, workspace) WHERE is_default. Beides bedeutet
      // "der Name existiert schon" / "Default-Race".
      throw new ConflictException(
        'Ein Layout mit diesem Namen existiert bereits in diesem Workspace.',
      );
    }
    // unbekannter Fehler — durchreichen + loggen.
    this.logger.warn('Workspace-Layouts: unerwarteter Prisma-Fehler.', e);
  }
}
