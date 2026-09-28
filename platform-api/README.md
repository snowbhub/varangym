# VARANGYM platform API

This service is the new multi-tenant SaaS foundation for the `saas-v1` branch. It intentionally lives beside the original openGym API while VARANGYM is being built, so the workout engine can keep evolving without forcing the organization/trainer/client model into the old JSON persistence layer.

## What is implemented

- PostgreSQL migrations on startup
- passkey/WebAuthn registration and login
- bootstrap flow for the first platform administrator
- global users + persistent sessions
- workspaces: platform direct, independent trainer, organization
- workspace memberships and roles
- trainer/client links
- hierarchical invite creation and revocation
- organization/business overview
- coach client list
- platform admin overview
- schema foundations for exercises, translations, programs, versions, workouts and coaching notes

## Required environment variables

```text
DATABASE_URL=postgresql://...
APP_ORIGIN=https://your-varangym-web.example
RP_ID=your-varangym-web.example
RP_NAME=VARANGYM
PLATFORM_BOOTSTRAP_TOKEN=<long-random-secret>
```

Optional:

```text
PORT=3000
SESSION_DAYS=30
PGSSL=require
PGPOOL_MAX=10
```

`APP_ORIGIN` and `RP_ID` are security-sensitive WebAuthn settings. A passkey registered for one RP ID cannot be used on a different hostname.

## First admin

1. Deploy with an empty database and a strong `PLATFORM_BOOTSTRAP_TOKEN`.
2. `POST /api/bootstrap/invite` with `Authorization: Bearer <token>`.
3. Use the returned invite code in the normal passkey registration flow.
4. Once a platform admin exists, the bootstrap endpoint refuses to mint another admin invite.

## Main routes

```text
GET  /health
GET  /api/config
POST /api/bootstrap/invite
POST /api/auth/register/options
POST /api/auth/register/verify
POST /api/auth/login/options
POST /api/auth/login/verify
POST /api/logout
GET  /api/me
GET  /api/workspaces
POST /api/invites
GET  /api/invites
POST /api/invites/revoke
GET  /api/coach/clients?workspaceId=...
GET  /api/business/overview?workspaceId=...
GET  /api/admin/overview
GET  /api/admin/workspaces
```

## Invite hierarchy

- platform admin: platform admin, organization owner, independent trainer, solo client, or targeted workspace invites
- organization owner/admin: organization admin, trainer, client
- trainer: client only; the trainer assignment is forced to the caller

The clear invite code is never persisted. Only its SHA-256 hash is stored.

## Branch/deployment policy

This service is staging-only until the VARANGYM web application has been connected and the authorization paths have been tested end-to-end. Do not replace the existing Kiril openGym deployment with this service.
