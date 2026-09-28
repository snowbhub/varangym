-- Staging-only fallback invite for initial VARANGYM platform administration.
-- Only the SHA-256 hash is stored in Git. The clear code is held out of the repository.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE is_platform_admin=true AND status='active'
  ) AND NOT EXISTS (
    SELECT 1 FROM invites
     WHERE token_hash='99997a8483e20d145e0d5bd676a85b0c16a49c77c2661abb07fda4806f37a08c'
  ) THEN
    INSERT INTO invites(token_hash,target_role,max_uses,use_count,expires_at,metadata)
    VALUES (
      '99997a8483e20d145e0d5bd676a85b0c16a49c77c2661abb07fda4806f37a08c',
      'platform_admin',
      1,
      0,
      now()+interval '7 days',
      '{"source":"staging-bootstrap-refresh"}'::jsonb
    );
  END IF;
END $$;
