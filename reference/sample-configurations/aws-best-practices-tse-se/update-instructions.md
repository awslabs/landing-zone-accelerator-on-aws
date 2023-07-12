# Updating the Landing Zone Accelerator version

To upgrade your LZA to the latest version you should follow the [update instructions from the LZA implementation guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/update-the-solution.html). The current page contains additional instructions specific to this reference configuration.

### Update Preparation

Before proceeding with the update you should carefully review the release notes for every version and identify any configuration changes that are mandatory or recommended.

- Review the [LZA release notes](https://github.com/awslabs/landing-zone-accelerator-on-aws/releases)
- Review new configuration items from the LZA release notes, assess the new defaults and integrate them into your configuration
- Review configuration changes to the [default configuration files](./config/) and determine which change you need to apply to your configuration

### General update steps

1. Login to your Organization Management (root) AWS account with administrative privileges
2. Either: a) Ensure a valid Github token is stored in secrets manager ([per the installation guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/prerequisites.html#create-a-github-personal-access-token-and-store-in-secrets-manager)), or b) Ensure the latest release is in a valid branch of CodeCommit in the Organization Management account
3. Before updating: Run the pipeline with the current version and confirm a sucessful execution
4. Review and implement any relevant tasks noted in the **Update Preparation** section above
5. Update the configuration files in the `aws-accelerator-config` **CodeCommit** repository as outlined in the **Update Preparation** section above
6. Sign in to the AWS CloudFormation console, select your existing Landing Zone Accelerator on AWS CloudFormation stack and Update the stack with the latest template available from the release page. ([refer to the LZA implementation guide for detailed steps](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/update-the-solution.html))
7. When reviewing the Stack Parameters, make sure to update the `RepositoryBranchName` value to point to the branch of the latest release (i.e. release/v.X.Y.Z)
8. Wait for successful execution of the Landing Zone Accelerator stack update and the `AWSAccelerator-Installer` and `AWSAccelerator-Pipeline` pipelines

## Release Specific Update Considerations

Changes to this configuration are released at the same time than LZA releases and share the same version numbers.

### v1.3.0

The first version of this reference configuration was released with LZA version 1.3.0.

### v1.4.0

This version introduces support for Control Tower in the configuration. **IMPORTANT**: Control Tower can only be enabled in the initial installation and not through an update.

This version includes updates to some SCP statements, make sure to compare the changes and apply them to your configuration

Security groups defined in shared VPCs are now replicated to accounts where the subnets are shared. If you reference a prefix list from a security group, you need to update the deployment targets of the prefix list to deploy the prefix list in all shared accounts. (network-config.yaml)

Lambda runtimes for AWS Config rules were updated to NodeJs16. (security-config.yaml)

### Next release

- Use dedicated AWSAccelerator-RDGW-Role for Managed Active Directory management instance
- Deployment of default Web, App and Data security groups in all VPCs and workload accounts (ASEA parity)
- Add configuration to delete rules of default security groups. Best practice is to not use the default security groups. Please review if your existing workloads use the default security groups before applying this change
- Add deployment of interface endpoints for Secrets Manager, CloudFormation and Monitoring (ASEA parity)
- SCP updates for granular billing permissions
- Add additional Route Table entries in the GWLB Perimeter Subnets to target the NWFW
