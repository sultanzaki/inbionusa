# Confidential BOM access

Every formula family is protected by a separate password and an explicit user grant. The owner is the creator of the first revision. Later revisions retain that owner, password, grants and revocation state. Administrator role does not bypass the composition gate.

## Operator flow

1. Create a formula and set/confirm a separate password (at least 16 meaningful characters, maximum 64 UTF-8 bytes). Formula data and its password are initialized atomically.
2. Open **Formulas & BOM**, select the formula and unlock it. Both Production read permission and family membership are required. Write/approval actions still require their normal module/warehouse permissions.
3. The owner uses **Manage BOM access** to add/remove active users who have Production read permission. Share the password through an appropriate company channel; the application cannot display an existing password.
4. Unlocks last at most 15 minutes, bounded by the current login session. Other sessions/devices require their own unlock. Locking, changing the password, revoking a grant, logout, disabling an account and account-password resets invalidate the corresponding access.
5. Production orders and source-material operations require the linked BOM to be unlocked. Creating a reservation/consumption by supplying IDs directly does not bypass this requirement.
6. If a password is lost, an application administrator can request recovery with a reason. This clears the password and all unlocks. Only the existing owner can initialize the replacement. Recovery neither returns composition nor automatically grants access to the administrator. Ownership transfer is not part of this workflow.

## Protection coverage

- Formula rows are shaped before filtering, counts, sorting, summaries and pagination. Locked/list responses contain allowlisted identification/status metadata, not formula lines or notes.
- Manufacturing snapshots, requirements, reservations, inputs and production deviations are hidden when locked. An unlocked family is also required on mutation and replay paths.
- Batch/material PDF authorization checks the current family permission before reading a frozen historical snapshot.
- Formula/manufacturing and linked investigation/CAPA history redact before/after content and reasons when locked. Linked material-ledger entries are filtered before counts and export. Genealogy removes private input composition. Global audit detail uses an authenticated, BOM-aware RPC.
- Security tables and unfiltered helpers cannot be read/called with anonymous, authenticated or application-service table permissions. Session-authenticated RPC entry points are explicitly granted.
- Passwords use salted bcrypt at cost 12. The 64-byte bound avoids bcrypt truncation. Five failed attempts per user/family block further attempts for 15 minutes, across sessions.
- Passwords are not stored in replay payloads, audit content, query strings or browser storage. Formula/production and investigation/CAPA forms do not persist recoverable local drafts. Existing linked investigations also require a BOM unlock on writes. Legacy production draft keys are removed when the workspace loads.
- UI polling and cross-tab notifications refresh access; an expiry closes the editing dialog and hides composition. Server checks apply independently of UI timers. Timers use server-provided time differences, so device-clock skew cannot extend server authorization.

## Security boundaries

This is application-level access control, not end-to-end encryption of recipe data. Formula/snapshot/history rows remain readable to a PostgreSQL owner or someone with project-level database administration. Restrict Supabase/project credentials and protect backups accordingly. Treat administrators who can reset user credentials as trusted identity administrators: this gate is not a defense against account takeover by someone controlling account recovery. An authorized viewer can retain screenshots, exports or information they have already seen; revocation cannot retract copies.

Warehouse users still see stock balances and ordinary purchasing/receiving information permitted by their role. Direct batch-to-ingredient consumption links are protected, but stock-balance changes can permit inference in a very small operation. Fully blind manufacturing/inventory workflows would require a separate business design.

Titles, product identities, revision/state, unit/output metadata and BOM ownership are not secret fields. Do not put recipe composition in titles, general customer documents or unrelated free-text notes.

## Deployment and legacy data

Apply `028_confidential_bom.sql` after migrations 001–027. It is transactional, can be reapplied, and fails if pgcrypto is not available in the `extensions` schema. Back up first. Existing formulas are protected immediately and need first-time password initialization by their original family owner. No permissive compatibility fallback is supplied.

Deploy migration and application together. The application fails closed if BOM security cannot be verified. Previous application builds cannot create formulas without the new password flow after migration, so keep the rollout interval short.

Future full-business resets must explicitly include `erp_bom_unlocks`, `erp_bom_attempts`, `erp_bom_grants` and `erp_bom_security`. Retain RESTRICT semantics; do not use a broad CASCADE that could delete accounts.

## Verification

`tests/zzzzzzzz-bom-security-database.test.ts` covers separate-password creation, admin denial, grants, session binding, expiry, rate limiting, rotation/recovery, historical snapshots, ledger/genealogy/audit protection, private helper privileges, idempotent replay and logout cleanup. The complete DB suite applies the migration last. `TEST_BOM_ONLY=1 npm run test:e2e` exercises mobile creation, no local composition drafts, wrong passwords, same-origin checks, grants/revocation, expiry closing an editor, accessibility, desktop and Indonesian copy.

Validated on 26 October 2026: all 52 unit tests and 152 database tests passed, along with ESLint, TypeScript, the production build, the release-readiness browser checks, and the dedicated BOM browser scenario. The database suite verifies linked investigation/CAPA protection and applies migration 028 twice to check reapplication.
