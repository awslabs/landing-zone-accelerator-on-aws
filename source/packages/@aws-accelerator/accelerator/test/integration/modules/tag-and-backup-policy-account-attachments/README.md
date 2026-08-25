# Tag and Backup Policy Account Attachment Module Integration Tests

## Overview

This suite invokes `TagAndBackupPolicyAccountAttachments.configure` against dedicated Organizations Tag and Backup policies. It validates direct `ACCOUNT` targets only; Root and OU targets are never added or changed.

## Prerequisites

- `ENV_MANIFEST` contains `Management`, `Shared Services`, `Audit`, and `Network`.
- `${LZA_GITLAB_ROLE_NAME}` is assumable from Management into Shared Services and Audit for fixture setup.
- The Policy Attachments CI job runs `tag-and-backup-policy-account-attachments-fixtures.sh ensure`.

The following AWS baseline is intentionally long-lived:

- Tag Policy and Backup Policy types remain enabled;
- fixed Tag and Backup policies remain in the management account;
- fixed AWS Backup roles and vaults remain in Shared Services and Audit;
- uses a unique, non-matching resource-tag selection so the policy does not select test resources;
- no original-state SSM marker is used.

`ensure` validates or creates the canonical resources and detaches every direct `ACCOUNT` target from the two test policies. `reset` only validates the fixed policies and detaches their direct account targets. It never deletes policies, roles, or vaults and never disables policy types.

Backup vault discovery uses the paginated `ListBackupVaults` API and exact `BackupVaultName` matching before any describe or tag validation.

At suite start, the shared TypeScript `resetModuleLatestState` helper deletes only `PK=MODULE#tag-and-backup-policy-account-attachments` / `SK=EXECUTION#latest`. Historical rows remain governed by the module-state table TTL.

CI uses the shared framework `run-module-integration.sh` lifecycle: fixture `ensure`, fixture env load, manifest aggregation, integration test, and fixture `reset`. Both module jobs use the same GitLab resource group, and artifacts use the complete module slug.

## Scenarios

| # | Scenario | Coverage |
| - | -------- | -------- |
| 1 | Initial attachments | Tag Policy to Shared Services; Backup Policy to Audit |
| 2 | Idempotent rerun | Both policies return `no-change` |
| 3 | Preserve unmanaged attachment | Network direct Tag Policy attachment remains live but outside LZA ownership |
| 4 | Target swap | Attach-before-detach across both policy types |
| 5 | Missing policy | Failed preflight defers an owned detachment |
| 6 | Recovery | Successful create-only reconciliation reseeds ownership |
| 7 | Final cleanup | Both policies return to zero direct account targets |

## Running

```bash
yarn test:integration test/integration/modules/tag-and-backup-policy-account-attachments/index.test.integration.ts
```

## Reset Behavior

The final manifest and fixture reset leave both policies with zero direct account targets. As a result, no `IntegrationTestPlan` is effective in Shared Services or Audit even though the canonical Backup policy remains available for the next run.

Manual runs must be serialized with both module suites for the same environment. Do not run manually while either GitLab resource-group job is active. Use this order:

1. `tag-and-backup-policy-account-attachments-fixtures.sh ... ensure`
2. Run the integration suite; its first prepare resets `EXECUTION#latest`.
3. `tag-and-backup-policy-account-attachments-fixtures.sh ... reset`
