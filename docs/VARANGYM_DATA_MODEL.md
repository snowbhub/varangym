# VARANGYM data model

Working database design for `saas-v1`. Target database: PostgreSQL.

## Design rules

1. User identity is global; organization/trainer membership is relational.
2. Workout history belongs to the user and survives trainer/workspace changes.
3. Authorization is always evaluated server-side from memberships/relationships.
4. Organizations, independent trainers and direct solo users must fit the same core model.
5. Exercise identity is language-neutral; translations are separate records.
6. Program publishing is versioned and historical workouts keep their original program context.

## Core identity

### users

- id UUID PK
- display_name
- email nullable until email onboarding is enabled
- status: active | disabled | pending_delete
- locale
- created_at
- updated_at

Authentication/passkey credentials remain separate.

### auth_credentials

- id UUID PK
- user_id FK users
- credential_id unique
- public_key
- counter
- transports
- created_at

### user_settings

- user_id PK/FK
- units
- locale
- notification preferences
- client defaults that are truly personal, not trainer-owned

## Workspaces

### workspaces

- id UUID PK
- type: platform_direct | independent_trainer | organization
- name
- slug
- status
- created_at
- updated_at

### workspace_memberships

- id UUID PK
- workspace_id FK
- user_id FK
- role: owner | admin | trainer | client
- status: active | invited | suspended | left
- created_at
- ended_at nullable

Unique active membership constraint should prevent accidental duplicate membership rows for the same user/workspace/role combination.

### organization_profiles

- workspace_id PK/FK
- legal/display metadata
- default locale
- timezone
- billing metadata reference

### locations

- id UUID PK
- workspace_id FK organization workspace
- name
- address fields nullable
- timezone
- active

## Trainer/client relationships

### trainer_client_links

- id UUID PK
- workspace_id FK
- trainer_user_id FK users
- client_user_id FK users
- relationship_type: primary | secondary | rehab | other
- status: active | ended
- started_at
- ended_at nullable

The first product UI may allow only one active primary trainer per client/workspace, but the schema must allow multiple relationship types later.

## Invitations

### invites

- id UUID PK
- token_hash unique
- workspace_id nullable for platform-level provisioning
- created_by_user_id FK users nullable for automated billing flow
- target_role: organization_owner | organization_admin | trainer | client | solo_client
- trainer_user_id nullable
- email nullable
- max_uses default 1
- use_count default 0
- expires_at
- revoked_at nullable
- metadata JSONB
- created_at

Invite redemption must derive role/workspace/trainer assignment from this record, never from browser-supplied ids.

## Subscriptions and entitlements

### subscriptions

- id UUID PK
- subject_type: user | workspace
- subject_id UUID
- provider
- provider_customer_id
- provider_subscription_id
- plan_code
- status
- current_period_end
- created_at
- updated_at

### entitlements

- id UUID PK
- subject_type
- subject_id
- key e.g. active_clients_limit, trainers_limit, custom_media, business_features
- value JSONB
- source_subscription_id nullable
- starts_at
- ends_at nullable

## Exercises

### exercises

- id UUID PK
- owner_scope: platform | organization | trainer | user
- owner_workspace_id nullable
- owner_user_id nullable
- source_exercise_id nullable for derived/reference-friendly workflows
- tracking_mode: reps_weight | bodyweight | time | distance | cardio | other
- equipment_key nullable
- primary_muscle_key nullable
- metadata JSONB
- active
- created_at
- updated_at

Platform exercises represent the inherited global catalogue.

### exercise_translations

- exercise_id FK
- locale
- name
- description nullable
- instructions JSONB nullable
- PRIMARY KEY (exercise_id, locale)

### exercise_media

- id UUID PK
- exercise_id FK
- type: image | gif | video | thumbnail
- storage_key
- mime_type
- owner_user_id nullable
- created_at

### workspace_exercise_refs

Used for curated organization/trainer libraries without duplicating platform exercises.

- id UUID PK
- workspace_id FK
- trainer_user_id nullable
- exercise_id FK
- visibility: private | trainer_clients | organization | public
- display_overrides JSONB nullable
- created_at

For an independent trainer workspace, `trainer_user_id` may be the owner trainer.

## Program templates and client programs

### program_templates

- id UUID PK
- scope: platform | organization | trainer
- workspace_id nullable
- owner_user_id nullable
- name
- description nullable
- active
- created_at
- updated_at

### programs

Logical program assigned to one client.

- id UUID PK
- workspace_id FK
- client_user_id FK
- trainer_user_id nullable
- source_template_id nullable
- name
- status: active | archived
- created_at

### program_versions

- id UUID PK
- program_id FK
- version_number integer
- status: draft | published | retired
- published_at nullable
- created_by_user_id FK
- notes nullable
- UNIQUE(program_id, version_number)

### program_days

- id UUID PK
- program_version_id FK
- weekday or sequence index
- title nullable
- position

### program_day_exercises

- id UUID PK
- program_day_id FK
- exercise_id FK
- position
- prescription JSONB
- coach_notes nullable

`prescription` initially mirrors the useful openGym routine config (sets, reps, load, mode, rest, progression, warmups, intensifiers) while the migration layer maps it into the existing workout engine.

### program_assignments

- id UUID PK
- client_user_id FK
- program_version_id FK
- starts_at
- ends_at nullable
- active

## Workout history

### workouts

- id UUID PK
- user_id FK
- workspace_id nullable
- program_version_id nullable
- started_at
- finished_at nullable
- name
- source: assigned | freestyle | imported
- metadata JSONB

### workout_exercises

- id UUID PK
- workout_id FK
- exercise_id FK
- position
- snapshot_name nullable
- prescription_snapshot JSONB nullable

### workout_sets

- id UUID PK
- workout_exercise_id FK
- position
- set_type
- phase
- weight nullable
- reps nullable
- seconds nullable
- distance nullable
- done
- details JSONB for drops/rest-pause/etc.

### bodyweights

- id UUID PK
- user_id FK
- measured_at
- weight
- source

## Notes and coaching

### coach_notes

- id UUID PK
- workspace_id FK
- trainer_user_id FK
- client_user_id FK
- body
- visibility: trainer_only | client_visible
- created_at
- updated_at

## Audit

### audit_events

- id BIGSERIAL PK
- actor_user_id nullable
- workspace_id nullable
- action
- target_type nullable
- target_id nullable
- metadata JSONB
- created_at

Privileged mutations should emit an audit event.

## Migration boundary with existing openGym

During early development, the existing Zustand/openGym state remains the workout-engine representation in the client. A compatibility layer converts between the relational API model and the existing routine/workout helpers.

Do not delete the existing pure workout helpers until equivalent behavior is covered by tests in the new integration.
