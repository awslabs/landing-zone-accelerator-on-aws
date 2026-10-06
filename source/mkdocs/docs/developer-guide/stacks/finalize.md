# Finalize Stack

## Overview

The Finalize stack is the last stage of the pipeline. It re-evaluates and re-attaches SCPs (to pick up any dynamic replacements from resources created during the pipeline run), stores the configuration commit ID, and detaches the quarantine SCP from newly created accounts.

## Deployment Scope

- **Stage:** `finalize`
- **Deployed to:** Management account, global region
- **Config files consumed:** `organization-config.yaml`, `global-config.yaml`

## What It Deploys

### SCP Re-evaluation
- Uses `PolicyResource` to re-create and re-attach SCPs
- Loads policy replacements that may reference resources created during the pipeline (e.g., VPC IDs)
- Configures SCP revert detection (alerts on manual SCP changes)

### Configuration Commit ID
- Stores the current config commit ID in SSM parameter: `/<prefix>/configuration/configCommitId`
- Used to track which configuration version was last successfully deployed

### Quarantine SCP Detachment
- If `quarantineNewAccounts` is enabled, detaches the quarantine SCP from accounts that have been fully configured
- Uses an EventBridge rule + Lambda to detect when accounts are ready
- Runs in all partitions when `quarantineNewAccounts` is enabled. The attach-side watch for
  `CreateGovCloudAccount` remains commercial-only, since that API is only available in the `aws`
  partition (see the Accounts stack)

## Key Code Paths

| Component | File |
|-----------|------|
| Stack class | `accelerator/lib/stacks/finalize-stack.ts` |
| Policy resource | `accelerator/lib/resources/policy-resource.ts` |
| Quarantine detach | `accelerator/lib/detach-quarantine-scp.ts` |

## Cross-Stack Dependencies

### Reads
- CloudWatch and Lambda KMS keys from Key/Logging stacks
- SCP policy IDs from Accounts stack (via SSM)
- All dynamic replacement values (VPC IDs, etc.) from Network stacks

### Writes
- Config commit ID SSM parameter
- Updated SCP attachments
