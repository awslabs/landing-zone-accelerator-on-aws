# Organizations Stack

## Overview

The Organizations stack runs in the management account and configures organization-wide services: delegated admin accounts, CloudTrail organization trails, organization policies, Control Tower controls, and service enablement.

## Deployment Scope

- **Stage:** `organizations`
- **Deployed to:** Management account, global region
- **Config files consumed:** `organization-config.yaml`, `security-config.yaml`, `global-config.yaml`

## What It Deploys

### Delegated Admin Account Enablement
Enables delegated administrator for security services in the audit account:

| Service | Config Property |
|---------|----------------|
| Amazon Macie | `security-config.yaml → centralSecurityServices.macie` |
| Amazon GuardDuty | `security-config.yaml → centralSecurityServices.guardduty` |
| AWS Security Hub | `security-config.yaml → centralSecurityServices.securityHub` |
| Amazon Detective | `security-config.yaml → centralSecurityServices.detective` |
| AWS Audit Manager | `security-config.yaml → centralSecurityServices.auditManager` |
| AWS Firewall Manager | `security-config.yaml → centralSecurityServices.fms` |
| AWS Config (aggregation) | `security-config.yaml → awsConfig.aggregation` |
| Amazon VPC IPAM | `network-config.yaml → centralNetworkServices.ipams` |
| AWS IAM Identity Center | `iam-config.yaml → identityCenter` |
| AWS Service Catalog | `customizations-config.yaml → serviceCatalogPortfolios` |

### Organization CloudTrail
- Creates an organization-wide CloudTrail trail (if configured)
- Logs to the central logs bucket with CMK encryption

### Organization Policies
- **Backup policies** — Defined in `organization-config.yaml → backupPolicies`
- **Tagging policies** — Defined in `organization-config.yaml → taggingPolicies`
- **Chatbot policies** — Defined in `organization-config.yaml → chatbotPolicies`

The Organizations stack creates Tag Policies and Backup Policies and manages their root and organizational unit attachments. Direct account attachments for these policy types are reconciled after stack deployment by the `tag-and-backup-policy-account-attachments` Module Runner module in the `security-audit` stage. On its first successful run, the module attaches missing configured accounts and adopts only configured direct attachments without detaching other live direct attachments. On later runs, it detaches a direct attachment only when that policy and account were owned by the previous successful configuration and the account has since been removed from `accounts` or selected by `excludedAccounts`. External direct attachments never owned by LZA are preserved, while root and organizational unit attachments remain owned by the Organizations stack.

### Control Tower Controls
- Enables Control Tower controls (guardrails) on specified OUs
- Configured via `organization-config.yaml → controlTower.controls`

### Other Services
- **RAM organization sharing** — Enables resource sharing across the organization
- **IAM Access Analyzer** — Enables organization-level analyzer
- **Cost and Usage Report** — Creates CUR if configured

## Key Code Paths

| Component | File |
|-----------|------|
| Stack class | `accelerator/lib/stacks/organizations-stack.ts` |

## Cross-Stack Dependencies

### Reads
- Central logs bucket name and CMK ARN from Logging stack
- CloudWatch and Lambda KMS key ARNs

### Writes
- Delegated admin account enablement markers
- Organization trail configuration

### Read By
- Security Audit stack relies on delegated admin being enabled here
