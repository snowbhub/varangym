-- One-time staging bootstrap for the first VARANGYM platform administrator.
-- The clear invite code is intentionally NOT stored in the repository; only its SHA-256 hash is.
-- Once a platform admin exists this migration has no further effect.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE is_platform_admin=true AND status='active'
  ) AND NOT EXISTS (
    SELECT 1 FROM invites
     WHERE token_hash='87986fdd01981b48532fc73f550e2773dc586d6a71d110309ec32538ce9fce34'
  ) THEN
    INSERT INTO invites(token_hash,target_role,max_uses,use_count,expires_at,metadata)
    VALUES (
      '87986fdd01981b48532fc73f550e2773dc586d6a71d110309ec32538ce9fce34',
      'platform_admin',
      1,
      0,
      now()+interval '7 days',
      '{"source":"staging-bootstrap"}'::jsonb
    );
  END IF;
END $$;
