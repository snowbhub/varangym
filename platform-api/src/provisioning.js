import { encryptInviteCode, inviteCode, inviteHash, slugify } from './security.js';

export const PLATFORM_DIRECT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

export function inviteIsUsable(invite) {
  if (!invite) return false;
  if (invite.revoked_at) return false;
  if (Number(invite.use_count) >= Number(invite.max_uses)) return false;
  if (new Date(invite.expires_at).getTime() <= Date.now()) return false;
  return true;
}

export async function loadInviteByCode(db, code, { lock = false } = {}) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const { rows } = await db.query(
    `SELECT * FROM invites WHERE token_hash=$1${suffix}`,
    [inviteHash(code)]
  );
  return rows[0] || null;
}

async function uniqueWorkspaceSlug(db, name) {
  const base = slugify(name);
  for (let i = 0; i < 20; i += 1) {
    const suffix = i === 0 ? '' : `-${Math.random().toString(36).slice(2, 6)}`;
    const slug = `${base}${suffix}`.slice(0, 60);
    const exists = await db.query('SELECT 1 FROM workspaces WHERE slug=$1', [slug]);
    if (!exists.rowCount) return slug;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 60);
}

async function addMembership(db, workspaceId, userId, role) {
  await db.query(
    `INSERT INTO workspace_memberships(workspace_id,user_id,role,status)
     VALUES ($1,$2,$3,'active')
     ON CONFLICT DO NOTHING`,
    [workspaceId, userId, role]
  );
}

async function claimPaidSoloGrant(db, invite, user) {
  const { rows } = await db.query(
    `SELECT g.*,p.billing_kind,p.interval_unit
       FROM checkout_grants g JOIN billing_plans p ON p.code=g.plan_code
      WHERE g.invite_id=$1 AND g.status='paid' FOR UPDATE`,
    [invite.id]
  );
  const grant = rows[0];
  if (!grant) return;

  await db.query(
    `INSERT INTO billing_subject_settings(subject_type,subject_id,plan_code,lifetime_access,billing_email,metadata,updated_at)
     VALUES ('user',$1,$2,$3,$4,$5::jsonb,now())
     ON CONFLICT(subject_type,subject_id) DO UPDATE SET
       plan_code=EXCLUDED.plan_code,lifetime_access=EXCLUDED.lifetime_access,
       billing_email=EXCLUDED.billing_email,metadata=billing_subject_settings.metadata||EXCLUDED.metadata,updated_at=now()`,
    [user.id, grant.plan_code, grant.billing_kind === 'lifetime', grant.email,
      JSON.stringify({ provider: grant.provider, checkoutId: grant.provider_checkout_id })]
  );

  let subscriptionId = null;
  if (grant.billing_kind === 'recurring' && grant.provider_subscription_id) {
    const r = await db.query(
      `INSERT INTO subscriptions(subject_type,subject_id,provider,provider_customer_id,provider_subscription_id,plan_code,status,metadata)
       VALUES ('user',$1,$2,$3,$4,$5,'active',$6::jsonb)
       ON CONFLICT(provider,provider_subscription_id) WHERE provider_subscription_id IS NOT NULL
       DO UPDATE SET subject_type=EXCLUDED.subject_type,subject_id=EXCLUDED.subject_id,plan_code=EXCLUDED.plan_code,status='active',updated_at=now()
       RETURNING id`,
      [user.id, grant.provider, grant.provider_customer_id, grant.provider_subscription_id, grant.plan_code,
        JSON.stringify({ checkoutId: grant.provider_checkout_id })]
    );
    subscriptionId = r.rows[0]?.id || null;
  }

  const paymentId = grant.provider_payment_id || `checkout:${grant.provider_checkout_id}`;
  await db.query(
    `INSERT INTO payments(provider,provider_payment_id,provider_checkout_id,subject_type,subject_id,plan_code,amount_cents,currency,status,paid_at,metadata)
     VALUES ($1,$2,$3,'user',$4,$5,$6,$7,'paid',COALESCE($8,now()),$9::jsonb)
     ON CONFLICT(provider,provider_payment_id) DO NOTHING`,
    [grant.provider,paymentId,grant.provider_checkout_id,user.id,grant.plan_code,grant.amount_cents,grant.currency,grant.completed_at,
      JSON.stringify({ source: 'checkout-grant-claim' })]
  );

  if (grant.billing_kind === 'lifetime' || subscriptionId) {
    await db.query(
      `INSERT INTO entitlements(subject_type,subject_id,key,value,source_subscription_id,starts_at,ends_at)
       VALUES ('user',$1,'access',$2::jsonb,$3,now(),NULL)
       ON CONFLICT(subject_type,subject_id,key) WHERE ends_at IS NULL
       DO UPDATE SET value=EXCLUDED.value,source_subscription_id=EXCLUDED.source_subscription_id,starts_at=now()`,
      [user.id, JSON.stringify({ enabled: true, audience: 'solo' }), subscriptionId]
    );
  }

  await db.query(`UPDATE checkout_grants SET status='claimed',claimed_at=now(),updated_at=now() WHERE id=$1`, [grant.id]);
}

export async function provisionFromInvite(db, invite, user) {
  const role = invite.target_role;
  const metadata = invite.metadata || {};
  let workspaceId = invite.workspace_id || null;

  if (role === 'platform_admin') {
    await db.query('UPDATE users SET is_platform_admin=true, updated_at=now() WHERE id=$1', [user.id]);
  } else if (role === 'solo_client') {
    workspaceId = PLATFORM_DIRECT_WORKSPACE_ID;
    await addMembership(db, workspaceId, user.id, 'client');
    await claimPaidSoloGrant(db, invite, user);
  } else if (role === 'independent_trainer') {
    const workspaceName = String(metadata.workspaceName || metadata.workspace_name || `${user.display_name} Coaching`).slice(0, 100);
    const slug = await uniqueWorkspaceSlug(db, workspaceName);
    const { rows } = await db.query(
      `INSERT INTO workspaces(type,name,slug,status)
       VALUES ('independent_trainer',$1,$2,'active') RETURNING id`,
      [workspaceName, slug]
    );
    workspaceId = rows[0].id;
    await addMembership(db, workspaceId, user.id, 'owner');
    await addMembership(db, workspaceId, user.id, 'trainer');
  } else if (role === 'organization_owner') {
    const workspaceName = String(metadata.organizationName || metadata.organization_name || metadata.workspaceName || user.display_name).slice(0, 100);
    const slug = await uniqueWorkspaceSlug(db, workspaceName);
    const { rows } = await db.query(
      `INSERT INTO workspaces(type,name,slug,status)
       VALUES ('organization',$1,$2,'active') RETURNING id`,
      [workspaceName, slug]
    );
    workspaceId = rows[0].id;
    await addMembership(db, workspaceId, user.id, 'owner');
    await db.query(
      `INSERT INTO organization_profiles(workspace_id,legal_name,default_locale,timezone)
       VALUES ($1,$2,$3,$4) ON CONFLICT (workspace_id) DO NOTHING`,
      [workspaceId, metadata.legalName || null, metadata.defaultLocale || user.locale || 'uk', metadata.timezone || 'Europe/Berlin']
    );
  } else if (role === 'organization_admin') {
    if (!workspaceId) throw new Error('organization admin invite has no workspace');
    await addMembership(db, workspaceId, user.id, 'admin');
  } else if (role === 'trainer') {
    if (!workspaceId) throw new Error('trainer invite has no workspace');
    await addMembership(db, workspaceId, user.id, 'trainer');
  } else if (role === 'client') {
    if (!workspaceId) throw new Error('client invite has no workspace');
    await addMembership(db, workspaceId, user.id, 'client');
    if (invite.trainer_user_id) {
      await db.query(
        `INSERT INTO trainer_client_links(workspace_id,trainer_user_id,client_user_id,relationship_type,status)
         VALUES ($1,$2,$3,'primary','active')
         ON CONFLICT DO NOTHING`,
        [workspaceId, invite.trainer_user_id, user.id]
      );
    }
  } else {
    throw new Error(`unsupported invite target role: ${role}`);
  }

  return { workspaceId, role };
}

export async function consumeInvite(db, inviteId, userId) {
  const { rows } = await db.query('SELECT * FROM invites WHERE id=$1 FOR UPDATE', [inviteId]);
  const invite = rows[0];
  if (!inviteIsUsable(invite)) throw Object.assign(new Error('invite is no longer valid'), { status: 403 });
  await db.query('UPDATE invites SET use_count=use_count+1 WHERE id=$1', [invite.id]);
  const userExists = await db.query('SELECT 1 FROM users WHERE id=$1', [userId]);
  if (userExists.rowCount) {
    await db.query('INSERT INTO invite_redemptions(invite_id,user_id) VALUES ($1,$2)', [invite.id, userId]);
  }
  return invite;
}

export async function membershipsFor(db, userId) {
  const { rows } = await db.query(
    `SELECT m.id,m.workspace_id,m.role,m.status,w.type AS workspace_type,w.name AS workspace_name,w.slug AS workspace_slug
       FROM workspace_memberships m
       JOIN workspaces w ON w.id=m.workspace_id
      WHERE m.user_id=$1 AND m.status='active' AND m.ended_at IS NULL
      ORDER BY w.name,m.role`,
    [userId]
  );
  return rows;
}

async function commercialCapacity(db, workspaceId) {
  const { rows } = await db.query(
    `SELECT s.plan_code,s.extra_trainers,p.audience,p.trainer_limit,p.client_limit,p.metadata,
            EXISTS(
              SELECT 1 FROM entitlements e
               WHERE e.subject_type='workspace' AND e.subject_id=s.subject_id AND e.key='access'
                 AND e.ends_at IS NULL AND COALESCE((e.value->>'enabled')::boolean,true)=true
            ) AS access_enabled
       FROM billing_subject_settings s
       JOIN billing_plans p ON p.code=s.plan_code
      WHERE s.subject_type='workspace' AND s.subject_id=$1`,
    [workspaceId]
  );
  const plan = rows[0];
  if (!plan || !plan.access_enabled) return null;
  const extra = Math.max(0, Number(plan.extra_trainers || 0));
  const extraClientsPerTrainer = Math.max(0, Number(plan.metadata?.clientsPerExtraTrainer || 0));
  return {
    planCode: plan.plan_code,
    trainerLimit: plan.trainer_limit == null ? null : Number(plan.trainer_limit) + extra,
    clientLimit: plan.client_limit == null ? null : Number(plan.client_limit) + extra * extraClientsPerTrainer
  };
}

async function pendingInviteSeats(db, workspaceId, targetRole) {
  const { rows } = await db.query(
    `SELECT COALESCE(sum(GREATEST(max_uses-use_count,0)),0)::int AS seats
       FROM invites
      WHERE workspace_id=$1 AND target_role=$2 AND revoked_at IS NULL AND expires_at>now() AND use_count<max_uses`,
    [workspaceId, targetRole]
  );
  return Number(rows[0]?.seats || 0);
}

async function enforceCommercialCapacity(db, actor, workspaceId, targetRole, requestedSeats) {
  if (actor.is_platform_admin || !workspaceId || !['client','trainer'].includes(targetRole)) return;
  const { rows: wsRows } = await db.query(`SELECT type FROM workspaces WHERE id=$1 AND status='active'`, [workspaceId]);
  const workspace = wsRows[0];
  if (!workspace) throw Object.assign(new Error('workspace not found'), { status: 404 });
  if (!['independent_trainer','organization'].includes(workspace.type)) return;

  const cap = await commercialCapacity(db, workspaceId);
  if (!cap) {
    throw Object.assign(new Error('active Coach or Business subscription required'), { status: 402, code: 'SUBSCRIPTION_REQUIRED' });
  }

  if (targetRole === 'trainer' && cap.trainerLimit != null) {
    const active = Number((await db.query(
      `SELECT count(DISTINCT user_id)::int AS n FROM workspace_memberships
        WHERE workspace_id=$1 AND role='trainer' AND status='active' AND ended_at IS NULL`, [workspaceId]
    )).rows[0]?.n || 0);
    const reserved = await pendingInviteSeats(db, workspaceId, 'trainer');
    if (active + reserved + requestedSeats > cap.trainerLimit) {
      throw Object.assign(new Error(`trainer limit reached for ${cap.planCode}`), { status: 409, code: 'TRAINER_LIMIT_REACHED', limit: cap.trainerLimit });
    }
  }

  if (targetRole === 'client' && cap.clientLimit != null) {
    const active = Number((await db.query(
      `SELECT count(DISTINCT client_user_id)::int AS n FROM trainer_client_links
        WHERE workspace_id=$1 AND status='active'`, [workspaceId]
    )).rows[0]?.n || 0);
    const reserved = await pendingInviteSeats(db, workspaceId, 'client');
    if (active + reserved + requestedSeats > cap.clientLimit) {
      throw Object.assign(new Error(`client limit reached for ${cap.planCode}`), { status: 409, code: 'CLIENT_LIMIT_REACHED', limit: cap.clientLimit });
    }
  }
}

export async function createInviteForActor(db, actor, input) {
  const targetRole = String(input.targetRole || input.target_role || '');
  const requestedWorkspaceId = input.workspaceId || input.workspace_id || null;
  const requestedTrainerId = input.trainerUserId || input.trainer_user_id || null;
  const maxUses = Math.min(500, Math.max(1, Number(input.maxUses || input.max_uses || 1) || 1));
  const expiresInDays = Math.min(365, Math.max(1, Number(input.expiresInDays || input.expires_in_days || 7) || 7));
  const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : {};

  const allowedTargets = new Set(['platform_admin','organization_owner','organization_admin','independent_trainer','trainer','client','solo_client']);
  if (!allowedTargets.has(targetRole)) throw Object.assign(new Error('invalid target role'), { status: 400 });

  let workspaceId = requestedWorkspaceId;
  let trainerUserId = requestedTrainerId;

  if (!actor.is_platform_admin) {
    const { rows: memberships } = await db.query(
      `SELECT m.role,w.type FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
        WHERE m.user_id=$1 AND m.workspace_id=$2 AND m.status='active' AND m.ended_at IS NULL`,
      [actor.id, workspaceId]
    );
    if (!memberships.length) throw Object.assign(new Error('forbidden'), { status: 403 });
    const roles = new Set(memberships.map(x => x.role));
    const isOwnerOrAdmin = roles.has('owner') || roles.has('admin');
    const isTrainer = roles.has('trainer');

    if (targetRole === 'client' && isTrainer && !isOwnerOrAdmin) {
      trainerUserId = actor.id;
    } else if (targetRole === 'client' && isOwnerOrAdmin) {
      if (trainerUserId) {
        const trainer = await db.query(
          `SELECT 1 FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2 AND role='trainer' AND status='active' AND ended_at IS NULL`,
          [workspaceId, trainerUserId]
        );
        if (!trainer.rowCount) throw Object.assign(new Error('trainer is not active in this workspace'), { status: 400 });
      }
    } else if (targetRole === 'trainer' && isOwnerOrAdmin) {
      trainerUserId = null;
    } else if (targetRole === 'organization_admin' && isOwnerOrAdmin) {
      trainerUserId = null;
    } else {
      throw Object.assign(new Error('forbidden'), { status: 403 });
    }
  } else {
    if (targetRole === 'solo_client') workspaceId = PLATFORM_DIRECT_WORKSPACE_ID;
    if (['platform_admin','organization_owner','independent_trainer'].includes(targetRole)) workspaceId = null;
  }

  if (['organization_admin','trainer','client'].includes(targetRole) && !workspaceId) {
    throw Object.assign(new Error('workspace is required for this invite'), { status: 400 });
  }

  await enforceCommercialCapacity(db, actor, workspaceId, targetRole, maxUses);

  const code = inviteCode(maxUses > 1 ? 3 : 2, 4);
  const encryptedCode = encryptInviteCode(code);
  const { rows } = await db.query(
    `INSERT INTO invites(token_hash,token_encrypted,workspace_id,created_by_user_id,target_role,trainer_user_id,email,max_uses,expires_at,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()+($9 || ' days')::interval,$10::jsonb)
     RETURNING id,workspace_id,target_role,trainer_user_id,email,max_uses,use_count,expires_at,created_at`,
    [inviteHash(code), encryptedCode, workspaceId, actor.id, targetRole, trainerUserId, input.email || null, maxUses, String(expiresInDays), JSON.stringify(metadata)]
  );
  return { code, invite: rows[0] };
}

export async function audit(db, { actorUserId = null, workspaceId = null, action, targetType = null, targetId = null, metadata = {} }) {
  await db.query(
    `INSERT INTO audit_events(actor_user_id,workspace_id,action,target_type,target_id,metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [actorUserId, workspaceId, action, targetType, targetId, JSON.stringify(metadata || {})]
  );
}
