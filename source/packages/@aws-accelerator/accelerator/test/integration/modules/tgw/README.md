# TransitGateway Module Integration Tests

## Overview

This suite exercises the Landing Zone Accelerator Transit Gateway associations and propagations module against real AWS resources using the chained, manifest-driven test framework. The system under test is `TgwAssociationsAndPropagations.configure`, the LZA wrapper over `@aws-lza` `configureTgw`. Each test manifest applies an incremental configuration change to a single shared baseline and asserts the resulting AWS state. The baseline AWS resources (TGW, route tables, VPCs, VPN, DX Gateway, RAM share) are provisioned once per environment by `tgw-prereqs.sh` and reused across all 17 consolidated manifests.

## Prerequisites

- Accounts required in `ENV_MANIFEST`: `Management`, `Network`, `Shared Services`.
- Cross-account trust: `${MANAGEMENT_ACCOUNT_ACCESS_ROLE}` (default `AWSControlTowerExecution`) must be assumable from `Management` into both `Network` and `Shared Services`.
- `deploy-integ-prereqs.sh` has been run once per target environment; it auto-invokes `tgw-prereqs.sh`.
- The prereq script appends the following env vars to the dotenv consumed by the suite:
  - `TGW_INTEG_SSM_PREFIX`
  - `TGW_INTEG_NETWORK_ACCOUNT_ID`
  - `TGW_INTEG_SHARED_SERVICES_ACCOUNT_ID`
  - `TGW_INTEG_HOME_REGION`

## Running

```
yarn test:integration test/integration/modules/tgw/index.test.integration.ts
```

## Test Environment

| Resource        | Name                           | Account         | Details                                         |
| --------------- | ------------------------------ | --------------- | ----------------------------------------------- |
| Transit Gateway | `main-tgw`                     | Network         | ASN 64513, two route tables                     |
| Route Table     | `core-rt`                      | Network         | Primary association target                      |
| Route Table     | `segregated-rt`                | Network         | Secondary association target                    |
| VPC             | `network-vpc` (10.100.0.0/16)  | Network         | Attachment: `network-vpc-attach`                |
| VPC             | `shared-vpc` (10.101.0.0/16)   | Shared Services | Attachment: `shared-vpc-attach` (cross-account) |
| VPC             | `template-vpc` (10.102.0.0/16) | Network         | Attachment: `template-vpc-attach`               |
| VPC             | `template-vpc` (10.103.0.0/16) | Shared Services | Attachment: `template-vpc-attach`               |
| VPN             | `network-vpn`                  | Network         | CGW: `network-cgw` (203.0.113.12, ASN 65000)    |
| DX Gateway      | `network-dxgw`                 | Network         | ASN 64512 (same-account)                        |
| DX Gateway      | `shared-dxgw`                  | Shared Services | ASN 64512 (cross-account, proposal flow)        |

## Test Cases

| #   | Manifest                       | Scenario                                 | What's Tested                                                                                                                                 |
| --- | ------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | create-association-matrix      | Create baseline association matrix       | Same-account VPC, cross-account VPC, VPN, and duplicate-name vpcTemplate attachments create associations/propagations in one module execution |
| 02  | idempotent-association-matrix  | Re-run baseline matrix                   | Config-hash idempotency for the consolidated VPC/VPN/vpcTemplate state                                                                        |
| 03  | move-delete-association-matrix | Move and delete association matrix state | VPC and VPN associations move together from core-rt to segregated-rt while stale shared/template associations and propagations are removed    |
| 04  | dry-run-noop                   | Dry-run with drift config                | Dry-run plans changes without mutating AWS state or the module state table                                                                    |
| 05  | dx-gw-create-associations      | Create DX Gateway associations           | Same-account DX Gateway direct association and cross-account DX Gateway proposal flow in one module execution                                 |
| 06  | dx-gw-idempotent-rerun         | Re-run DX Gateway config                 | Config-hash idempotency for direct and proposal DX Gateway config                                                                             |
| 07  | dx-gw-update-allowed-prefixes  | Update DX Gateway prefixes               | Same-account DX Gateway allowedPrefixes update and cross-account proposal re-submit                                                           |
| 08  | dx-gw-delete-associations      | Delete DX Gateway associations           | DX Gateway disassociation through empty `transitGatewayAssociations`                                                                          |
| 09  | disable-flag                   | Empty transitGateways array              | Wrapper skip path when no TGWs are configured                                                                                                 |
| 10  | ownership-external-preserved   | External propagation not deleted          | Externally-created propagation (shared-vpc-attach → segregated-rt) is preserved when not in config                                            |
| 11  | ownership-adopt-external       | Adopt external into config               | Previously-external propagation added to config is reported as "exists" and recorded in owned state                                           |
| 12  | ownership-delete-adopted       | Delete adopted propagation               | Adopted propagation removed from config is deleted (full ownership lifecycle: external → adopt → delete)                                      |
| 13  | error-missing-tgw              | Reference non-existent TGW               | Error handling for missing TGW SSM parameters                                                                                                 |
| 14  | error-missing-dx-ssm           | Reference non-existent DX Gateway        | Error handling for missing DX Gateway SSM parameters                                                                                          |
| 15  | xacct-error-denied-assume      | Reference missing cross-account attach   | Error handling for unresolved cross-account attachment SSM parameters                                                                         |
| 998 | recreate-all-resources         | Establish full resource set              | Recreate all resources after error tests to establish valid owned state for final cleanup                                                      |
| 999 | final-restore-empty            | Delete everything                        | Empty config deletes all owned resources, leaves environment clean for next pipeline run                                                       |

## Assertion Types

| Assertion                            | Description                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `moduleResponseStatus`               | Expected status: `completed`, `skipped`, or `failed`                                                                  |
| `moduleResponseOperationCounts`      | Counts of `created`, `updated`, `deleted`, `exists` per category (associations, propagations, dxAssociations)         |
| `moduleResponseSkipped`              | Boolean — module short-circuited with no changes                                                                      |
| `moduleResponseUnchanged`            | Boolean — dry-run detected no real mutations                                                                          |
| `moduleResponseFailed`               | Regex match on error message for expected failures                                                                    |
| `tgwRouteTableAssociations`          | Snapshot of associations per route table after execution                                                              |
| `tgwRouteTablePropagations`          | Snapshot of propagations per route table after execution                                                              |
| `dxGatewayAssociationState`          | DX Gateway association type (`direct`/`proposal`), state, and `allowedPrefixes` verification for one or more gateways |
| `stateTableLastConfigVpcAttachments` | Validates saved `lastConfig.vpcAttachments` account/region entries                                                    |
| `stateTableEntry`                    | DynamoDB state table entry validation                                                                                 |

## Known Caveats

- The module's config-change short-circuit means manifests whose `moduleConfig` shape is identical to the previous apply may land on the `SKIPPED` path; assertions account for this.
- Baseline is deploy-only — there is no teardown script; cleanup is a separate manual step.
- The VPN tunnel remains `pending` indefinitely; this is intentional (no real on-prem peer, no hourly charges).
- The Direct Connect Gateway has no physical DX connection attached; only proposals are exercised, which is free.
- Cross-account DX Gateway prefix updates (manifest 07) create a new proposal that requires manual acceptance in the DX GW owner account before prefixes take effect on the AWS side.
