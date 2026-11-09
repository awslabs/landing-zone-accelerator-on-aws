# Logging Stack

## Overview

The Logging stack is one of the most resource-intensive stacks. It creates the centralized logging infrastructure: S3 buckets, KMS keys for multiple services, SNS topics, CloudWatch log replication, and VPC flow log destinations.

## Deployment Scope

- **Stage:** `logging`
- **Deployed to:** All accounts, all enabled regions
- **Config files consumed:** `global-config.yaml`, `security-config.yaml`, `iam-config.yaml`

## What It Deploys

### KMS Keys (per account/region)
- **S3 Key** — Encrypts S3 buckets
- **CloudWatch Logs Key** — Encrypts CloudWatch log groups
- **Lambda Key** — Encrypts Lambda environment variables
- **SNS Key** — Encrypts SNS topics
- **SQS Key** — Encrypts SQS queues
- **Secrets Manager Key** — Encrypts secrets
- **Managed AD Admin Key** — Encrypts Managed AD admin secrets (if configured)

### Central Logs Bucket (Log Archive account only)
- `<prefix>-central-logs-<accountId>-<region>` — Receives logs from all accounts
- Encrypted with a dedicated CMK
- Bucket policy allows:
    - CloudTrail, Config, ELB, VPC Flow Logs, and other services to write
    - All organization accounts to put objects
- Supports imported (existing) buckets via `importedBucket` config

### Server Access Logs Bucket
- Receives S3 server access logs for the central logs bucket

### ELB Access Logs Bucket
- Dedicated bucket for Elastic Load Balancer access logs
- Region-specific ELB account principal in bucket policy

### VPC Flow Logs Bucket
- S3 destination for VPC flow logs (when S3 destination is configured)

### Assets Bucket
- Stores accelerator assets (firewall configs, custom scripts)
- Can be imported from an existing bucket

### Metadata Bucket
- Stores accelerator metadata

### SNS Topics
- Creates SNS topics defined in `global-config.yaml → snsTopics`
- SNS forwarder Lambda function for cross-account topic forwarding

### CloudWatch Log Replication
- In the log archive account: creates Kinesis Firehose delivery stream for log replication
- In other accounts: creates CloudWatch subscription filters to forward logs to the central account
- Supports exclusion lists per account/region/log group

### S3 Public Access Block
- Configures account-level S3 public access block settings

### FMS Notification Role
- IAM role for AWS Firewall Manager notifications (if FMS is enabled)

## Key Code Paths

| Component | File |
|-----------|------|
| Stack class | `accelerator/lib/stacks/logging-stack.ts` |
| Central logs bucket construct | `constructs/lib/aws-s3/central-logs-bucket.ts` |
| Firehose construct | `constructs/lib/aws-firehose/` |

## Config-to-Resource Mapping

| Config Property | Resource Created |
|----------------|-----------------|
| `global-config.yaml → logging.centralLogBucket` | Central S3 logs bucket + CMK |
| `global-config.yaml → logging.cloudwatchLogs` | CloudWatch log replication infrastructure |
| `global-config.yaml → logging.cloudwatchLogs.exclusions` | Exclusion filters for log replication |
| `global-config.yaml → snsTopics` | SNS topics + subscriptions |
| `security-config.yaml → centralSecurityServices.ebsDefaultVolumeEncryption` | EBS default encryption key |
| `security-config.yaml → centralSecurityServices.s3PublicAccessBlock` | Account-level S3 public access block |

## Cross-Stack Dependencies

### Reads
- Accelerator CMK ARN from Key stack

### Writes (SSM Parameters)
- Central logs bucket name and CMK ARN
- All service-specific KMS key ARNs (S3, CloudWatch, Lambda, SNS, SQS, Secrets Manager)
- ELB logs bucket name
- VPC flow logs bucket ARN
- Assets bucket name and CMK ARN

### Read By
- Security, SecurityResources, Operations, Network stacks all read KMS key ARNs
- Network stacks read VPC flow logs bucket ARN

## Common Issues

| Error | Cause | Resolution |
|-------|-------|------------|
| Bucket policy size exceeded | Too many account principals in central logs bucket policy | Use organization-level conditions instead of per-account principals |
| KMS key policy limit | Key policy document exceeds 32KB | Consolidate policy statements |
| CloudWatch subscription filter quota warning in the `Custom::UpdateSubscriptionFilter` logs | Log group already has 5 subscription filters (the CloudWatch Logs quota), so the LZA filter is not added | Remove an unused subscription filter, or exclude the log group, and rerun the pipeline |
