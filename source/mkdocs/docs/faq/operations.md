# Operations FAQ

## How do I manage my organizational units (OUs) when using CT and Landing Zone Accelerator?

All OUs and accounts that you create in CT are governed automatically by CT. OUs that are generated outside of CT require you to manually enroll the OU with CT before it can be managed and governed by CT. When using CT and Landing Zone Accelerator together, Landing Zone Accelerator will not automate the creation of additional OUs, as there is currently not an automated mechanism to enroll the newly created OU with CT. This design decision minimizes opportunities for environment drift with CT.

When using Landing Zone Accelerator without CT, this additional step is not required.

For more information on enrolling OUs in Landing Zone Accelerator, please see [Adding an Organizational Unit (OU)](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/performing-administrator-tasks.html#adding-an-organizational-unit-ou) in the solution implementation guide.

## How do I create additional accounts when using CT and Landing Zone Accelerator?

When new account entries are added to the Landing Zone Accelerator `accounts-config.yaml` configuration file and the Core pipeline is released, Landing Zone Accelerator will utilize the CT Account Factory Service Catalog product to generate the new accounts. Similar to OUs, accounts that are generated outside of CT require you to enroll the account with CT before it can be managed and governed by CT. If you create an account outside of Control Tower (likely directly through the Organizations console or API), you can add the account information to the Landing Zone Accelerator configuration and the solution will automatically enroll the new account into CT using the CT Account Factory Service Catalog product.

For more information on enrolling new accounts in Landing Zone Accelerator, please see [Adding a new account](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/performing-administrator-tasks.html#adding-a-new-account) in the solution implementation guide.

## How do I add existing accounts when using CT and Landing Zone Accelerator?

Please refer to [Adding an existing account](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/performing-administrator-tasks.html#adding-an-existing-account) in the solution implementation guide for guidance on adding an existing account to your Landing Zone Accelerator environment.

## How do I manage my SCPs when using CT and Landing Zone Accelerator?

You can use Landing Zone Accelerator to deploy custom SCPs into your environment in addition to the SCPs that are deployed and managed by CT. Landing Zone Accelerator will only manage SCPs that are part of the accelerator configuration, and will not manage any SCPs that are deployed by CT. Note, Organizations sets a limit of 5 SCPs per OU and CT will consume up to 3 SCPs which will leave 2 additional SCPs that you can add. For finer grained SCPs, Landing Zone Accelerator also allows you to deploy custom SCPs to specific accounts.

For more information on managing SCPs in Landing Zone Accelerator, please see [Adding a Service Control Policy (SCP)](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/performing-administrator-tasks.html#adding-a-service-control-policy-scp) in the solution implementation guide.

## How do I troubleshoot deployment and validation errors?

Common troubleshooting scenarios are documented in the [Troubleshooting](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/troubleshooting.html) section of the solution implementation guide. This section will continue to grow with additional scenarios as common deployment and environment validation error cases are reported.

## How do I troubleshoot AWS Control Tower Landing Zone deployment and validation errors?

It is recommended that you refer to the AWS Control Tower [pre-requisites](./ct-cfct.md#can-i-deploy-or-manage-existing-aws-control-tower-in-landing-zone-accelerator-solution) before troubleshooting any issues related to AWS Control Tower Landing Zone deployment.

##### Common Errors

`AWSOrganizationsNotInUseException: Your account is not a member of an organization. in accounts-config.yaml config file`

Landing Zone Accelerator may return an error during configuration validation if AWS Organizations is not configured. Please configure AWS Organizations before deploying the solution. In order to learn more about setting up an AWS organization, you may refer to this [Creating an organization](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_org_create.html)

`AWS Control Tower Landing Zone cannot deploy because AWS Organizations have not been configured for the environment.`

AWS Control Tower Landing Zone can be deployed using the Landing Zone Accelerator solution when AWS Organizations configured in the environment. AWS Organizations should be configured with all features enabled before Landing Zone Accelerator can be deployed. In order to learn more about setting up an AWS organization, you may refer to this [Creating an organization](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_org_create.html). After you create an organization and before you can deploy Landing Zone Accelerator solution, you must verify that you own the email address provided for the management account in the organization. 

`AWS Control Tower Landing Zone cannot deploy because there are multiple organizational units in AWS Organizations.`

The Landing Zone Accelerator solution cannot deploy AWS Control Tower Landing Zone when there are organizational units in AWS Organizations. Prior to deploying the solution, it is necessary to clean up existing organizational units. When there are existing organizational units within the AWS Organizations, it is recommended that AWS Control Tower Landing Zone is manually deployed prior to the deployment of the solution. By adding `landingZone` [ControlTowerLandingZoneConfig](../typedocs/latest/classes/_aws_accelerator_config.ControlTowerLandingZoneConfig.html) configuration, you can manage existing AWS Control Tower Landing Zone.

`AWS Control Tower Landing Zone cannot deploy because there are multiple accounts in AWS Organizations.`

The Landing Zone Accelerator solution cannot deploy AWS Control Tower Landing Zone when there are additional accounts in AWS Organizations. AWS Organizations can have only management account. When there are existing AWS accounts within the AWS Organizations, it is recommended that AWS Control Tower Landing Zone is manually deployed prior to the deployment of the solution. By adding `landingZone` [ControlTowerLandingZoneConfig](../typedocs/latest/classes/_aws_accelerator_config.ControlTowerLandingZoneConfig.html) configuration, you can manage existing AWS Control Tower Landing Zone.

`AWS Control Tower Landing Zone cannot deploy because IAM Identity Center is configured.`

The Landing Zone Accelerator solution cannot deploy AWS Control Tower Landing Zone when there is existing IAM Identity Center configured. When there is existing IAM Identity Center configured, it is recommended that AWS Control Tower Landing Zone is manually deployed prior to the deployment of the solution. By adding `landingZone` [ControlTowerLandingZoneConfig](../typedocs/latest/classes/_aws_accelerator_config.ControlTowerLandingZoneConfig.html) configuration, you can manage existing AWS Control Tower Landing Zone.

`AWS Control Tower Landing Zone cannot deploy because AWS Organizations have services enabled.`

The Landing Zone Accelerator solution cannot deploy AWS Control Tower Landing Zone when there are trusted access with any AWS service is enabled for AWS Organizations. When when there are trusted access with any AWS service is enabled for AWS Organizations, it is recommended that AWS Control Tower Landing Zone is manually deployed prior to the deployment of the solution. By adding `landingZone` [ControlTowerLandingZoneConfig](../typedocs/latest/classes/_aws_accelerator_config.ControlTowerLandingZoneConfig.html) configuration, you can manage existing AWS Control Tower Landing Zone.

`The landing zone update operation failed with error - ConflictException - AWS Control Tower cannot begin landing zone setup while another execution is in progress.`,

The Landing Zone Accelerator solution cannot update or reset AWS Control Tower Landing Zone when there is already an execution in progress. The current AWS Control Tower change operation must be completed before you can proceed.

 `AWS Control Tower Landing Zone's most recent version is <LATEST_VERSION>, which is different from the version <CONFIG_VERSION> specified in global-config.yaml file.` 
  
Landing Zone Accelerator cannot update or reset AWS Control Tower Landing Zone if the Landing Zone version does not match the latest version of the AWS Control Tower Landing Zone. In order to resolve this issue, it is recommended that you review the [AWS Control Tower release notes](https://docs.aws.amazon.com/controltower/latest/userguide/release-notes.html), and update the version property of `landingZone` [ControlTowerLandingZoneConfig](../typedocs/latest/classes/_aws_accelerator_config.ControlTowerLandingZoneConfig.html) configuration. Alternatively, you may rollback [ControlTowerLandingZoneConfig](../typedocs/latest/classes/_aws_accelerator_config.ControlTowerLandingZoneConfig.html) configuration changes so that the solution does not attempt to update the AWS Control Tower Landing Zone. In the event the current AWS Control Tower Landing Zone drifts, the solution will attempt to reset the landing zone, which will require the latest version to be specified in the configuration.

`AWS Control Tower operation with identifier <OPERATION_IDENTIFIER> in FAILED state !!!!. Please investigate CT operation before executing pipeline`

Landing Zone Accelerator returns this error when creating a AWS Control Tower Landing Zone fails with any errors. Resolve the root cause of the AWS Control Tower setup failure before retrying the failed stage of the Landing Zone Accelerator pipeline. It may be possible to identify the root cause of the issue by reviewing AWS CloudTrail trails or AWS CloudFormation stacks. It should be noted that if the home region for the environment is different from the [global region](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/prerequisites.html#ensure-your-global-region-is-accessible), you may need to review trails in the global region as well to identify the root cause.