# VARANGYM RBAC and authorization

Authorization rules for `saas-v1`.

## Principle

Frontend routing and hidden buttons are convenience only. Every API endpoint that reads or mutates cross-user data must authorize the caller on the server.

## Platform roles

### platform_admin

Scope: entire platform.

Can:

- inspect all users/workspaces/organizations/trainers/clients;
- create/revoke platform-level invites;
- support/reassign memberships;
- manage global exercise catalogue;
- inspect subscriptions/entitlements;
- disable accounts/workspaces;
- perform support mutations that are written to the audit log.

## Organization roles

### organization_owner

Scope: own organization workspace.

Can:

- manage billing-facing organization settings;
- manage organization admins;
- manage trainers and clients;
- create trainer/client invites;
- manage locations;
- manage organization exercise library/templates;
- view organization-level training dashboards subject to privacy policy.

### organization_admin

Scope: own organization workspace.

Default permissions:

- manage trainers/clients;
- create trainer/client invites;
- manage locations;
- inspect trainer/client progress;
- manage organization library/templates.

Does not automatically receive billing/ownership transfer permissions.

## Trainer

Scope: trainer's own workspace or the trainer's assigned relationships within an organization.

Can:

- create client invites for self;
- view assigned clients;
- create/edit/publish programs for assigned clients;
- create/manage trainer templates;
- curate trainer exercise library;
- create trainer-owned custom exercises/media;
- view training progress of assigned clients;
- create coach notes.

Cannot:

- create trainer/admin invites;
- inspect unrelated clients;
- inspect other trainers' private libraries/notes unless organization policy explicitly grants this;
- change organization billing/roles.

## Client

Scope: self.

Can:

- view own assigned/current program;
- log own workouts;
- view own history/stats/bodyweight;
- use exercises visible under current client-library policy;
- manage personal settings;
- export/delete own data through supported privacy flows.

May additionally self-program when the current product mode/workspace policy permits it.

## Solo client

Technically a client without an active trainer assignment.

Default behavior:

- full global exercise library;
- own custom exercises;
- self-created routines/programs;
- normal workout/history/stats functionality.

## Permission examples

Instead of checking only role names, server helpers should answer questions such as:

- `canReadClient(caller, clientId, workspaceId)`
- `canEditClientProgram(caller, clientId, workspaceId)`
- `canCreateTrainerInvite(caller, workspaceId)`
- `canCreateClientInvite(caller, trainerId, workspaceId)`
- `canManageWorkspaceLibrary(caller, workspaceId)`
- `canReadTrainerLibrary(caller, trainerId, workspaceId)`
- `canPerformPlatformSupportAction(caller)`

## Tenant isolation

Every organization/trainer query must be constrained by authorized workspace/relationship ids on the server.

Never accept this pattern:

`GET /clients?workspace_id=<browser supplied id>` and trust the id.

Instead derive allowed workspace ids from the authenticated user, then validate the requested scope against them.

## Reassignment

A client can move between trainers without losing user-owned history.

Ending a trainer/client link removes future trainer access according to retention/privacy policy, while historical user data remains owned by the client.

## Organization privacy

The schema supports organization admins seeing clients/trainers, but the product should keep fine-grained permission flags available so later plans can restrict health/training-detail visibility for non-coaching staff.

## Audit requirements

Audit at minimum:

- role changes;
- trainer/client reassignment;
- account disable/delete support actions;
- organization ownership/admin changes;
- program edits performed by platform/organization admins on behalf of a trainer/client;
- global exercise promotion/deletion;
- entitlement/subscription overrides.
