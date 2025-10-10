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

## Troubleshooting

If the uninstallation fails, you can:
1. Check the log stream for error messages
2. Update the stack by incrementing the RunNumber parameter
3. Access the instance via AWS Systems Manager Session Manager using these commands:

```bash
sudo -i
cd /landing-zone-accelerator-on-aws/source/packages/@aws-accelerator/tools/
yarn run --verbose ts-node --transpile-only uninstaller.ts --installer-stack-name <REPLACE_WITH_YOUR_INSTALLER_STACK_NAME> \
--ignore-termination-protection true --full-destroy true --installer-delete <REPLACE_WITH_true_OR_false> \
--delete-config-repo <REPLACE_WITH_true_OR_false> --partition aws --delete-data \
--ignore-termination-protection --delete-bootstraps true --delete-pipelines
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