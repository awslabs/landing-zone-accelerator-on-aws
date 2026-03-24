# Landing Zone Accelerator (LZA) Cleanup Script

## Overview
This script automates the cleanup process for Landing Zone Accelerator (LZA) deployments on AWS. It creates a VPC, deploys an EC2 instance with necessary prerequisites, and systematically removes all LZA components. The script is particularly useful for:

- Reducing AWS costs by removing unused LZA resources
- Testing deployment changes in a controlled manner
- Performing complete end-to-end validation of LZA configurations
- Cleaning up development and testing environments

The cleanup process includes:
- Removal of security service configurations
- Deletion of networking components
- Cleanup of CloudWatch logs
- Removal of ECR repositories
- Disabling delegated administrator accounts
- Cleanup of AWS Control Tower configurations

The script handles the complex task of ensuring proper resource deletion order and manages dependencies between different AWS services deployed by LZA.

⚠️ **WARNING**: This script will destroy all components of Landing Zone Accelerator and the resources it deployed, including security service configurations and networking!

⚠️ **WARNING**: The uninstaller will only function if all accounts are successfully registered in Control Tower and you have no suspended accounts. To register any accounts that are not registered follow [this guidance](https://docs.aws.amazon.com/controltower/latest/userguide/enroll-account.html). To recover suspended accounts temporarily follow [this guidance](https://repost.aws/knowledge-center/reactivate-suspended-account).

## Prerequisites
- Must be run from the management account
- Must be executed in the home region where LZA was deployed
- All accounts must be successfully registered in Control Tower
- No suspended accounts should exist

## Script Parameters

| Parameter Name | Description | Default Value |
|----------------|-------------|---------------|
| LandingZoneAcceleratorStackName | Name of the LZA installation stack | AWSAccelerator-InstallerStack |
| LatestAmiId | Systems Manager key for latest AMI lookup | /aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2 |
| DeleteInstallerStack | Whether to remove the original installer stack | true |
| DeleteConfigRepository | Whether to remove the LZA configuration repository | true |

## Execution Steps

1. Sign in to the AWS Management Console of your organization's management account
2. Launch the Landing-zone-accelerator-on-aws-cleanup AWS CloudFormation template
3. Monitor progress in CloudWatch:
   - Open CloudWatch console
   - Navigate to Log groups
   - Search for "landing-zone-accelerator-on-aws-cleanup"
   - Select the latest instance ID log stream

## Manual Cleanup Steps
After script execution, some resources require manual cleanup:

1. CloudWatch Log Groups:
   - Search for log groups with "Accelerator"
   - Delete all matching log groups

2. ECR:
   - Delete repository beginning with "cdk-accel-container-assets"

3. GuardDuty:
   - Disable delegated administration account in your Home Region

## Running the Uninstaller Directly

The uninstaller can be invoked directly from the command line in two modes.

### Pipeline Mode (standard deployment)

Use this when LZA was deployed via the installer CloudFormation stack and CodePipeline:

```bash
yarn run ts-node --transpile-only uninstaller.ts \
  --installer-stack-name <INSTALLER_STACK_NAME> \
  --partition aws \
  --full-destroy
```

### Container Build Mode (manual / local deployment)

Use this when LZA was deployed via the installer Cloudformation stack for Fargate and ECS:

```bash
yarn run ts-node --transpile-only uninstaller.ts \
  --container-build \
  --config-path <PATH_TO_LZA_CONFIG_DIR> \
  --partition aws \
  --full-destroy
```

In container build mode the tool reads the accelerator prefix and qualifier directly from CLI parameters instead of discovering them from CodeBuild environment variables.

#### Container Build Mode Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `--container-build` | Yes | `false` | Enables container build mode. Mutually exclusive with `--installer-stack-name`. |
| `--config-path` | Yes | — | Path to the local LZA configuration directory containing `global-config.yaml`. |
| `--accelerator-prefix` | No | `AWSAccelerator` | The prefix used when LZA stacks were deployed. Only needed if a custom prefix was used. |
| `--accelerator-qualifier` | No | — | The qualifier used when LZA was deployed with a custom qualifier. Only needed if a qualifier was used. |
| `--management-account-id` | No | — | The management account ID. Only needed when running from a separate pipeline account. Must be used together with `--management-account-role-name`. |
| `--management-account-role-name` | No | — | The IAM role name to assume in the management account. Required when `--management-account-id` is provided. |

#### Common Parameters (both modes)

| Parameter | Description |
|-----------|-------------|
| `--partition` | AWS partition (e.g. `aws`, `aws-cn`, `aws-us-gov`). Default: `aws`. |
| `--full-destroy` | Delete everything including bootstrap stacks and perform final cleanup. |
| `--delete-accelerator` | Delete all accelerator-deployed stacks and resources. |
| `--keep-pipeline` | Used with `--delete-accelerator`. Preserves the LZA pipeline and config repo. |
| `--keep-data` | Used with `--delete-accelerator`. Preserves S3 buckets and CloudWatch log groups. |
| `--keep-bootstraps` | Used with `--delete-accelerator`. Preserves CDK bootstrap stacks. |
| `--stage-name` | Delete stacks from the specified pipeline stage to the end. |
| `--action-name` | Delete stacks from the specified pipeline action to the end. |
| `--debug` | Enable verbose debug logging. |

#### Examples

Full destroy with a custom qualifier:
```bash
yarn run ts-node --transpile-only uninstaller.ts \
  --container-build \
  --config-path /path/to/lza-config \
  --accelerator-qualifier myorg \
  --partition aws \
  --full-destroy
```

Delete accelerator stacks only, preserving pipeline and data:
```bash
yarn run ts-node --transpile-only uninstaller.ts \
  --container-build \
  --config-path /path/to/lza-config \
  --partition aws \
  --delete-accelerator \
  --keep-pipeline \
  --keep-data
```

Running from a separate pipeline account:
```bash
yarn run ts-node --transpile-only uninstaller.ts \
  --container-build \
  --config-path /path/to/lza-config \
  --management-account-id 111122223333 \
  --management-account-role-name AWSControlTowerExecution \
  --partition aws \
  --full-destroy
```

## Troubleshooting

If the uninstallation fails, you can:
1. Check the log stream for error messages
2. Update the stack by incrementing the RunNumber parameter
3. Access the instance via AWS Systems Manager Session Manager using these commands:

```bash
sudo -i
cd /landing-zone-accelerator-on-aws/source/packages/@aws-accelerator/tools/
yarn run ts-node --transpile-only uninstaller.ts \
  --installer-stack-name <INSTALLER_STACK_NAME> \
  --partition aws \
  --full-destroy
```

### Helpful Commands
To list delegated administrator accounts:
```bash
aws organizations list-delegated-administrators
```

To list services delegated to an administration account:
```bash
aws organizations list-delegated-services-for-account --account-id <account ID>
```