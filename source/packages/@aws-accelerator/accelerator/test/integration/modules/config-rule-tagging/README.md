# Config Rule Tagging Module Integration Tests

## Overview

This suite invokes `ConfigRuleTagging.configure` against one dedicated AWS Config rule in the Shared Services account. It validates the accelerator wrapper, target-account role, plaintext SSM resolution, AWS Config tag reconciliation, and module-state ownership ledger.

## Prerequisites

- `ENV_MANIFEST` contains `Management` and `Shared Services`.
- `${LZA_GITLAB_ROLE_NAME}` is assumable from Management into Shared Services.
- Shared Services has an active AWS Config recorder and delivery channel.
- The Config Rule Tagging CI job runs `config-rule-tagging-fixtures.sh ensure`. It creates or reuses the long-lived baseline:
  - `${ACCELERATOR_PREFIX}-config-rule-tagging-integ`
  - `/${ACCELERATOR_PREFIX}/integration/config-rule-tagging/dynamic-value`
  - the fixture ownership tag and `ExternalSentinel`
  - generic `LzaIntegTest-ConfigRuleTagging-Role` roles and boundaries created by the shared integration framework

These resources are intentionally retained between runs. The fixture script validates fixed identity and tags before reuse. `ensure` and `reset` remove only `Accelerator`, `StaticTag`, `DynamicTag`, and `UpdatedTag`, restore the fixed plaintext SSM value, and preserve `ExternalSentinel`.

At suite start, the shared TypeScript `resetModuleLatestState` helper deletes only `PK=MODULE#config-rule-tagging` / `SK=EXECUTION#latest`. Historical state rows are retained and expire through the module-state table TTL policy.

CI uses the shared framework `run-module-integration.sh` lifecycle: fixture `ensure`, fixture env load, manifest aggregation, integration test, and fixture `reset`. The two module jobs share one GitLab resource group and cannot mutate the environment concurrently. Artifacts use the complete module slug.

## Scenarios

| # | Scenario | Coverage |
| - | -------- | -------- |
| 1 | Static and dynamic tags | Static global tags, plaintext SSM resolution, external-tag preservation |
| 2 | Idempotent rerun | Live-state `no-change` result |
| 3 | Update and removal | Value update, added key, previous ownership removal |
| 4 | Final cleanup | All module-owned tags removed; external fixture tags preserved |

## Running

```bash
yarn test:integration test/integration/modules/config-rule-tagging/index.test.integration.ts
```

The final manifest leaves all module-managed tags empty and verifies `ExternalSentinel` is preserved. The shared runner then runs fixture `reset`. Generic module roles/boundaries and the Config rule/SSM baseline remain available for the next run.

Manual runs must be serialized with both module suites for the same environment. Do not run manually while either GitLab resource-group job is active. Use this order:

1. `config-rule-tagging-fixtures.sh ... ensure`
2. Run the integration suite; its first prepare resets `EXECUTION#latest`.
3. `config-rule-tagging-fixtures.sh ... reset`
