-- Sprint 11: User-UI-Preferences
-- Datei: prisma/migrations/17_add_user_ui_preferences.sql
-- Quelle: prisma/schema.prisma (model user_ui_preferences)
--
-- Persistiert UI-Settings pro User+Key (z. B. Tabellenspalten,
-- Filter-Voreinstellungen, Tab-State). Settings sollen mit dem
-- User wegrutschen → ON DELETE CASCADE.

CREATE TABLE IF NOT EXISTS user_ui_preferences (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID         NOT NULL,
  key        VARCHAR(200) NOT NULL,
  value      JSONB        NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_user_ui_preferences_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_ui_preferences_user_id_key
  ON user_ui_preferences (user_id, key);
