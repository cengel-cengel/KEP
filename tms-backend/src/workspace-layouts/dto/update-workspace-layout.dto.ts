import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

/**
 * S-3b-1: PATCH /workspace-layouts/:id.
 *
 * Alles optional — partial-update. workspace bleibt UNVERAENDERLICH
 * (kein Feld hier), weil das im URL-Scope der Layout-Identitaet
 * gehoert: ein Layout zieht nicht von workspace=nv nach fv um —
 * dafuer waere ein neues Layout anzulegen.
 */
export class UpdateWorkspaceLayoutDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  layout_name?: string;

  @IsOptional()
  @IsObject()
  layout_json?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
