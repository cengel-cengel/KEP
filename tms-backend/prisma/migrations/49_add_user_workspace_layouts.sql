-- S-3b-1: User-Workspace-Layouts (Backend-Persistenz fuer Dock-Layouts).
-- Datei: prisma/migrations/49_add_user_workspace_layouts.sql
-- Quelle: prisma/schema.prisma (model user_workspace_layouts)
--
-- Persistiert benannte Dock-Layouts pro User+Workspace ("nv", "fv", …).
-- Loest die bisherige localStorage-only-Loesung (S-3a) ab und macht
-- Layouts geraete-uebergreifend.
--
-- Idempotent via IF NOT EXISTS — wiederholtes Anwenden = no-op.
-- Cascade an User (gleiche Konvention wie user_ui_preferences):
-- User-Loeschung raeumt seine Layouts mit weg.
--
-- Constraints:
--   * uq_…_user_workspace_name  : kein Doppel-Name pro (User, Workspace).
--   * uq_…_one_default          : max. 1 Default-Layout pro (User, Workspace)
--                                  als PARTIAL UNIQUE (WHERE is_default).

CREATE TABLE IF NOT EXISTS user_workspace_layouts (
  id           UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID           NOT NULL,
  workspace    VARCHAR(40)    NOT NULL,
  layout_name  VARCHAR(120)   NOT NULL,
  layout_json  JSONB          NOT NULL,
  is_default   BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_user_workspace_layouts_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_workspace_layouts_user_workspace_name
  ON user_workspace_layouts (user_id, workspace, layout_name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_workspace_layouts_one_default
  ON user_workspace_layouts (user_id, workspace)
  WHERE is_default = TRUE;
