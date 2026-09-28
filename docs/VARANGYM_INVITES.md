# VARANGYM invitations and provisioning

Working invite design for `saas-v1`.

## Goals

- no manual platform-admin work for ordinary paid registrations at scale;
- trainer-created codes always bind clients to the correct trainer/workspace;
- organization-created trainer codes always bind the trainer to the organization;
- support one-time links/codes and limited reusable links;
- safe server-side redemption.

## Invite types

### Platform-issued

- solo client
- independent trainer
- organization owner
- support/manual client into selected workspace/trainer

### Organization-issued

Organization owner/admin may create:

- organization admin
- trainer
- organization client

### Trainer-issued

Trainer may create only:

- client invite bound to that trainer and workspace

## Token format

The user-facing invite should have both:

- a clickable URL: `/join/<token>`
- a shorter human-enterable code as fallback

The database stores a secure hash of the secret token, not the clear token.

## Invite record

At minimum:

- id
- token hash
- target role
- workspace id
- optional trainer id
- creator id or automated system marker
- optional recipient email
- max uses
- current use count
- expiry
- revoked timestamp
- creation timestamp
- metadata

## Redemption

Server flow:

1. receive token/code;
2. normalize and hash;
3. find invite;
4. reject expired/revoked/exhausted invite;
5. derive role/workspace/trainer assignment exclusively from invite record;
6. complete passkey/user registration;
7. atomically create membership/relationship and consume invite use;
8. write audit event.

The browser must never be allowed to submit a different role/trainer/workspace than the invite grants.

## One-time invites

Default for individual onboarding:

- max uses: 1
- expiry: configurable, e.g. 7 days

Good for a trainer inviting one named client.

## Reusable capped invites

Useful for organizations/trainers onboarding batches:

- e.g. 20 uses
- expires on a date
- still bound to a specific workspace and optionally trainer

Example: Kiril creates one onboarding link for up to 20 new clients. Every redeemed account is attached to Kiril automatically.

## Bulk generation

Business UI should later support:

- generate N trainer invites;
- generate N client invites;
- upload a CSV/email list and issue individual invitations;
- copy QR/link;
- revoke unused invites.

## Paid self-service provisioning

Target automated checkout flow:

### Solo

1. customer buys Solo plan;
2. payment webhook creates subscription/entitlement;
3. provisioning service creates solo invite;
4. email sends registration link/code;
5. user registers;
6. invite is consumed.

### Independent trainer

1. trainer buys Coach plan;
2. webhook creates independent trainer workspace + entitlement;
3. trainer-owner invite is created;
4. registration completes membership;
5. trainer can then create client invites within plan limits.

### Organization

1. organization buys Business plan;
2. webhook creates organization workspace + subscription;
3. owner invite is created;
4. owner registers;
5. owner/admin can invite trainers and clients according to entitlements.

## Entitlement checks

Invite creation must enforce plan limits.

Examples:

- trainer with 5 active-client seats cannot activate a sixth client;
- organization with 10 trainer seats cannot redeem an 11th trainer invite;
- revoked/expired subscriptions may prevent new invite creation while preserving existing data according to billing policy.

It is acceptable to allow an invite to be created before a seat is free, but redemption must still re-check the entitlement atomically to prevent races.

## Email

Email delivery should be asynchronous and retryable. The invite itself is authoritative; email failure must not corrupt the invite record.

Template variables should include:

- inviter/platform name
- target role
- workspace/organization name
- trainer name when relevant
- join link
- fallback code
- expiry

## Security

- hash tokens at rest;
- rate-limit redemption attempts;
- use sufficient entropy;
- audit creation/revocation/redemption;
- atomically increment use count;
- never reveal existing clear tokens from admin APIs after creation;
- do not embed authorization decisions solely in a signed frontend URL without a server-side invite record.
