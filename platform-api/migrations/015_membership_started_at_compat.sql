-- Several platform analytics/provisioning queries expose membership start time explicitly.
-- Older foundation databases only had created_at. Keep both names so existing installs migrate
-- without rewriting historical timestamps.
ALTER TABLE workspace_memberships
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

UPDATE workspace_memberships
   SET started_at=created_at
 WHERE started_at IS NULL;

ALTER TABLE workspace_memberships
  ALTER COLUMN started_at SET DEFAULT now();

ALTER TABLE workspace_memberships
  ALTER COLUMN started_at SET NOT NULL;
