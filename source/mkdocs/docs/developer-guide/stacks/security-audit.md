# Security Audit Stack

## Overview

The Security Audit stack runs in the audit (delegated admin) account and configures centralized security service management: Macie organization config, GuardDuty organization config, SecurityHub organization config, Detective, Audit Manager, IAM Access Analyzer, and SSM documents.

## Deployment Scope

- **Stage:** `security-audit`
- **Deployed to:** Audit account, home region
- **Config files consumed:** `security-config.yaml`

## What It Deploys

### Amazon Macie (Organization Configuration)
- Configures Macie as the delegated admin
- Sets auto-enable for new member accounts

### Amazon GuardDuty (Organization Configuration)
- Configures GuardDuty as the delegated admin
- Enables S3 protection, EKS audit/runtime, RDS protection, Lambda protection
- Manages member account auto-enable settings
- Handles region exclusions

### AWS Security Hub (Organization Configuration)
- Configures Security Hub as the delegated admin
- Enables security standards across the organization
- Auto-enables for new member accounts

### Amazon Detective
- Enables Detective organization configuration (if configured)

### AWS Audit Manager
- Enables Audit Manager delegated admin configuration

### IAM Access Analyzer
- Creates organization-level IAM Access Analyzer
- The organization-level analyzer uses the organization as its zone of trust, so it does not satisfy per-account controls such as AWS Security Hub control IAM.28. Set `accessAnalyzer.accountAnalyzer.enable` to also create an account-level analyzer in every account via the [Security Resources stack](./security-resources.md)

### SNS Notifications
- Configures SNS notification channels for security findings

### SSM Documents
- Deploys custom SSM Automation documents for security operations
- Used by Config rule remediation actions

### Resource Policy Enforcement
- Deploys SSM document for enforcing resource policies

## Key Code Paths

| Component | File |
|-----------|------|
| Stack class | `accelerator/lib/stacks/security-audit-stack.ts` |

## Cross-Stack Dependencies

### Reads
- Delegated admin enablement from Organizations stack
- KMS key ARNs from Key/Logging stacks

### Writes
- Security service organization configuration markers
