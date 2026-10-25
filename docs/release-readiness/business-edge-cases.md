# Operational edge-case map

Scope: current modules and policies, excluding general-ledger accounting, routing/time tracking and new company approval policies. Verified against the local integration database; production has not been migrated or modified. This map describes known scenarios, not a guarantee that all future business exceptions have been discovered.

| Process | Scenario | Existing system response / operator action | Verification |
|---|---|---|---|
| Accounts | Expired session, inactive account, revoked permission | Reject protected reads/writes; require login or administrator action | database, release-access suites |
| Access | Direct URL/API bypass or foreign warehouse ID | Module and warehouse scope enforced server-side | manufacturing scope tests |
| Modules | Disable while work remains open | Reject disabling; read-only remains available | release-access, manufacturing suites |
| Master data | Duplicate series/code, conversion changed after transaction | Unique identities; historical snapshots and base-unit restrictions | ERP and manufacturing suites |
| QC | Forged PASS, stale/missing/duplicate parameters | Re-evaluate from approved specification; reject invalid results | database suite |
| QC | Failed lot subsequently passes retest | Controlled retest, current result and hold/supplier checks still apply | manufacturing tests |
| COA | Two users issue the same inspection | One certificate; atomic uniqueness and snapshot | database suite |
| COA | Wrong production date or superseded inspection | Authoritative lot dates and current passed inspection required | COA production-date suite |
| Purchasing | Receipt above order, partial receipt, duplicate request | Reject excess, retain remaining quantity, idempotent replay | growth / finance suites |
| Supplier quality | Expired qualification, held or expired material | Eligibility rechecked before consumption | manufacturing suite |
| Formula | Same ingredient repeated | Server rejects duplicates; new field-level preflight highlights the duplicate line | operations unit suite + existing DB guard |
| Production | Reservation mistaken for consumption | Physical stock changes only on actual consumption | manufacturing suite |
| Production | Return more material than actually consumed | Limit return to remaining consumed quantity | manufacturing suite |
| Production | Close with unused reservations, variance or unreconciled yield | Release/consume reservations; reconcile or approve deviation | manufacturing suite |
| Production | Ship output before closing controlled batch | Shipping blocked until reconciliation and closure | operational access guards |
| Warehouse | Negative/insufficient stock, restricted location | Recheck on posting, atomic rollback | ERP / manufacturing suites |
| Warehouse | Transfer source equals destination | Database rejects; new preflight highlights destination | operations unit suite |
| Warehouse | Partial destination receipt | Stock remains in transit until received; shortages require approval | manufacturing suite |
| Warehouse | Duplicate receipt line or zero receipt/shortage | Database rejects; new preflight identifies the exact line before confirmation | operations unit suite |
| Pallets | Pack more than loose stock, move while dispatched | Availability/state/version controls | manufacturing suite |
| Pallets | Incomplete pallet manifest on receipt | Complete pallet reconciliation required; shortage explicit | manufacturing suite |
| Pallets | Duplicate content line or duplicate pallet selection | Unique selection checks before submitting; server controls retained | operations validation |
| Sales | Accepted quote converted more than once | Single SO linkage, conversion form suppressed after conversion | ERP/browser suites |
| Sales | Edit issued quote or change committed order quantities | Revision/amendment workflow; delivered quantity retained | transaction-controls suite |
| Dispatch | Financial terms approved but funds insufficient | Approval is separate from allocation; payment/credit gate on posting | operational-finance suite |
| Billing | Dispatch invoice before delivery | Reject; use an advance request for pre-shipment billing | operational-UX suite |
| Billing | Overbill quantity or payment requests exceed agreed value | Reject against authoritative remaining quantity/value | finance suite |
| Payments | Duplicate bank reference, unverified/mismatched party or currency | Reject duplicate verification/allocation | finance suite |
| Credit | Overdue debt, expired override, changed terms | Recheck credit/terms on dispatch; approved reasoned exception required | finance suite |
| Returns | Return treated as saleable stock | Separate held lot; QC disposition required | ERP/service suites |
| Service | Refund promised but no verified settlement | Claim closure blocked until physical/financial requirements met | finance/service suite |
| Correction | Reverse workflow-managed stock directly | Reject; use linked production/warehouse correction | manufacturing suite |
| Documents | Overwrite distributed revision | Immutable version and recipient evidence retained | manufacturing suite |
| Concurrency | Replayed write, stale version, two concurrent submissions | Request identity, version checks and transaction locks | DB concurrency tests |
| Connection | Timeout after server may have committed | Preserve draft; require checking history before retry | operator browser suite |
| Drafts | Restore outdated price/stock/specification | Explicit recovery; validate current server state on save | operator browser suite |

## Changes in this release

- Field-specific preflight for duplicate formula materials, transfer receipt lines, pallet manifests, duplicate pallet selections, zero receipt entries, same source/destination and inverted validity dates. These are mirrored operational invariants, not new discretionary business policies.
- Indonesian/English interface with language selection independent of document language. Stored enum values, IDs, quantities, references and user-entered data remain canonical.
- Internal approval stamp removed from PDFs. Authorization, approval state and audit history remain enforced.

## Remaining business boundaries

Carrier billing, legal tax treatment, accounting close, external bank settlement and physical proof are not inferred from UI status. Operators still record/verify the real event. New exceptions in those areas require an explicit business policy before automation.
