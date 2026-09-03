# Bootstrap Stack

## Overview

The Bootstrap stack sets up the CDK infrastructure required for deploying all subsequent stacks. It creates deployment roles, S3 asset buckets, and KMS keys in every account and region.

## Deployment Scope

- **Stage:** `bootstrap`
- **Deployed to:** All accounts, all enabled regions
- **Config files consumed:** `global-config.yaml`

## What It Deploys

### CDK Deployment Roles
- **Deployment Role** (`<prefix>-Deployment-Role`) — Used by CDK to deploy stacks. Configurable via `cdkOptions.customDeploymentRole`.
- **Management Deployment Role** (`<prefix>-Management-Deployment-Role`) — Additional role for management account operations. It is only created in the management account, so the installer stages (`pipeline`, `tester-pipeline`) fall back to `<prefix>-Deployment-Role` when the pipeline account is an external pipeline account. Combining an external pipeline account with `cdkOptions.customDeploymentRole` is not supported, because the installer stages are deployed before the accelerator configuration is available.

#### Deployment Role and SDK-based modules

The SDK-based module runner resolves its cross-account role using the same precedence as the CDK deploy path:
`cdkOptions.useManagementAccessRole` takes precedence (uses `managementAccountAccessRole`), then a configured
`cdkOptions.customDeploymentRole`, otherwise `managementAccountAccessRole`.

The default LZA-created role already has the required trust and permissions. A self-managed custom role
(used with `cdkOptions.useExistingRoles`) must additionally allow the management account to assume it —
trust `arn:aws:iam::<managementAccountId>:root` — so the module runner can perform the cross-account
`sts:AssumeRole`, and grant the actions each enabled module requires. Where a
module declares a least-privilege session policy, its actions are listed in `MODULE_SESSION_POLICIES`
(`source/packages/@aws-lza/lib/common/module-session-policies.ts`); missing permissions surface as
`AccessDenied` at runtime.

### S3 Asset Bucket
- `cdk-accel-assets-<accountId>-<region>` — Stores CDK synthesized assets (Lambda code, CloudFormation templates)
- Encrypted with a dedicated CMK
- When `cdkOptions.centralizeBuckets` is enabled, only created in the management account

### S3 Bucket CMK
- KMS key for encrypting the CDK asset bucket
- Key policy grants access to deployment roles

### CDK Bootstrap Version Parameter
- SSM parameter `/cdk-bootstrap/accel/version` — Tracks the bootstrap version

## Key Code Paths

| Component | File |
|-----------|------|
| Stack class | `accelerator/lib/stacks/bootstrap-stack.ts` |

## Config-to-Resource Mapping

| Config Property | Resource Created |
|----------------|-----------------|
| `global-config.yaml → cdkOptions.customDeploymentRole` | Custom-named deployment IAM role |
| `global-config.yaml → cdkOptions.centralizeBuckets` | Centralized S3 bucket in management account |

## Cross-Stack Dependencies

### Writes
- CDK bootstrap version SSM parameter
- S3 bucket and KMS key used by all subsequent stack deployments

### Read By
- Every subsequent stack uses the deployment role and asset bucket created here
