-- Administrative account controls plus a realistic staging dataset for VARANGYM dashboards.
-- Everything is idempotent so Railway can safely run migrations on every deploy.

CREATE TABLE IF NOT EXISTS account_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('email','ip')),
  value_norm text NOT NULL,
  reason text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS account_bans_active_unique
  ON account_bans(kind,value_norm) WHERE active=true;
CREATE INDEX IF NOT EXISTS account_bans_lookup_idx ON account_bans(kind,value_norm,active);

CREATE OR REPLACE FUNCTION varangym_enforce_email_ban()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM account_bans b
     WHERE b.kind='email' AND b.active=true
       AND (b.expires_at IS NULL OR b.expires_at>now())
       AND b.value_norm=lower(trim(NEW.email))
  ) THEN
    RAISE EXCEPTION 'email is banned' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS varangym_users_email_ban ON users;
CREATE TRIGGER varangym_users_email_ban
BEFORE INSERT OR UPDATE OF email ON users
FOR EACH ROW EXECUTE FUNCTION varangym_enforce_email_ban();

CREATE OR REPLACE FUNCTION varangym_enforce_ip_ban()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ip_hint IS NOT NULL AND EXISTS (
    SELECT 1 FROM account_bans b
     WHERE b.kind='ip' AND b.active=true
       AND (b.expires_at IS NULL OR b.expires_at>now())
       AND b.value_norm=lower(trim(NEW.ip_hint))
  ) THEN
    RAISE EXCEPTION 'ip is banned' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS varangym_sessions_ip_ban ON sessions;
CREATE TRIGGER varangym_sessions_ip_ban
BEFORE INSERT OR UPDATE OF ip_hint ON sessions
FOR EACH ROW EXECUTE FUNCTION varangym_enforce_ip_ban();

-- 10 athlete accounts used only as realistic dashboard/test data.
INSERT INTO users(id,display_name,email,status,locale,is_platform_admin,created_at)
VALUES
 ('10000000-0000-0000-0000-000000000001','Anna Kovalenko','demo.anna@varangym.test','active','uk',false,now()-interval '170 days'),
 ('10000000-0000-0000-0000-000000000002','Maksym Bondar','demo.maksym@varangym.test','active','uk',false,now()-interval '155 days'),
 ('10000000-0000-0000-0000-000000000003','Sofia Melnyk','demo.sofia@varangym.test','active','uk',false,now()-interval '142 days'),
 ('10000000-0000-0000-0000-000000000004','Andrii Shevchenko','demo.andrii@varangym.test','active','uk',false,now()-interval '128 days'),
 ('10000000-0000-0000-0000-000000000005','Olena Kravets','demo.olena@varangym.test','active','uk',false,now()-interval '114 days'),
 ('10000000-0000-0000-0000-000000000006','Taras Hnatiuk','demo.taras@varangym.test','active','uk',false,now()-interval '96 days'),
 ('10000000-0000-0000-0000-000000000007','Yuliia Romanenko','demo.yuliia@varangym.test','active','uk',false,now()-interval '81 days'),
 ('10000000-0000-0000-0000-000000000008','Bohdan Savchuk','demo.bohdan@varangym.test','active','uk',false,now()-interval '67 days'),
 ('10000000-0000-0000-0000-000000000009','Marta Danylchuk','demo.marta@varangym.test','active','uk',false,now()-interval '46 days'),
 ('10000000-0000-0000-0000-000000000010','Vlad Moroz','demo.vlad@varangym.test','active','uk',false,now()-interval '25 days'),
 ('20000000-0000-0000-0000-000000000001','Coach Kiril','demo.coach@varangym.test','active','uk',false,now()-interval '190 days'),
 ('30000000-0000-0000-0000-000000000001','Rangers Gym Owner','demo.owner@varangym.test','active','uk',false,now()-interval '220 days'),
 ('30000000-0000-0000-0000-000000000002','Trainer Oleksii','demo.trainer1@varangym.test','active','uk',false,now()-interval '185 days'),
 ('30000000-0000-0000-0000-000000000003','Trainer Iryna','demo.trainer2@varangym.test','active','uk',false,now()-interval '176 days')
ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name,email=EXCLUDED.email,locale=EXCLUDED.locale;

INSERT INTO workspaces(id,type,name,slug,status,created_at)
VALUES
 ('40000000-0000-0000-0000-000000000001','independent_trainer','Kiril Coaching','demo-kiril-coaching','active',now()-interval '190 days'),
 ('40000000-0000-0000-0000-000000000002','organization','Rangers Performance Club','demo-rangers-performance','active',now()-interval '220 days')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,status='active';

INSERT INTO organization_profiles(workspace_id,legal_name,default_locale,timezone)
VALUES('40000000-0000-0000-0000-000000000002','Rangers Performance Club','uk','Europe/Kyiv')
ON CONFLICT(workspace_id) DO UPDATE SET legal_name=EXCLUDED.legal_name,default_locale=EXCLUDED.default_locale;

INSERT INTO workspace_memberships(workspace_id,user_id,role,status)
SELECT * FROM (VALUES
 ('40000000-0000-0000-0000-000000000001'::uuid,'20000000-0000-0000-0000-000000000001'::uuid,'owner','active'),
 ('40000000-0000-0000-0000-000000000001'::uuid,'20000000-0000-0000-0000-000000000001'::uuid,'trainer','active'),
 ('40000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000001'::uuid,'client','active'),
 ('40000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,'client','active'),
 ('40000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'client','active'),
 ('40000000-0000-0000-0000-000000000002'::uuid,'30000000-0000-0000-0000-000000000001'::uuid,'owner','active'),
 ('40000000-0000-0000-0000-000000000002'::uuid,'30000000-0000-0000-0000-000000000002'::uuid,'trainer','active'),
 ('40000000-0000-0000-0000-000000000002'::uuid,'30000000-0000-0000-0000-000000000003'::uuid,'trainer','active'),
 ('40000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000004'::uuid,'client','active'),
 ('40000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000005'::uuid,'client','active')
) AS x(workspace_id,user_id,role,status)
WHERE NOT EXISTS (
 SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=x.workspace_id AND m.user_id=x.user_id AND m.role=x.role AND m.status='active' AND m.ended_at IS NULL
);

INSERT INTO trainer_client_links(workspace_id,trainer_user_id,client_user_id,relationship_type,status,started_at)
SELECT * FROM (VALUES
 ('40000000-0000-0000-0000-000000000001'::uuid,'20000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000001'::uuid,'primary','active',now()-interval '140 days'),
 ('40000000-0000-0000-0000-000000000001'::uuid,'20000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid,'primary','active',now()-interval '120 days'),
 ('40000000-0000-0000-0000-000000000001'::uuid,'20000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'primary','active',now()-interval '100 days'),
 ('40000000-0000-0000-0000-000000000002'::uuid,'30000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000004'::uuid,'primary','active',now()-interval '90 days'),
 ('40000000-0000-0000-0000-000000000002'::uuid,'30000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000005'::uuid,'primary','active',now()-interval '80 days')
) AS x(workspace_id,trainer_user_id,client_user_id,relationship_type,status,started_at)
WHERE NOT EXISTS (
 SELECT 1 FROM trainer_client_links l WHERE l.workspace_id=x.workspace_id AND l.client_user_id=x.client_user_id AND l.relationship_type='primary' AND l.status='active'
);

-- Demo sessions make last-seen/device/IP and active-user metrics meaningful.
INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at,user_agent,ip_hint)
SELECT 'varangym-demo-session-'||n,
       ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
       now()-interval '20 days',now()+interval '365 days',now()-(n||' hours')::interval,
       CASE WHEN n%2=0 THEN 'VARANGYM iOS Demo / iPhone' ELSE 'VARANGYM Android Demo / Pixel' END,
       '198.51.100.'||(20+n)
FROM generate_series(1,10) n
ON CONFLICT(token_hash) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at,user_agent=EXCLUDED.user_agent,ip_hint=EXCLUDED.ip_hint;

-- Build realistic openGym states. The existing progress-mirror trigger turns these into
-- normalized workouts/bodyweights used by coach, business and platform analytics.
CREATE OR REPLACE FUNCTION varangym_demo_profile(seed integer, female boolean)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  arr jsonb := '[]'::jsonb;
  weights jsonb := '[]'::jsonb;
  i integer;
  d date;
  start_ms bigint;
  count_w integer := 10 + (seed % 7);
  base numeric := 28 + seed * 2;
BEGIN
  FOR i IN 0..count_w LOOP
    d := current_date - ((count_w-i)*5 + (seed%3));
    start_ms := (extract(epoch FROM (d::timestamptz + interval '18 hours'))*1000)::bigint;
    arr := arr || jsonb_build_array(jsonb_build_object(
      'id','demo-'||seed||'-'||i,
      'd',to_char(d,'YYYY-MM-DD'),
      'start',start_ms,
      'end',start_ms+3900000,
      'name',CASE i%3 WHEN 0 THEN 'Push Day' WHEN 1 THEN 'Pull Day' ELSE 'Full Body' END,
      'entries',jsonb_build_array(
        jsonb_build_object('id',CASE WHEN female AND i%2=0 THEN '0001' ELSE '3294' END,'sets',jsonb_build_array(
          jsonb_build_object('w',round(base+i*0.8,1),'r',12,'done',true),
          jsonb_build_object('w',round(base+i*0.8,1),'r',10,'done',true),
          jsonb_build_object('w',round(base+i*0.6,1),'r',9,'done',true))),
        jsonb_build_object('id','0007','sets',jsonb_build_array(
          jsonb_build_object('w',round(base+8+i*0.9,1),'r',12,'done',true),
          jsonb_build_object('w',round(base+8+i*0.9,1),'r',10,'done',true),
          jsonb_build_object('w',round(base+6+i*0.7,1),'r',10,'done',true))),
        jsonb_build_object('id','0003','sets',jsonb_build_array(
          jsonb_build_object('w',0,'r',20+i%5,'done',true),
          jsonb_build_object('w',0,'r',18+i%4,'done',true)))
      )
    ));
  END LOOP;
  FOR i IN 0..5 LOOP
    d := current_date - (75-i*15);
    weights := weights || jsonb_build_array(jsonb_build_object(
      'd',to_char(d,'YYYY-MM-DD'),
      't',(extract(epoch FROM d::timestamptz)*1000)::bigint,
      'w',round((64+seed*1.35+i*0.35)::numeric,1)
    ));
  END LOOP;
  RETURN jsonb_build_object(
    'lang','uk','unit','kg','body',CASE WHEN female THEN 'female' ELSE 'male' END,
    'wdec',1,'weekStart',1,'targetW',round((67+seed*1.25)::numeric,1),
    'workouts',arr,'bodyweight',weights,'routines','[]'::jsonb,'customEx','[]'::jsonb
  );
END;
$$;

INSERT INTO user_profile_states(user_id,state,updated_at)
SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
       varangym_demo_profile(n,n IN (1,3,5,7,9)),now()
FROM generate_series(1,10) n
ON CONFLICT(user_id) DO UPDATE SET state=EXCLUDED.state,updated_at=now();
DROP FUNCTION varangym_demo_profile(integer,boolean);

-- Commercial state: solo, coach and organization plans plus paid history so MRR/revenue/ARPU
-- are non-zero and every dashboard visualization has real-looking data to work with.
INSERT INTO billing_subject_settings(subject_type,subject_id,plan_code,lifetime_access,billing_email,metadata)
VALUES
 ('user','10000000-0000-0000-0000-000000000001','solo_monthly',false,'demo.anna@varangym.test','{"demo":true}'),
 ('user','10000000-0000-0000-0000-000000000002','solo_lifetime',true,'demo.maksym@varangym.test','{"demo":true}'),
 ('user','10000000-0000-0000-0000-000000000003','solo_monthly',false,'demo.sofia@varangym.test','{"demo":true,"trial":true}'),
 ('user','10000000-0000-0000-0000-000000000006','solo_monthly',false,'demo.taras@varangym.test','{"demo":true}'),
 ('user','10000000-0000-0000-0000-000000000008','solo_monthly',false,'demo.bohdan@varangym.test','{"demo":true}'),
 ('workspace','40000000-0000-0000-0000-000000000001','coach_5',false,'demo.coach@varangym.test','{"demo":true}'),
 ('workspace','40000000-0000-0000-0000-000000000002','business_5_50',false,'demo.owner@varangym.test','{"demo":true}')
ON CONFLICT(subject_type,subject_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,lifetime_access=EXCLUDED.lifetime_access,billing_email=EXCLUDED.billing_email,metadata=billing_subject_settings.metadata||EXCLUDED.metadata,updated_at=now();

INSERT INTO subscriptions(id,subject_type,subject_id,provider,provider_subscription_id,plan_code,status,current_period_end,trial_ends_at,quantity,metadata,created_at,updated_at)
VALUES
 ('51000000-0000-0000-0000-000000000001','user','10000000-0000-0000-0000-000000000001','demo','demo-sub-anna','solo_monthly','active',now()+interval '20 days',NULL,1,'{"demo":true}',now()-interval '100 days',now()),
 ('51000000-0000-0000-0000-000000000002','user','10000000-0000-0000-0000-000000000002','demo','demo-sub-maksym','solo_lifetime','active',NULL,NULL,1,'{"demo":true}',now()-interval '90 days',now()),
 ('51000000-0000-0000-0000-000000000003','user','10000000-0000-0000-0000-000000000003','demo','demo-sub-sofia','solo_monthly','trialing',now()+interval '19 days',now()+interval '19 days',1,'{"demo":true}',now()-interval '11 days',now()),
 ('51000000-0000-0000-0000-000000000004','user','10000000-0000-0000-0000-000000000006','demo','demo-sub-taras','solo_monthly','active',now()+interval '12 days',NULL,1,'{"demo":true}',now()-interval '70 days',now()),
 ('51000000-0000-0000-0000-000000000005','user','10000000-0000-0000-0000-000000000008','demo','demo-sub-bohdan','solo_monthly','active',now()+interval '25 days',NULL,1,'{"demo":true}',now()-interval '55 days',now()),
 ('51000000-0000-0000-0000-000000000006','workspace','40000000-0000-0000-0000-000000000001','demo','demo-sub-coach','coach_5','active',now()+interval '16 days',NULL,1,'{"demo":true}',now()-interval '130 days',now()),
 ('51000000-0000-0000-0000-000000000007','workspace','40000000-0000-0000-0000-000000000002','demo','demo-sub-business','business_5_50','active',now()+interval '9 days',NULL,1,'{"demo":true}',now()-interval '150 days',now())
ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,current_period_end=EXCLUDED.current_period_end,trial_ends_at=EXCLUDED.trial_ends_at,updated_at=now();

INSERT INTO payments(provider,provider_payment_id,subject_type,subject_id,plan_code,amount_cents,currency,status,paid_at,metadata,created_at)
SELECT 'demo','demo-pay-solo-'||m,'user','10000000-0000-0000-0000-000000000001','solo_monthly',200,'USD','paid',date_trunc('month',now())-(m||' months')::interval+interval '3 days','{"demo":true}',date_trunc('month',now())-(m||' months')::interval+interval '3 days'
FROM generate_series(0,3) m
ON CONFLICT(provider,provider_payment_id) WHERE provider_payment_id IS NOT NULL DO NOTHING;
INSERT INTO payments(provider,provider_payment_id,subject_type,subject_id,plan_code,amount_cents,currency,status,paid_at,metadata,created_at)
SELECT 'demo','demo-pay-coach-'||m,'workspace','40000000-0000-0000-0000-000000000001','coach_5',500,'USD','paid',date_trunc('month',now())-(m||' months')::interval+interval '5 days','{"demo":true}',date_trunc('month',now())-(m||' months')::interval+interval '5 days'
FROM generate_series(0,3) m
ON CONFLICT(provider,provider_payment_id) WHERE provider_payment_id IS NOT NULL DO NOTHING;
INSERT INTO payments(provider,provider_payment_id,subject_type,subject_id,plan_code,amount_cents,currency,status,paid_at,metadata,created_at)
SELECT 'demo','demo-pay-business-'||m,'workspace','40000000-0000-0000-0000-000000000002','business_5_50',5000,'USD','paid',date_trunc('month',now())-(m||' months')::interval+interval '7 days','{"demo":true}',date_trunc('month',now())-(m||' months')::interval+interval '7 days'
FROM generate_series(0,4) m
ON CONFLICT(provider,provider_payment_id) WHERE provider_payment_id IS NOT NULL DO NOTHING;
INSERT INTO payments(provider,provider_payment_id,subject_type,subject_id,plan_code,amount_cents,currency,status,paid_at,metadata,created_at)
VALUES('demo','demo-pay-lifetime','user','10000000-0000-0000-0000-000000000002','solo_lifetime',3000,'USD','paid',now()-interval '45 days','{"demo":true}',now()-interval '45 days')
ON CONFLICT(provider,provider_payment_id) WHERE provider_payment_id IS NOT NULL DO NOTHING;
