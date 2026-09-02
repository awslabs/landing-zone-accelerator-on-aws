# Security Resources Stack

## Overview

The Security Resources stack deploys AWS Config rules (managed and custom) with auto-remediation, CloudWatch alarms and metrics, CloudWatch log groups, CloudTrail account-level trails, Session Manager configuration, and SecurityHub event forwarding.

## Deployment Scope

- **Stage:** `security-resources`
- **Deployed to:** All accounts, all enabled regions
- **Config files consumed:** `security-config.yaml`, `global-config.yaml`

## What It Deploys

### AWS Config Recorder and Delivery Channel
- Creates the Config recorder IAM role
- Sets up the Config recorder and delivery channel
- Delivers configuration snapshots to the central logs bucket

### AWS Config Rules
- **Managed rules** — AWS-managed Config rules from `security-config.yaml → awsConfig.ruleSets`
- **Custom rules** — Lambda-backed custom Config rules
- Rules are scoped by deployment targets (accounts, OUs, regions)
- **Rule tags** — a `ConfigServiceTags` custom resource applies `rule.tags` when the rule declares them; the FINALIZE-stage `config-rule-tagging` module applies `globalConfig.tags` and the default `Accelerator` tag
- **Dynamic references in tags** — only plaintext `{{resolve:ssm:...}}` (`String` or `StringList`) is resolved, matching what CloudFormation expands before invoking a custom resource; `ssm-secure` and `secretsmanager` are not, and the module skips those tags rather than writing an unresolved template

### Config Rule Remediation
- Auto-remediation via SSM Automation documents
- Creates remediation IAM roles with least-privilege policies
- Supports parameter replacement with dynamic values (bucket names, KMS ARNs, org IDs)

### CloudWatch Alarms
- Creates CloudWatch alarms defined in `security-config.yaml → cloudWatch.alarmSets`
- Supports anomaly detection operators
- Configurable comparison operators and treat-missing-data settings

### CloudWatch Metrics
- Creates CloudWatch metric filters defined in `security-config.yaml → cloudWatch.metricSets`

### CloudWatch Log Groups
- Creates CloudWatch log groups defined in `security-config.yaml → cloudWatch.logGroups`

### Account CloudTrail Trails
- Creates account-level CloudTrail trails (separate from the organization trail)
- Configured via `security-config.yaml → cloudTrail.accountTrails`

### Session Manager Configuration
- Configures SSM Session Manager preferences (logging, encryption)

### SecurityHub Event Forwarding
- Forwards SecurityHub findings to CloudWatch Logs

### Managed AD Secrets
- Creates Secrets Manager secrets for Managed Active Directory admin credentials

## Key Code Paths

| Component | File |
|-----------|------|
| Stack class | `accelerator/lib/stacks/security-resources-stack.ts` |
| Config rule constructs | `constructs/lib/aws-config/` |

## Config-to-Resource Mapping

| Config Property | Resource Created |
|----------------|-----------------|
| `security-config.yaml → awsConfig.ruleSets` | Config rules + remediation |
| `security-config.yaml → cloudWatch.alarmSets` | CloudWatch alarms |
| `security-config.yaml → cloudWatch.metricSets` | CloudWatch metric filters |
| `security-config.yaml → cloudWatch.logGroups` | CloudWatch log groups |
| `security-config.yaml → cloudTrail.accountTrails` | Account-level CloudTrail trails |
| `global-config.yaml → logging.sessionManager` | SSM Session Manager config |

## Common Issues

| Error | Cause | Resolution |
|-------|-------|------------|
| Config rule limit exceeded | More than 400 Config rules per account/region | Reduce rules or request limit increase |
| Remediation role creation failure | IAM role name collision | Check for existing roles with the same name |
| CloudWatch alarm dimension mismatch | Metric namespace/name doesn't match | Verify metric filter configuration |
