import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

/**
 * S-3b-1: POST /workspace-layouts.
 *
 * layout_json bleibt absichtlich opak (IsObject) — der FE-Shape ist
 * SerializedDockview von dockview, dessen Format kann sich in
 * Folge-Sprints aendern. Server nimmt JSON entgegen + serialisiert
 * 1:1 in JSONB. Validation der dockview-Struktur ist FE-Verantwortung
 * (apiVersion-Wrapper in S-3a wird Backend-Layout entsprechend
 * erweitert in S-3b-2).
 */
export class CreateWorkspaceLayoutDto {
  @IsString()
  @Length(1, 40)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'workspace muss kleinbuchstaben/Ziffern/_/- enthalten.',
  })
  workspace!: string;

  @IsString()
  @Length(1, 120)
  layout_name!: string;

  @IsObject()
  layout_json!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
