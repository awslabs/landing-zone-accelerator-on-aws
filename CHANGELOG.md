# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.2] - 03-27-2024

### Fixed

- fix(replacements): throw error for undefined replacements
- fix(diff): dependent CloudFormation stacks not included in diff review stage
- fix(diff): customizations templates are not included in diff review stage
- fix(networking): ca-central-1 physical AZ subnet incorrect
- fix: metadata updates should execute on pipeline completion

### Changed

- chore(documentation): improvements to installation.md

## [1.6.1] - 02-21-2024

### Fixed

- fix(docs): resolve broken links to appropriate pages
- fix(networking): resolve duplicate construct error for endpoint security groups
- fix(networking): Fix Canada region physical AZ Subnet lookup

### Configuration Changes

- fix(docs): broken links in documentation
- fix(route53): associate hosted zones timeout
- chore(diagnostics-pack): cleanup

## [1.6.0] - 01-10-2024

### Added

- feat(budgets): Budget notifications accept array of email addresses
- feat(cloudwatch): provide the ability to use CloudWatch service key for LogGroup encryption
- feat(config-service): allow reference of public ssm documents
- feat(customizations): Enhance custom applications to deploy in shared VPC
- feat(firewalls): load firewall configuration from directory and support secret replacement
- feat(lambda): Allow option to use service key for AWS Lambda function environment variables encryption
- feat(networking): add support for targeting network interfaces
- feat(pipeline): use v2 tokens for sts
- feat(regions) Add il-central-1 region
- feat(replacements): added check for commented out replacements-config.yaml
- feat(replacements): extend dynamic parameter lookups
- feat(resource-policies): Support additional AWS services in resource based policies
- feat(s3): make the creation of access log buckets and S3 encryption CMK optional
- feat(ssm): add aggregated ssm region policy construct
- feat(support): add Diagnostic Pack support
- feat(validation): adds configuration validation for cmk replacement in the AWS config remediation lambda.
- feat(validation): add option to skip static validation

### Changed

- chore(documentation): added SBOM instructions to FAQ
- chore(documentation): added Architecture and Design Philosophy section to DEVELOPING.md
- chore(documentation): Update security hub cis 1.4.0 control examples
- chore(esbuild): update build target from node16 to node18
- enhancement(ebs): Add deployment targets to ebs encryption options
- enhancement(iam): added prefix condition to trust policies
- enhancement(logging): Add validation for s3 resource policy attachments against public block access
- enhancement(networking): allow ability to define static replacements for EC2 firewall configurations
- enhancement(networking): allow ability to deploy EC2 firewall in RAM shared VPC account
- enhancement(pipeline): optimize CodeBuild memory for over 1000 stacks
- enhancement(validation): Managed active directory secret config account validation

### Fixed

- fix(aspects): saml lookup for console login to non-standard partitions fails
- fix(budget): sns topic arn for budgets notifications
- fix(config-service): modify public ssm document name validation
- fix(guardduty): export findings frequency and exclude region settings for protections are ignored
- fix(iam): update the iam role for systems manager
- fix(logging): refactored CloudWatch Log exclusion filter to use regex
- fix(networking): Allow for Target Groups with type IP to be created within VPC without targets specified
- fix(networking): added explicit dependency between vpc creation and deletion of default vpc
- fix(networking): create network interface route for firewall in shared vpc
- fix(networking): reverted role name to VpcPeeringRole
- fix(networking): share subnets with tags causes SSM parameter race condition
- fix(networking): add dependency between networkAssociations and GWLB stages
- fix(operations): account warming fails
- fix(organizations): enablePolicyType function blocks tag and backup policy creation in GovCloud
- fix(pipeline): consolidate customizations into single app
- fix(pipeline): exit pipeline upon synth failure
- fix(pipeline): evaluate limits before deploying workloads
- fix(scp): Catch PolicyNotAttachedException when SCP is allow-list strategy
- fix(scp): Add organization_enabled variable to revertSCP Lambda function
- fix(ssm): intermittent failure in OperationsStack, added missing dependency
- fix(toolkit): enforce runOrder for custom stacks in customizations stage
- fix(validation): allow OUs and accounts for MAD shares
- fix(validation): Fix max concurrent stacks validation
- fix(validation): Add validation on static parameters for policy templates
- fix(validation): validate kmsKey and subnet deployment targets

### Configuration Changes

- chore(aws-best-practices-tse-se): migrated to new GitHub repository
- chore(aws-best-practices-cccs-medium): migrated to new GitHub repository

## [1.5.2] - 2023-11-15

### Fixed

- fix(toolkit): enforce runOrder for custom stacks in customizations stage
- fix(aspects): saml lookup for console login to non-standard partitions fails
- fix(pipeline): exit pipeline upon synth failure
- fix(pipeline): consolidate customizations into single app

### Changed

- chore: update libs per audit findings

### Configuration Changes

- chore: migrate cccs and tse-se configuration

## [1.5.1] - 2023-10-19

### Fixed

- fix(iam): Security_Resource stack failure to assume role into suspended and un-enrolled account
- fix(identity-center): operation stack AcceleratorLambdaKey construct already exists
- fix(customizations): Could not load credentials from any providers

## [1.5.0] - 2023-10-05

### Added

- feat(backup) add Backup vault policy
- feat(config): allow users to set stack concurrency
- feat(config) M2131 WAF logging enabled
- feat(control-tower): add control tower controls
- feat(identity-center): add IdentityCenter extended permission set and assignment
- feat(logging): enable non-accelerator subscription filter destination replacement
- feat(logging): move larger CloudWatch logs payloads back into kinesis stream for re-ingestion
- feat(networking): add ability to reference dynamic configuration file replacements and license files for EC2 firewalls
- feat(networking): add dynamic EC2 firewall site-to-site VPN connections and configuration replacements
- feat(networking): add exclude regions for default VPC
- feat(networking): allow gateway and interface endpoint service customizations
- feat(networking): Created Shared ALB and supporting resources (ACM, Target Groups)
- feat(replacements): support Policy Replacements in VPC Endpoint policies
- feat(s3): allow import of S3 buckets
- feat(s3): support lifecycle rules for given prefix
- feat(security-hub): allow customers to disable Security Hub CloudWatch logs
- feat(service-catalog): support service catalog product constraints
- feat(ssm): allow SSM replacements through replacements-config.yaml
- feat(ssm): allow creation of custom SSM parameters
- feat(tags): Support Customer Tags

### Changed

- enhancement(docs): add script to generate versioned TypeDocs
- enhancement(iam): make managed AD resolverRuleName property optional
- enhancement(networking): add ability to define advanced VPN tunnel configuration parameters
- enhancement(networking): add ability to dynamically reference same-VPC subnets as a route destination
- enhancement(networking): add ability to reference physical IDs for subnet availability zones and for Network Firewall endpoint lookups
- enhancement(networking): add AWSManagedAggregateThreatList to supported DNS firewall managed domain lists
- enhancement(pipeline): allow synth and deploy to write to stack specific directories
- enhancement(validation): Add config rule name validation
- enhancement(validation): add name uniqueness check for IAM policies and roles
- enhancement(validation): add validation for security delegated admin account
- chore(deps): bump semver to 7.5.2
- chore(deps): bump lerna to 7.2.0
- chore(deps): bump proxy-agent to 6.3.0
- chore(deps): bump aws-cdk to 2.93.0
- chore(docs): added instructions for validations and tests
- chore(docs): added documentation for excluded regions in audit manager
- chore(docs): document dynamic partitioning format in TypeDocs
- chore(docs): remove invalid targets for routeTableEntry
- chore(docs): update TransitGatewayAttachmentConfig docs to reflect subnet update behavior
- chore(docs): updated typedoc example for budget notifications
- chore(docs): update maxAggregationInterval to match appropriate unit
- chore(docs): VPC Flow Logs central logging method indicated service-native S3 logging
- chore(logging): add accelerator roles to central bucket policy
- chore(organizations): Moved getOrgId function to config
- chore(organizations): Removed Check for Tag and Backup policies in AWS GovCloud
- chore(test): update test pipeline lambda functions to Node.js 16 runtime
- chore(utils): moved chunkArray to utils
- chore(validation): Remove let from config validation
- chore: license file updates
- chore: refactor engine to reduce complexity
- chore: updated dependencies for aws-sdk

### Fixed

- fix(accelerator-prefix): accelerator prefix remains hardcoded in some constructs
- fix(accounts): allow Control Tower account enrollment in GovCloud
- fix(acm): Duplicate certificate imported on CR update
- fix(applications): allow launchTemplates without userData, remove securityGroup checks
- fix(audit-manager): excluded regions list ignored in security audit stack
- fix(bootstrap): synth large environments runs out of memory
- fix(cdk): fixed promise bug for parallel deployments
- fix(cloudwatch): log replication with exclusion times out
- fix(cloudwatch): Updated logic to deploy CW log groups to OUs
- fix(customizations): make security groups optional in launch templates
- fix(deployment) - Enforce IMDS v2 for Managed Active Directory controlling EC2 instance
- fix(guardduty): create guardduty prefix in s3 destination when prefix deleted by life cycle policy
- fix(guardduty): support account create and delete actions for more than 50 accounts
- fix(guardduty): Delete publishing destination when enabled is false
- fix(guardduty): Updated createMembers function to use SDKv3
- fix(iam): remove permissive runInstance from policy
- fix(iam): add IAM validation for roles, groups, users to Policies
- fix(iam): failed to assume role with static partition
- fix(iam): Added error handling for service linked role already existing
- fix(iam): update boundary control policy IAM get user actions
- fix(identity-center): incorrect sso regional endpoint
- fix(identity-center): fix api rate exceeded issue
- fix(limits): Allow service quota limits to be defined with regions
- fix(logging): change kms key lookup for central bucket
- fix(logging): fixed logging stack deployment order
- fix(logging): central log bucket cmk role exists when centralized logging changed
- fix(logging): enable CloudWatch logging on Firehose
- fix(logging): Add prefix creation for imported central log buckets
- fix(logging): add firehose records processor to exclusion list default
- fix(logging): compress logs within lambda and set firehose transform to uncompressed
- fix(MAD): Remove key pair from MAD instance
- fix(networking): duplicate construct error when creating GWLB endpoints in multiple VPCs under the same account
- fix(networking): fix underscore subnet names
- fix(networking): Transit gateway peering fails when multiple accepter tgw has multiple requester
- fix(networking): Fixed IPv6 validation for Prefix Lists
- fix(networking): incorrect private hosted zones created for interface endpoint services with specific API subdomains
- fix(networking): AZ not defined error when outpost subnet is configured
- fix(networking): fixed isTarget conditions for target groups
- fix(networking): update regional conditions for shared ALBs
- fix(networking): EC2 firewall config replacements incorrectly matches multiple variables on a single line
- fix(networking): EC2 firewall config replacements missing hostname lookup
- fix(organizations): load ou units asynchronously
- fix(pipeline): useManagementAccessRole optional
- fix(pipeline): time out in CodePipeline Review stage
- fix(pipeline): change assume role behavior on management account
- fix(pipeline): add nagSupression to firewall service linked role
- fix(pipeline): toolkit does not use prefix variable
- fix(replacements): Updated generatePolicyReplacements arguments to include organization id
- fix(roles): add UUID to service linked role to prevent accidental deletion
- fix(roles): make security audit stack partition aware
- fix(roles): add delay on service linked role creation
- fix(roles): create service linked role in custom resource
- fix(saml): SAML login is hardcoded
- fix(s3): access logs bucket external policy fix
- fix(scp): scpRevertChanges should use accelerator prefix
- fix(security): bring your own KMS key cannot reference service-linked roles in key policy file
- fix(security): Increased memory for GuardDuty custom resource
- fix(security): custom config rule discarding triggering resource types
- fix(ssm): PutSsmParameter upgrade from v1.3.x to v1.4.2+ fails
- fix(ssm): Added check to see if roles exist before policy attachment
- fix(sso): Added validation to flag permission set assignments created for management account
- fix(tagging): Accel-P tag is appropriately set on resources
- fix(uninstaller) detach customer policies prior to delete
- fix(validation): Add config rule name validation
- fix(validation): validate certificate deployment target
- fix(validation): undefined Config remediation target account name causes false positive

### Configuration Changes

- enhancement(aws-best-practices): Added README for Best Practices
- enhancement(aws-best-practices): Update Macie Permissions
- enhancement(aws-best-practices): apply SCPs to security OU
- enhancement(aws-best-practices-govcloud):update AWS GovCloud(US) configuration per FedRAMP assessment
- chore(education): migrate EDU sample configuration directory to external repository
- chore(elections): remove election sample directory
- chore(config): cccs/tse Config updates

## [1.4.3] - 2023-07-19

### Fixed

- fix(logging): cloudwatch logging, change log format in firehose to json
- fix(organizations): large OU organizations fail to load during prepare stage
- fix(networking): cannot provision new IPAM subnets when VPC has CIDRs from non-contiguous CIDR blocks
- fix(networking): Modify Transit Gateway resource lookup construct ids
- fix(validate-config): ValidateEnvironmentConfig improperly evaluates enrolled CT accounts as not enrolled

### Configuration Changes

- chore(aws-best-practices-tse-se): include granular billing SCP permission updates
- chore(aws-best-practices-cccs-medium): include granular billing SCP permission updates

## [1.4.2] - 2023-06-16

### Fixed

- fix(ssm): PutSsmParameters custom resource ignores new accounts
- chore(organizations): moved getOrganizationId to organizations-config
- fix(iam): service linked roles fail to create in multi-region deployment
- fix(validation): TGW route validation fails when prefixList deployment targets do not have excluded regions
- fix(validation): incorrectly configured security delegated admin account isn’t caught by validation
- fix(docs): README indicates S3 server access logs are replicated to central logs bucket

## [1.4.1] - 2023-05-18

### Fixed

- fix(route53): route53 resolver configuration depends on Network Firewall configuration
- fix(config): AWS Config recorder failure when enabled in new installation
- fix(installer): set default value for existing config repository parameters
- fix(networking): non-wildcard record missing in hosted zone for centralized S3 interface endpoints
- chore(bootstrap): update CDK version to 2.79.1
- chore(lambda): Increased memory size of custom resources

## [1.4.0] - 2023-05-03

### Added

- feat(config): Utilize existing AWS Config Service Delivery Channel
- feat(installer): Support custom prefix for LZA resources
- feat(logging) Add S3 prefix to Config Recorder delivery channel
- feat(networking): Added deploymentTargets property for prefix lists
- feat(networking): add ability to reference same-account IPAM subnets in Security Groups and NACLs
- feat(scp): Implement SCP allow-list strategy
- feat(security-config) Add ability to define CloudWatch Log Groups
- feat(security hub): allow definition of deploymentTargets for Security Hub standards
- feat(validation): verify no ignored OU accounts are included in accounts-config file

### Changed

- chore(app): Update AWS CDK version to 2.70.0
- chore(docs): adding optional flags and replacement warnings to SecurityConfig and NetworkConfig
- chore(network): network stack refactor to assist in development efforts
- enhancement(cdk): Configure CDK to use managementAccountAccessRole for all actions
- enhancement(logging): Reduce logging in firehose processor to optimize cost
- enhancement(networking): replicate Security Groups to Accounts with RAM shared subnets
- enhancement(network): make vpcFlowLogs property optional

### Fixed

- fix(accounts): methods used to retrieve Account IDs for Root OU targets return ignored accounts
- fix(bootstrap): Forced bootstrap update for non-centralized CDK buckets
- fix(budgets): unable to deploy AWS Budgets in Regions without vpc endpoint
- fix(ebs): EBS encryption policy references Account instead of Region
- fix(logging): remove nested looping for additional statements
- fix(networking): fix IPAM SSM lookup role name mismatch
- fix(networking): VPC-level ALBs and NLBs may reference incorrect logging bucket region
- fix(networking): replicating shared VPC/subnet tags to consumer account fails if sharing subnets from multiple owner accounts
- fix(networking): default VPCs are not deleted if the excludedAccounts property is not included
- fix(pipeline): Credential timeout for long running stages
- fix(sso): permission sets and assignments created outside of LZA cause pipeline failure
- chore(application-stack): refactor application stack to reduce complexity

### Configuration Changes

- feat(lza-sample-config-education): Added additional security-config controls
- feat(lza-sample-config-tse-se): Added AWS Control Tower installation instructions
- enhancement(lza-sample-config): Replace hard-coded management role in guardrail SCPs with a variable
- enhancement(lza-sample-config-cccs-medium): updated configuration to utilize accelerator prefix feature
- enhancement(lza-sample-config-tse-se): updated install instructions for GitHub personal access token

## [1.3.2] - 2023-03-02

### Changed

- enhancement(securityhub): enable nist 800-53 rev5 standard
- fix(network): allow -1:-1 port range in NACL config
- fix(validation): fix OU validation
- fix: conflicting logical id for org lookup in createIpamSsmRole

### Configuration Changes

- chore: update sample config to use nist 800-53 security hub standard

## [1.3.1] - 2023-02-28

### Added

- feat: add region support for me-central-1
- feat: add region support for ap-south-2, ap-southeast-3, ap-southeast-4
- feat: add region support for eu-central-2, eu-south-2
- feat(controltower): create up to 5 ControlTower accounts accounts concurrently
- feat(servicecatalog): add ability to define Service Catalog portfolios and products
- feat(servicecatalog): enable principal association with existing IAM resources
- feat(servicecatalog): add option to propagate principal associations for Service Catalog portfolios
- feat(servicecatalog): add support for AWS Identity Center (formerly SSO) principal associations with Service Catalog portfolios
- feat(installer): allow installer stack to use an existing config repository
- feat(network): remove default Security Group ingress and egress rules of VPC
- feat(network): elastic IP address allocation for NAT gateway
- feat(network): add support for referencing cross-account and cross-region subnets in network ACLs
- feat(iam): allow account lookups for IAM trust policies
- feat(identitycenter): add support for overriding delegated admin in Identity Center
- feat(account): add account warming
- feat(logs): add S3 prefixes for GuardDuty, Config and ELB
- feat(customizations): add capability to pass parameters to Stacks and StackSets
- feat(config): add support to enable config aggregation
- feat(docs): added FAQ

### Changed

- enhancement(network): add validation for route table names
- enhancement(network): GWLB VPC type and delegated admin account validation checks
- enhancement(network): add ability to define private NAT gateway connectivity type
- enhancement(network): modularize network validation classes
- enhancement(network): improve VPC validation
- enhancement(network): improve transitGateways validation
- enhancement(network): add validation for dhcpOptions and prefixLists
- enhancement(network): improve centralNetworkServices validation
- enhancement(network): update NFW config objects for enhanced error checking
- enhancement(network): allow specification of TGW attachment options in GovCloud
- enhancement(cloudformation): upload StackSet template as asset before deployment
- enhancement(builds): disable privileged mode in Code Build
- chore(logger): move logger to accelerator utils
- chore(logger): improved logger usage
- fix(app): throw error at app-level try/catch
- fix(installer): github token not properly updating in Code Pipeline
- fix(sts): assume role plugin uses regional sts endpoints
- fix(logging): use correct region for organization trail centralized logging
- fix(network): allow TGW route table associations/propagations for separate attachments to the same VPC
- fix(network): cannot create a STRICT_ORDER rule group when using rulesFile
- fix(network): ALB/NLB bucket region correction for accessLogs
- fix(network): fix cross-account nacl entry construct name
- fix(network): fix IPAM CIDR Role
- fix(network): fix security group enum typo from MYSQL to MSSQL
- fix(network): VPC using IPAM not creating cross-region
- fix(network): S2S VPN resource reference fails in GovCloud
- fix(network): inter-region tgw peering unable to find SSM parameter in second region
- fix(securityhub): failure disabling SecurityHub standards
- fix:(guardduty): issue configuring GuardDuty for opt-in regions
- fix(uninstaller): delete termination protected config repo
- fix(uninstaller): ecr delete error handling
- fix(uninstaller): ecr cleanups with full uninstall option
- fix(logging): ignore CloudWatch logs retention when existing log retention is higher than specified in global config
- fix(logging): fix organization trail centralized logging region parameter
- fix(config): VPC route validation fails when no route specified
- fix(cloudtrail): check for cloudtrail.enable property before creating account trails

### Configuration Changes

- chore: consolidate finance configs to lza-sample-config
- chore: remove default limits increase from lza-sample-config config
- chore: update education config
- chore: add lifecycle rules to lza-sample-config
- fix: update the readme file name in AWS GovCloud (US) configurations
- fix: update lock down scp with control tower role
- enhancement: enabled versioning on sample template s3 buckets

## [1.3.0] - 2022-12-21

### Added

- feat(installer): add support for organization only install
- feat(network): add ability to create site-to-site vpn to tgw
- feat(network): add ability to specify file with list of suricata rules for network firewall
- feat(network): add ability to specify transit gateway peering
- feat(network): add ability to create routes for vpc peering connections
- feat(network): add ability to create and reference VGWs for VPNs, subnet routes, and gateway route table associations
- feat(network): add ability to create third-party firewalls
- feat(network): add ability to configure firewall manager
- feat(network): add ability to define ALBs and NLBs
- feat(logs): allow specification of centralized logging bucket region independent of home region
- feat(iam): add ability for IAM policy replacements
- feat(organizations): add support to ignore organizational units
- feat(organizations): add functionality to move accounts between ous (orgs-only install)
- feat(security): add centralized and configurable sns topics
- feat(security): add ability to create ACM from s3 and integrate that with ELBv2
- feat(guardduty): enable S3 export config override
- feat(guardduty): provide functionality to enable EKS protection
- feat(ssm): enable SSM Inventory
- feat(securityhub): add support for CIS 1.4.0 controls in SecurityHub
- feat(cloudformation): Create custom CloudFormation stacks
- feat(s3): add ability to define policy statements to s3 buckets and keys
- feat(quotas): limits increase for services
- feat(sso): add ability to configure iam identity center
- feat(mad): add ability to configure managed ad
- feat(kms): allow parameter replacement in key files

### Changed

- enhancement(network): add use of static CIDR property for VPC templates
- enhancement(network): update Direct Connect custom resource logic to handle asynchronous actions
- enhancement(network): add Resolver endpoint name to deployed endpoints
- enhancement(logging): transform cloudwatch logs data to allow query from athena
- enhancement(organizations): move replacements to stack level
- enhancement(organizations): added checks for scps with no OUs or accounts
- enhancement(organizations): validate scp count
- enhancement(configs): add config rules and ssm auto remediation in AWS GovCloud (US) reference config
- fix(logging): update central log key lookup set log bucket to central log region
- fix(logging): move account CloudTrail S3 logs to central log bucket
- fix(organizations): add cases for null organizations and accounts in SCP
- fix(pipeline): force bootstraping to run in global region and home region if missing
- fix(ssm) limit api calls to 20 accounts per invocation
- fix(sns): update sns policies
- fix(sns): added account check on sns kms key policy
- fix(kms): add ebs kms policy for cloud9
- fix(security): updated sns topic to use home region rather than global region

### New Configurations

- [US Aerospace](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/aerospace.html)
- [US State and Local Government Central IT](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/central-it.html)
- [Canadian Centre for Cyber Security (CCCS) Cloud Medium](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/canadian-centre-for-cyber-security-cccs-cloud-medium.html)
- [Trusted Secure Enclaves Sensitive Edition (TSE-SE) for National Security, Defence, and National Law Enforcement](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/trusted-secure-enclaves-sensitive-edition-for-national-security-defence-and-national-law-enforcement.html)
- [Elections](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/elections.html)
- [Finance (Tax)](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/finance-tax.html)

## [1.2.2] - 2022-11-04

### Changed

- fix(budgets) budgets causing operations stack to fail
- fix(app) wrap execution in try/catch to surface errors

## [1.2.1] - 2022-10-13

### Added

- feat(govcloud): add updated govcloud config files
- feat(govcloud): add govcloud account vending service catalog product
- feat(configs): add healthcare sample config files
- feat(configs): add support aws-cn and config files

### Changed

- fix(cloudwatch): change security config to support CT organization-level cloudtrail log metrics creation
- fix(logging): cloudwatch log replication in aws-us-gov partition
- fix(config): syntax error AWS GovCloud (US) config
- fix(bootstrap): cdk centralization bug fix
- fix(logging): move session manager principal access
- fix(security): update package dependencies
- fix(installer): solution-helper is emitting delete event
- fix(installer): remove installer kms key from loggroup
- fix(logging): log replication KMS created in log receiving account only
- fix(config): update network config to align with diagrams
- fix(logging): set resource dependence for accountTrail CloudWatch log group.
- fix (pipeline): fix issue with changeset creation and bootstrap

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

## [1.1.0] - 2022-08-22

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
