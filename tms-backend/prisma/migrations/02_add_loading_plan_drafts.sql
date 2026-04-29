-- Sprint 12.1: Persistente 2D-Feinplatzierung (Beladeplan-Draft)

CREATE TABLE IF NOT EXISTS loading_plan_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tour_id)
);

CREATE TABLE IF NOT EXISTS loading_plan_draft_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES loading_plan_drafts(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  x_pos_cm INTEGER NOT NULL DEFAULT 0,
  y_pos_cm INTEGER NOT NULL DEFAULT 0,
  rotation_angle INTEGER NOT NULL DEFAULT 0,
  stack_level INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (draft_id, shipment_id)
);

CREATE INDEX IF NOT EXISTS idx_loading_plan_drafts_tour
  ON loading_plan_drafts(tour_id);

CREATE INDEX IF NOT EXISTS idx_loading_plan_draft_items_draft
  ON loading_plan_draft_items(draft_id);

