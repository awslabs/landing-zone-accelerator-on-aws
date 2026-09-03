# Resource Naming Conventions

## Overview

`AcceleratorResourceNames` (`accelerator/lib/accelerator-resource-names.ts`) centralizes all naming conventions for LZA-created resources. Every stack uses this class to derive consistent names for IAM roles, SSM parameters, KMS keys, and S3 buckets.

## IAM Role Names

All cross-account roles follow the pattern `<prefix>-<purpose>-Role`:

| Role | Name Pattern | Purpose |
|------|-------------|---------|
| Cross-account SSM parameter | `<prefix>-CrossAccount-SsmParameter-Role` | Read SSM parameters across accounts |
| Central log bucket CMK | `<prefix>-<region>-CentralBucket-KeyArnParam-Role` | Access central log bucket CMK ARN |
| IPAM SSM parameter | `<prefix>-Ipam-GetSsmParamRole` | Read IPAM pool IDs |
| IPAM subnet lookup | `<prefix>-GetIpamCidrRole` | Look up IPAM subnet CIDRs |
| Cross-account logs | `<prefix>-CrossAccount-PutLogs-Role` | Write to central logs bucket |
| Cross-account TGW routes | `<prefix>-CrossAccount-TgwRoutes-Role` | Manage TGW routes cross-account |
| Cross-account VPN | `<prefix>-CrossAccount-SiteToSiteVpn-Role` | Manage VPN connections cross-account |
| Cross-account customer gateway | `<prefix>-CrossAccount-CustomerGateway-Role` | Create customer gateways cross-account |
| Move account config | `<prefix>-MoveAccountConfigRule-Role` | Config rule for account moves |
| TGW peering | `<prefix>-TgwPeering-Role` | TGW peering operations |
| MAD share accept | `<prefix>-MadShareAccept-Role` | Accept Managed AD shares |

## KMS Key Aliases

| Key | Alias Pattern | Used For |
|-----|--------------|----------|
| Accelerator key | `alias/<prefix>/kms/key` | General encryption in audit account |
| Management key | `alias/<prefix>/management/kms/key` | Management account resources |
| Central logs bucket | `alias/<prefix>/kms/s3/key` | Central logs S3 bucket |
| EBS default | `alias/<prefix>/ebs/default-encryption/key` | Default EBS volume encryption |
| CloudWatch logs | `alias/<prefix>/kms/cloudwatch/key` | CloudWatch log group encryption |
| SNS | `alias/<prefix>/kms/sns/key` | SNS topic encryption |
| Lambda | `alias/<prefix>/kms/lambda/key` | Lambda env var encryption |
| S3 | `alias/<prefix>/kms/s3/key` | S3 bucket encryption |
| Secrets Manager | `alias/<prefix>/kms/secrets-manager/key` | Secrets Manager encryption |
| SQS | `alias/<prefix>/kms/sqs/key` | SQS queue encryption |

## S3 Bucket Name Prefixes

| Bucket | Prefix Pattern |
|--------|---------------|
| CDK assets | `cdk-accel-assets-<accountId>-<region>` |
| Central logs | `<prefix>-central-logs-<accountId>-<region>` |
| ELB access logs | `<prefix>-elb-access-logs-<accountId>-<region>` |
| S3 access logs | `<prefix>-s3-access-logs-<accountId>-<region>` |
| Assets | `<prefix>-assets-<accountId>-<region>` |
| VPC flow logs | `<prefix>-vpc-flow-logs-<accountId>-<region>` |
| Firewall config | `<prefix>-firewall-config-<accountId>-<region>` |
| Cost usage | `<prefix>-cur-<accountId>-<region>` |
| Metadata | `<prefix>-metadata-<accountId>-<region>` |

## CloudFormation Stack Names

```
AWSAccelerator-<Stage>Stack-<AccountId>-<Region>
```

For V2 network stacks:
```
AWSAccelerator-NetworkVpc-<VpcName>-<ResourceType>-<AccountId>-<Region>
```

## Key Code Path

| Component | File |
|-----------|------|
| Resource names class | `accelerator/lib/accelerator-resource-names.ts` |
