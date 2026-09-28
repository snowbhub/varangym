# VARANGYM architecture

Status: working specification for the `saas-v1` branch.

## Product identity

- Brand in normal UI text: `varangym`
- Brand in logo / hero treatment: `VARANGYM`
- Product surfaces:
  - **App** — athlete / client experience
  - **Coach** — independent trainer experience
  - **Business** — organization / gym / studio experience
  - **Admin** — internal platform super-admin experience

VARANGYM is one platform, not four separate products. One account can hold different memberships and roles in different workspaces.

## Core product model

The existing openGym workout engine remains the basis for the athlete experience: routines, exercise configuration, workout logging, progression, history, body weight, 1RM, recovery/muscle views, timers, PWA/mobile shell and passkeys.

VARANGYM adds a SaaS layer around it:

- multi-tenant workspaces
- organizations and locations
- trainer/client relationships
- hierarchical invitations
- role-based authorization
- scoped exercise libraries
- program templates and versioned client programs
- trainer progress dashboards
- organization dashboards
- subscriptions / entitlements
- audit log
- platform administration
- full Ukrainian localization

## Workspaces

Every commercial context is a workspace.

### Platform direct workspace

Used for users who buy VARANGYM directly without a trainer. A solo client keeps full self-programming functionality.

### Independent trainer workspace

Created for a trainer who subscribes directly. The trainer is the workspace owner and may invite clients.

### Organization workspace

Created for a gym, studio, academy, rehabilitation center or similar business. It can contain:

- owner
- organization admins/managers
- locations
- trainers
- clients

The schema must support several locations from day one, even if the first UI only exposes one.

## User identity

A `user` is global and must not belong permanently to one trainer or one organization.

A user can, for example:

- train solo today;
- become a client of a trainer later;
- become a trainer in an organization later still;
- preserve their workout history throughout these changes.

Workspace access is represented by membership records, not fields baked into the user row.

## Roles

Initial roles:

- `platform_admin`
- `organization_owner`
- `organization_admin`
- `trainer`
- `client`

Solo usage is represented by a client with no assigned trainer, not by a completely separate authentication system.

Authorization must be permission-based server-side. The UI is never the security boundary.

## Invitations

Registration is invite-aware.

### Platform admin can issue

- solo client invite
- independent trainer invite
- organization owner invite
- support/manual client invite into a selected workspace/trainer

### Organization owner/admin can issue

- organization admin invite
- trainer invite
- client invite for the organization

### Trainer can issue

- client invites only for that trainer in that trainer's workspace or organization

Every invite records at least:

- invite type
- role to grant
- workspace id
- optional trainer id
- creator user id
- expiry
- max uses
- use count
- revocation state
- token hash

The clear token is shown/sent once. The database stores only a secure hash.

The product can support both:

- one-time invite code/link;
- reusable capped link, e.g. 20 uses until a date, for a trainer onboarding many clients.

## Trainer/client relationship

Do not store only `client.trainer_id`.

Use an explicit relationship table so the architecture can later support:

- reassignment to another trainer;
- multiple trainer roles;
- a primary trainer plus a rehabilitation specialist;
- relationship history.

The first UI may enforce one primary trainer, but the data model should not require a destructive migration to expand later.

## Exercise libraries

VARANGYM uses layered libraries.

### Global library

The platform-wide built-in exercise catalogue inherited from openGym.

Trainers and organizations can browse the full global catalogue.

### Organization library

An organization can curate global exercises and create its own exercises.

### Trainer library

Each trainer receives an empty personal library on creation. The trainer may:

- reference an existing global exercise;
- reference an organization exercise;
- create a trainer-owned custom exercise;
- attach trainer-owned media;
- override presentation metadata where allowed.

Adding a global exercise to a trainer library creates a reference, not a full duplicated copy.

### Client visibility

A trainer/workspace setting controls what the client may browse:

- assigned exercises only;
- trainer/organization curated library;
- full global library.

A solo client receives the global library plus their own custom exercises.

## Exercise localization

Exercise identity is language-neutral.

Names and instructions belong in translation records, e.g.:

- `en`: Bench Press
- `uk`: Жим штанги лежачи
- `de`: Bankdrücken
- `ru`: Жим штанги лёжа

Initial supported UI languages:

- Ukrainian
- German
- English
- Russian

The architecture must allow more languages without duplicating exercise identities.

## Programs

The file-based openGym plan import/export remains as backup/portability, but it is not the main coach workflow.

Coach workflow:

1. open client;
2. create or copy a program/template;
3. edit days/routines/exercises;
4. publish;
5. client immediately sees the published program.

Programs are versioned. Publishing creates a new immutable program version for history.

A historical workout always retains the program version context that existed when the workout was performed.

## Templates

Templates exist at three scopes:

- platform templates
- organization templates
- trainer templates

Assigning a template to a client creates a client-specific program that can then diverge without mutating the original template.

## Progress visibility

Trainer may see only assigned clients and relevant training data.

Expected trainer client view:

- current program/version
- workout history
- exercise performance
- sets/reps/load
- volume
- personal records
- body weight
- last activity
- adherence to assigned schedule
- coach notes

Organization administrators can see trainers and clients inside their own organization, subject to permissions.

Platform administrators can inspect the entire platform for support/administration. Sensitive admin actions must be audited.

## Admin

VARANGYM Admin must support:

- users
- workspaces
- organizations
- locations
- memberships/roles
- trainers and their clients
- invites
- subscriptions/entitlements
- program inspection/support actions
- exercise library administration
- account disable/delete/support operations
- audit log

## Payments

Payment is not required for the first technical milestone, but the architecture must support automated provisioning.

Target flow:

1. user selects Solo / Coach / Business;
2. checkout completes;
3. payment webhook creates or updates subscription and entitlements;
4. server creates the appropriate invitation/provisioning state;
5. registration link/code is emailed automatically;
6. user registers and consumes the entitlement.

No human should need to manually generate ordinary paid-user codes at scale.

## Data ownership

Workout history belongs to the user, not to a trainer or organization.

Changing trainer/workspace membership must not destroy the user's historical workouts, body weight, PRs or account identity.

Access to that data changes according to current relationships and permissions.

## Storage direction

The existing JSON-file backend is acceptable for the original self-hosted product but is not the target persistence model for VARANGYM SaaS.

VARANGYM SaaS should use PostgreSQL for relational platform data.

Exercise/video/image assets should use object storage (S3-compatible / R2-style) rather than PostgreSQL blobs or a Railway ephemeral filesystem.

## Security principles

- server-side authorization for every cross-user resource;
- tenant/workspace boundaries enforced in API queries;
- no trust in client-provided workspace/trainer ids;
- hashed invite tokens;
- audit privileged actions;
- preserve passkey/WebAuthn support;
- export/delete paths designed with GDPR in mind;
- production secrets only in deployment environment variables, never committed.

## Migration strategy

Do not rewrite the workout engine first.

Build VARANGYM around the existing domain logic in stages:

1. PostgreSQL and identity/workspace foundation;
2. invites and memberships;
3. trainer/client permissions;
4. exercise library scoping;
5. versioned programs and assignments;
6. trainer progress views;
7. organization/business views;
8. platform admin;
9. localization/branding;
10. billing/email/media hardening;
11. native app packaging after web/PWA workflow is stable.

## Branch policy

- `main` remains the upstream-compatible/stable line until VARANGYM milestones are reviewed.
- active SaaS development starts in `saas-v1`.
- changes should be incremental and testable rather than one monolithic rewrite.
