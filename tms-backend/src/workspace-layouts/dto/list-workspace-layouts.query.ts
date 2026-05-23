import { IsString, Length, Matches } from 'class-validator';

/**
 * S-3b-1: Query-DTO fuer GET /workspace-layouts?workspace=…
 *
 * workspace ist ein Slug ("nv", "fv", …) — kleinbuchstaben,
 * a-z + 0-9 + '-' + '_'. Laenge analog zur Spalte
 * user_workspace_layouts.workspace VARCHAR(40).
 */
export class ListWorkspaceLayoutsQuery {
  @IsString()
  @Length(1, 40)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'workspace muss kleinbuchstaben/Ziffern/_/- enthalten.',
  })
  workspace!: string;
}
