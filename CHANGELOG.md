# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2022-09-22

### Added

- feat(iam): add path property to IAM RoleSets
- feat(logging): Allow configuration of CloudTrail Insights and configuration of Organization Trail
- feat(logging): Centralized Logging
- feat(network): add ability to configure Gateway Load Balancer
- feat(network): AWS Outpost Support
- feat(network): Add ability to configure Direct Connect
- feat(network): add ability to define gateway route tables
- feat(organizations): Update guardrail scp to include CloudTrail and CloudWatch Logs
- feat(partition): add support for aws-iso-b
- feat(s3): Apply Lifecycle Rules to Central Log Bucket
- feat(security): localize KMS key for every environment and service
- feat(security): Add Custom KMS CMKs
- enhancement(network): Add tags to RAM shared subnets/vpc

### Changed

- fix(budgets): Budget reports deployment targets bug
- fix(config): add checks for OU presence in organization config file from other config files where OUs are referred
- fix(config): Fix issues in network-config.yaml reference
- fix(iam): iam user password is not set properly
- fix(iam): Cross Account SSM parameter role creates in every region
- fix(installer): Updating git Personal Access Token not working once it's expired
- fix(installer): Fix duplicate execution of pipeline
- fix(logging):Update sessionmanager logging
- fix(logging): Existing organization trail fails in organization stack
- fix(logging) - lambdaKey lookup only in homeRegion
- fix(network): VPC templates rework
- fix(network): Fix bug with tcpFlags and source/destination bug with network firewall
- fix(network): move endpoint creation to new GWLB-specific stack
- fix(network): allow multiple VPCs to fetch a RAM share ID for the same IPAM pool or network firewall policy
- fix(network): VPC flowlog bucket exists failure when network-vpc stack updates with new vpc with s3 flow log destination
- fix(s3): added error logic for expiration values
- fix(security) AWS Macie ExportConfigClassification fails when new account added
- fix(security): Check keyManagementService for undefined
- fix(security): permissions for CrossAccountAcceleratorSsmParamAccessRole
- fix(security): When excluded in config, do not enable the automatically enabled standards for security hub
- fix(security): Fix issue with GuardDuty S3 protection not enabled in all accounts
- fix(security): Empty EBS encryption key in default config file causes pipeline failure
- fix(installer): Enable pipeline notification only for the regions that support AWS CodeStar
- chore(build): upgrade to cdk v2.28.0

## [1.1.0] - 2022-07-18

### Added

- feat(auditmanager): add support to enable AWS Audit Manager
- feat(cloudformation): enable termination protection for all stacks
- feat(config): Add the ability to add tags to AWS Config rules
- feat(controltower): add drift detection for AWS Control Tower
- feat(detective): add support to enable Amazon Detective
- feat(installer): add ability to launch the accelerator pipeline at completion of installer pipeline
- feat(network): add managed prefix list as a destination in subnet and tgw route tables
- feat(network): add ability to define Amazon Route 53 resolver SYSTEM rules
- feat(vpc): add ability to use IPAM address pools
- enhancement: add AWS GovCloud (US) sample configuration

### Changed

- fix(organizations): security services Amazon GuardDuty, Amazon Macie, and AWS Security Hub failing when multiple new regions registered
- fix(organizations): fix organizational unit creation and GovCloud account add to organization
- fix(iam): fix failing pipeline tests due to service linked role descriptions
- fix(network): vpc interface endpoints workflows for GovCloud
- fix(network): outbound NACL entries causing duplicate entry error
- fix(network): Add check for route entry types in network-vpc stack
- fix(route53): add uuid to r53association custom resource to force reevaluation
- enhancement(network): make route table target property optional
- enhancement(budget): budgets scope based on account or ou
- enhancement(backup): update backup vaults to use the accelerator key
- enhancement(pipeline): move config lint checks to build stage
- enhancement(organizations): add pitr to config table
- chore(build): update to javascript sdk v2.1152.0
- chore(build): upgrade to cdk v2.25.0
- chore(build): update lerna to 5.1.8
- chore(readme): update installer stack instructions
- chore(iam): Update default boundary policy to require MFA
- chore(installer): Added email constraints for installer stack

## [1.0.1] - 2022-06-03

### Changed

- fix(installer): require branch param in installer
- fix(accounts): accounts stack fails in GovCloud when enabling SERVICE_CONTROL_POLICY type
- enhancement: added more explicit error message in account config
- fix(controltower): support creation of new account in nested OU with Control Tower

## [1.0.0] - 2022-05-23

### Added

- All files, initial version
