# Cost and Quotas

## Estimated Cost

The estimated cost for running the Landing Zone Accelerator using the [sample configuration](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/reference/sample-configurations/lza-sample-config) with AWS Control Tower in US East (N. Virginia) within a non-critical sandbox environment with no activity or workloads is approximately **$430 USD per month**.

For a detailed cost breakdown, see the [Cost](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/cost.html) section of the Implementation Guide.

!!! note
    Actual costs vary based on the number of accounts, enabled regions, and configured services. Use the [AWS Pricing Calculator](https://calculator.aws/) for environment-specific estimates.

## Key Service Quotas

### CloudFormation

| Quota | Default | Relevance |
|-------|---------|-----------|
| Stacks per account | 2,000 | V2 network stacks create up to 8 stacks per VPC. Plan accordingly. |
| Resources per stack | 500 | Primary reason for V2 stack splitting. Enable `useV2Stacks: true` if approaching this limit. |
| Outputs per stack | 200 | Can be hit with many SSM parameters |

### AWS Organizations

| Quota | Default | Relevance |
|-------|---------|-----------|
| SCPs per target | 5 | LZA validates this during the Prepare stage |
| Accounts per organization | 10 (soft limit) | Request increase before deploying many workload accounts |

### AWS Fargate (container deployment)

| Quota | Default | Relevance |
|-------|---------|-----------|
| Fargate On-Demand vCPU resource count (`L-3032A538`) | 6 ([Amazon ECS endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/ecs-service.html)) | The container deployment task requests 8 vCPU. Raise the quota to at least 8 in the home Region of the LZA deployment account before the first run, or the RunEngine automation fails at the RunTask step |

### AWS Config

| Quota | Default | Relevance |
|-------|---------|-----------|
| Config rules per account/region | 400 | Can be reached with many rule sets |

### SSM Parameter Store

| Quota | Default | Relevance |
|-------|---------|-----------|
| Parameters per account/region | 10,000 | LZA creates many SSM parameters for cross-stack references |

### VPC

| Quota | Default | Relevance |
|-------|---------|-----------|
| VPCs per region | 5 | Request increase for multi-VPC deployments |
| Subnets per VPC | 200 | Relevant for large VPC configurations |

## Requesting Quota Increases

LZA can automatically request service limit increases via the Operations stack. Configure in `global-config.yaml → limits`.

For manual increases, use the [Service Quotas console](https://console.aws.amazon.com/servicequotas/).
