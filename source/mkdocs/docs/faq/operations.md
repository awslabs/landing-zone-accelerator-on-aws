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