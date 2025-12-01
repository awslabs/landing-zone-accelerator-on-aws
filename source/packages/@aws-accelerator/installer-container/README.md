# @aws-accelerator/installer-container

CDK application that deploys the Landing Zone Accelerator (LZA) installer using ECS Fargate in a containerized environment.

## Overview

This package creates infrastructure to run LZA deployment via an ECS Fargate task orchestrated by AWS Systems Manager Automation. It supports both new and existing VPC configurations, external pipeline accounts, and permission boundaries.

## Input Required

### CloudFormation Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `EcrUri` | String | Yes | ECR repository URI containing LZA container image |
| `ManagementAccountEmail` | String | Yes | Management account email (must match AWS Organizations) |
| `LogArchiveAccountEmail` | String | Yes | Log archive account email |
| `AuditAccountEmail` | String | Yes | Security audit account email |
| `ControlTowerEnabled` | String | Yes | `Yes` or `No` - Whether deploying to Control Tower environment |
| `AcceleratorPrefix` | String | No | Resource name prefix (default: `AWSAccelerator`, max 15 chars) |
| `NodeRuntimeVersion` | Number | No | Node.js runtime version for SSM Document `aws:executeScript` (allowed: `20`, `22`, `24`, default: `22`) |
| `UseExistingConfig` | String | No | `Yes` or `No` - Use existing configuration bucket |
| `ExistingConfigBucketName` | String | Conditional | Required if `UseExistingConfig=Yes` |
| `ExistingConfigBucketKey` | String | Conditional | Branch name for config bucket, required if `UseExistingConfig=Yes` |
| `UseExistingVpc` | String | No | `Yes` or `No` - Use existing VPC for ECS tasks |
| `ExistingVpcId` | AWS::EC2::VPC::Id | Conditional | Required if `UseExistingVpc=Yes` - VPC ID for validation |
| `ExistingSubnetId` | AWS::EC2::Subnet::Id | Conditional | Required if `UseExistingVpc=Yes` - Must be in specified VPC |
| `ExistingSecurityGroupId` | AWS::EC2::SecurityGroup::Id | Conditional | Required if `UseExistingVpc=Yes` - Must be in specified VPC |
| `VpcCidr` | String | No | CIDR block for new VPC (default: `10.0.0.0/16`) |

### Context Variables (External Pipeline Account)

When `use-external-pipeline-account=true`:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `AcceleratorQualifier` | String | Yes | Unique identifier for pipeline resources in external account |
| `ManagementAccountId` | String | Yes | Target management account ID |
| `ManagementAccountRoleName` | String | Yes | Cross-account role name in management account |

### Context Variables (Permission Boundary)

When `use-permission-boundary=true`:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `PermissionBoundaryPolicyName` | String | Yes | IAM permission boundary policy name |

## How to Synth

### Basic Deployment

```bash
cd source/packages/@aws-accelerator/installer-container
cdk synth
```

### With External Pipeline Account

```bash
cdk synth \
  -c use-external-pipeline-account=true
```

### With S3 Source

```bash
cdk synth \
  -c use-s3-source=true \
  -c s3-source-kms-key-arn=arn:aws:kms:region:account:key/key-id
```

### With Permission Boundary

```bash
cdk synth \
  -c use-permission-boundary=true
```

### Single Account Mode

```bash
cdk synth \
  -c enable-single-account-mode=true
```

### Combined Example

```bash
cdk synth \
  -c use-external-pipeline-account=true \
  -c use-permission-boundary=true \
  -c enable-single-account-mode=true
```

## Context Variables

| Context Key | Type | Default | Description |
|-------------|------|---------|-------------|
| `use-external-pipeline-account` | boolean | `false` | Deploy pipeline in external account separate from management account |
| `use-s3-source` | boolean | `false` | Use existing S3 bucket for LZA source code |
| `s3-source-kms-key-arn` | string | - | KMS key ARN for encrypted S3 source bucket |
| `management-cross-account-role-name` | string | - | Cross-account role name for management account access |
| `enable-single-account-mode` | boolean | `false` | Deploy LZA in single account without Organizations |
| `use-permission-boundary` | boolean | `false` | Apply IAM permission boundaries to all roles |
| `enable-set-node-version` | boolean | `false` | Enable custom Node.js version configuration |

## Resources Created

### Core Infrastructure

- **KMS Key** (`InstallerKey`): Encryption key for installer resources with key rotation enabled
- **S3 Buckets**:
  - `InstallerAccessLogsBucket`: Server access logs bucket (SSE-S3)
  - `ConfigBucket`: Configuration bucket with versioning (SSE-KMS, conditional)
- **SSM Parameters**:
  - Stack ID
  - Accelerator version
  - KMS key ARN
  - Access logs bucket name

### Networking (Conditional - when `UseExistingVpc=No`)

- **VPC**: Single VPC with DNS support
- **Subnets**: 2 public + 2 private subnets across 2 AZs
- **NAT Gateways**: 2 NAT gateways with Elastic IPs
- **Internet Gateway**: For public subnet internet access
- **Route Tables**: Public and private route tables with associations
- **Security Group**: For ECS task network isolation
- **VPC Flow Logs**: CloudWatch Logs integration with 365-day retention

### ECS Infrastructure

- **ECS Cluster**: Fargate-enabled cluster
- **Task Definition**: 
  - CPU: 8192 (8 vCPU)
  - Memory: 32768 MB (32 GB)
  - Network Mode: `awsvpc`
  - Compatibility: EC2, FARGATE
- **IAM Roles**:
  - `EcsTaskRole`: AmazonECSTaskExecutionRolePolicy
  - `EcsExecutionRole`: AdministratorAccess (for orchestration)
- **CloudWatch Log Group**: `/ecs/{prefix}-lza-deployment` (365-day retention)

### Automation

- **SSM Automation Document** (`{prefix}-RunEngine`):
  - Runs ECS Fargate task in private subnet
  - Uses Node.js runtime for `aws:executeScript` actions (configurable via `NodeRuntimeVersion` parameter)
  - Waits for task completion (12-hour timeout)
  - Returns task ARN and CloudWatch log details
- **SSM Automation Role**: Permissions for ECS task execution



### Environment Variables (ECS Task)

| Variable | Value | Condition |
|----------|-------|-----------|
| `ENABLE_DIAGNOSTICS_PACK` | `No` | Always |
| `SkipPipelinePrerequisites` | `true` | Always |
| `SkipAcceleratorPrerequisites` | `true` | Always |
| `MANAGEMENT_ACCOUNT_ID` | Parameter value | External pipeline account |
| `MANAGEMENT_ACCOUNT_ROLE_NAME` | Parameter value | External pipeline account |
| `ACCELERATOR_QUALIFIER` | Parameter value | External pipeline account |
| `ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE` | `true` | Single account mode |
| `ACCELERATOR_PERMISSION_BOUNDARY` | Parameter value | Permission boundary enabled |

## CloudFormation Rules

### Validation Rules

1. **RequiredParametersForExistingRepo**: Validates `ExistingConfigBucketName` and `ExistingConfigBucketKey` when `UseExistingConfig=Yes`
2. **RequiredParametersForExistingVpc**: Validates `ExistingVpcId`, `ExistingSubnetId`, and `ExistingSecurityGroupId` when `UseExistingVpc=Yes`
3. **SubnetInVpcRule**: Validates the subnet belongs to the specified VPC (uses `Fn::ValueOfAll` to extract VPC ID from subnet parameter)
4. **SecurityGroupInVpcRule**: Validates the security group belongs to the specified VPC (uses `Fn::ValueOfAll` to extract VPC ID from security group parameter)
5. **UniqueAccountEmails**: Ensures management, log archive, and audit account emails are unique

### VPC Validation

When `UseExistingVpc=Yes`, CloudFormation validates at template submission time (before deployment):
- All three parameters (`ExistingVpcId`, `ExistingSubnetId`, `ExistingSecurityGroupId`) must be provided
- The subnet must belong to the specified VPC
- The security group must belong to the specified VPC

If validation fails, CloudFormation rejects the template with a clear error message before creating any resources.

## Security Features

- KMS encryption for all S3 buckets (except access logs)
- HTTPS-only bucket policies
- IAM permission boundaries (optional)
- VPC Flow Logs enabled
- Private subnet deployment for ECS tasks
- cdk-nag compliance checks with suppressions

## Deployment Flow

1. CloudFormation stack creates infrastructure
2. User invokes SSM Automation document (`{prefix}-RunEngine`)
3. SSM starts ECS Fargate task in private subnet
4. Task pulls container from ECR
5. Container runs LZA deployment pipeline
6. Logs stream to CloudWatch
7. SSM waits for task completion (up to 12 hours)
8. Returns task status and log location

## Notes

- Config bucket has RETAIN deletion policy
- VPC CIDR must be /16-/28 range
- Account emails must be valid and unique
- Node.js version for Lambda functions managed by `LzaLambdaRuntime` configuration
- Node.js version for SSM Document `aws:executeScript` actions configurable via `NodeRuntimeVersion` parameter (supports versions 20, 22, and 24)
- SSM automation script uses AWS SDK v3 for ECS operations
- Solution ID: SO0199
