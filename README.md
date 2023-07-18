- [Landing Zone Accelerator on AWS](#landing-zone-accelerator-on-aws)
  - [Included Services, Features, and Configuration References](#included-services-features-and-configuration-references)
    - [Account Configuration](#account-configuration)
    - [Global Configuration](#global-configuration)
    - [Identity and Access Management (IAM) Configuration](#identity-and-access-management-iam-configuration)
    - [Network Configuration](#network-configuration)
    - [AWS Organizations Configuration](#aws-organizations-configuration)
    - [Security Configuration](#security-configuration)
    - [Customization Configuration](#customization-configuration)
    - [Other Services and Features](#other-services-and-features)
  - [Centralized Logging](#centralized-logging)
    - [Supported Log Types](#supported-log-types)
    - [Log Centralization Methods](#log-centralization-methods)
  - [Package Structure](#package-structure)
    - [@aws-accelerator/accelerator](#aws-acceleratoraccelerator)
    - [@aws-accelerator/config](#aws-acceleratorconfig)
    - [@aws-accelerator/constructs](#aws-acceleratorconstructs)
    - [@aws-accelerator/installer](#aws-acceleratorinstaller)
    - [@aws-accelerator/ui (future)](#aws-acceleratorui-future)
    - [@aws-accelerator/utils](#aws-acceleratorutils)
    - [@aws-cdk-extensions/cdk-extensions](#aws-cdk-extensionscdk-extensions)
    - [@aws-cdk-extensions/tester](#aws-cdk-extensionstester)
  - [Creating an Installer Stack](#creating-an-installer-stack)
    - [1. Build the Installer stack for deployment](#1-build-the-installer-stack-for-deployment)
    - [2. Create a GitHub personal access token](#2-create-a-github-personal-access-token)
    - [3. Store Token in Secrets Manager](#3-store-token-in-secrets-manager)
    - [4. Deploy the Installer stack](#4-deploy-the-installer-stack)

# Landing Zone Accelerator on AWS

The Landing Zone Accelerator on AWS (LZA) is architected to align with AWS best practices
and in conformance with multiple, global compliance frameworks. We recommend customers
deploy AWS Control Tower as the foundational landing zone and enhance their landing zone
capabilities with Landing Zone Accelerator. These complementary capabilities provides a
comprehensive no-code solution across 35+ AWS services to manage and govern a multi-account
environment built to support customers with highly-regulated workloads and complex compliance
requirements. AWS Control Tower and Landing Zone Accelerator help you establish platform
readiness with security, compliance, and operational capabilities.

Landing Zone Accelerator is provided as an open-source project that is built using the AWS
Cloud Development Kit (CDK). You install directly into your environment to
get full access to the infrastructure as code (IaC) solution. Through a
simplified set of configuration files, you are able to configure additional
functionality, controls and security services (eg. AWS Managed Config Rules,
and AWS Security Hub), manage your foundational networking topology (eg. VPCs,
Transit Gateways, and Network Firewall), and generate additional workload
accounts using the AWS Control Tower Account Factory.

There are no additional charges or upfront commitments required to use Landing
Zone Accelerator on AWS. You pay only for AWS services enabled in order to set
up your platform and operate your controls. This solution can also support
non-standard AWS partitions, including AWS GovCloud (US), and the US Secret and
Top Secret regions.

For an overview and solution deployment guide, please visit
[Landing Zone Accelerator on AWS](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/)

---

IMPORTANT: This solution will not, by itself, make you compliant. It provides
the foundational infrastructure from which additional complementary solutions
can be integrated. The information contained in this solution implementation
guide is not exhaustive. You must be review, evaluate, assess, and approve the
solution in compliance with your organization’s particular security features,
tools, and configurations. It is the sole responsibility of you and your
organization to determine which regulatory requirements are applicable and to
ensure that you comply with all requirements. Although this solution discusses
both the technical and administrative requirements, this solution does not help
you comply with the non-technical administrative requirements.

---

This solution collects anonymous operational metrics to help AWS improve the
quality of features of the solution. For more information, including how to
disable this capability, please see the [implementation guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/collection-of-operational-metrics.html).

---

## Included Services, Features, and Configuration References

The latest version of our configuration reference is hosted here: https://awslabs.github.io/landing-zone-accelerator-on-aws/.
Direct links to specific service configuration references are included in the following sections.

**Documentation for previous minor releases:**

- _v1.3.0_ - https://awslabs.github.io/landing-zone-accelerator-on-aws/v1.3.0
- _v1.2.0_ - https://awslabs.github.io/landing-zone-accelerator-on-aws/v1.2.0
- _v1.1.0_ - https://awslabs.github.io/landing-zone-accelerator-on-aws/v1.1.0
- _v1.0.0_ - https://awslabs.github.io/landing-zone-accelerator-on-aws/v1.0.0

> NOTE: You can navigate to patch release versions of the solution's configuration reference by modifying the version number of
> the URL. For example, to navigate to v1.3.2 documentation, you can use
> https://awslabs.github.io/landing-zone-accelerator-on-aws/v1.3.2.

### Account Configuration

Used to manage all of the AWS accounts within the AWS Organization. Adding a new account configuration to **accounts-config.yaml** will invoke the account creation process from Landing Zone Accelerator on AWS.

| Service / Feature | Resource | Base Configuration                                                                                                         | Service / Feature Configuration                                                                                                                                                                                                                                               | Details                                                                        |
| ----------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| AWS Accounts      | Account  | [AccountsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.AccountsConfig) | [AccountConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.AccountConfig.html) / [GovCloudAccountConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GovCloudAccountConfig.html) | Define commercial or GovCloud (US) accounts to be deployed by the accelerator. |

### Global Configuration

Used to manage all of the global properties that can be inherited across the AWS Organization. Defined in **global-config.yaml**.

| Service / Feature                   | Resource                              | Base Configuration                                                                                                                                                                                                                                          | Service / Feature Configuration                                                                                                                                                                                                                                                                 | Details                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS Backup                          | Backup Vaults                         | [GlobalConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GlobalConfig.html)                                                                                                                                 | [BackupConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.BackupConfig.html)                                                                                                                                                                     | Define AWS Backup Vaults that can be used to store backups in accounts across the AWS Organization.                                                                                                                                                               |
| AWS Budgets                         | Budget Reports                        | [GlobalConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GlobalConfig.html) / [ReportConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.ReportConfig.html)   | [BudgetReportConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.BudgetReportConfig.html)                                                                                                                                                         | Define Budget report configurations for account(s) and/or organizational unit(s).                                                                                                                                                                                 |
| AWS CloudTrail                      | Organization and Account Trails       | [GlobalConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GlobalConfig.html) / [LoggingConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.LoggingConfig.html) | [CloudTrailConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CloudTrailConfig.html)                                                                                                                                                             | When specified, Organization and/or account-level trails are deployed.                                                                                                                                                                                            |
| Amazon CloudWatch                   | Log Group Dynamic Partitioning        | [GlobalConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GlobalConfig.html) / [LoggingConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.LoggingConfig.html) | [CloudWatchLogsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CloudWatchLogsConfig.html)                                                                                                                                                     | Custom partition values for CloudWatch Log Groups sent to centralized logging S3 bucket.                                                                                                                                                                          |
| AWS Control Tower                   | Control Tower                         | [GlobalConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GlobalConfig.html)                                                                                                                                 | [ControlTowerConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.ControlTowerConfig.html)                                                                                                                                                         | It is recommended that AWS Control Tower is enabled, if available, in the desired home region for your environment prior to installing the accelerator. When enabled, the accelerator will integrate with resources and guardrails deployed by AWS Control Tower. |
| AWS Cost and Usage                  | Cost and Usage Report                 | [GlobalConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GlobalConfig.html) / [ReportConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.ReportConfig.html)   | [CostAndUsageReportConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CostAndUsageReportConfig.html)                                                                                                                                             | Define a global Cost and Usage report configuration for the AWS Organization.                                                                                                                                                                                     |
| AWS Regions                         | Enabled Regions                       | [GlobalConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GlobalConfig.html)                                                                                                                                 | [GlobalConfig.enabledRegions](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GlobalConfig.html#enabledRegions)                                                                                                                                       | Define one or more AWS Regions for the solution to gmanage.                                                                                                                                                                                                       |
| Amazon S3                           | Lifecycle Rules                       | [GlobalConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GlobalConfig.html) / [LoggingConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.LoggingConfig.html) | [AccessLogBucketConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.AccessLogBucketConfig.html) / [CentralLogBucketConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralLogBucketConfig.html) | Define global lifecycle rules for S3 access log buckets and the central log bucket deployed by the accelerator.                                                                                                                                                   |
| AWS Systems Manager Session Manager | Session Manager logging configuration | [GlobalConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GlobalConfig.html) / [LoggingConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.LoggingConfig.html) | [SessionManagerConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SessionManagerConfig.html)                                                                                                                                                     | Define global logging configuration settings for Session Manager.                                                                                                                                                                                                 |
| AWS SNS Topics                      | SNS Topics Configuration              | [GlobalConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GlobalConfig.html)                                                                                                                                 | [SnsTopicConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SnsTopicConfig.html)                                                                                                                                                                 | Define SNS topics for notifications.                                                                                                                                                                                                                              |

### Identity and Access Management (IAM) Configuration

Used to manage all of the IAM resources across the AWS Organization. Defined in **iam-config.yaml**.

| Service / Feature        | Resource                | Base Configuration                                                                                                    | Service / Feature Configuration                                                                                                                             | Details                                                                                                    |
| ------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| AWS IAM                  | Users                   | [IamConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IamConfig.html) | [UserSetConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.UserSetConfig.html)                               | Define IAM users to be deployed to specified account(s) and/or organizational unit(s).                     |
| AWS IAM                  | Groups                  | [IamConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IamConfig.html) | [GroupSetConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GroupSetConfig.html)                             | Define IAM groups to be deployed to specified account(s) and/or organizational unit(s).                    |
| AWS IAM                  | Policies                | [IamConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IamConfig.html) | [PolicySetConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.PolicySetConfig.html)                           | Define customer-managed IAM policies to be deployed to specified account(s) and/or organizational unit(s). |
| AWS IAM                  | Roles                   | [IamConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IamConfig.html) | [RoleSetConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.RoleSetConfig.html)                               | Define customer-managed IAM roles to be deployed to specified account(s) and/or organizational unit(s).    |
| AWS IAM                  | SAML identity providers | [IamConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IamConfig.html) | [SamlProviderConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SamlProviderConfig.html)                     | Define a SAML identity provider to allow federated IAM access to the AWS Organization.                     |
| AWS IAM Identity Center  | Permission sets         | [IamConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IamConfig.html) | [IdentityCenterConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IdentityCenterConfig.html)                 | Define IAM Identity Center (formerly AWS SSO) permission sets and assignments.                             |
| AWS Managed Microsoft AD | Managed directory       | [IamConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IamConfig.html) | [ManagedActiveDirectoryConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.ManagedActiveDirectoryConfig.html) | Define a Managed Microsoft AD directory.                                                                   |

### Network Configuration

Used to manage and implement network resources to establish a WAN/LAN architecture to support cloud operations and application workloads in AWS. Defined in **network-config.yaml**.

| Service / Feature                    | Resource                                                                              | Base Configuration                                                                                                                                                                                                                                                                     | Service / Feature Configuration                                                                                                                    | Details                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete Default Amazon VPC            | Default VPC                                                                           | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html)                                                                                                                                                          | [DefaultVpcsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.DefaultVpcsConfig.html)              | If enabled, deletes the default VPC in each account and region managed by the accelerator.                                                                                                                                                                                                                                                                                                                                                                                                                |
| AWS Direct Connect                   | Gateways, virtual interfaces, and gateway associations                                | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html)                                                                                                                                                          | [DxGatewayConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.DxGatewayConfig.html)                  | Define Direct Connect gateways, virtual interfaces, and Direct Connect Gateway associations.                                                                                                                                                                                                                                                                                                                                                                                                              |
| Amazon Elastic Load Balancing        | Gateway Load Balancers, endpoint services, and endpoints                              | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html) / [CentralNetworkServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralNetworkServicesConfig) | [GwlbConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GwlbConfig.html)                            | Define a centrally-managed Gateway Load Balancer with an associated VPC endpoint service. Define Gateway Load Balancer endpoints that consume the service, allowing for deep packet inspection of workloads.                                                                                                                                                                                                                                                                                              |
| AWS Network Firewall                 | Network Firewalls, policies, and rule groups                                          | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html) / [CentralNetworkServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralNetworkServicesConfig) | [NfwConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NfwConfig.html)                              | Define centrally-managed firewall rule groups and policies. Define Network Firewall endpoints that consume the policies, allowing for deep packet inspection of workloads.                                                                                                                                                                                                                                                                                                                                |
| Amazon Route 53 Resolver             | Resolver endpoints, rules, DNS firewall rule groups, and query logging configurations | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html) / [CentralNetworkServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralNetworkServicesConfig) | [ResolverConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.ResolverConfig.html)                    | Define centrally-managed Resolver endpoints, Resolver rules, DNS firewall rule groups, and query logging configurations. DNS firewall rule groups, Resolver rules, and query logging configurations can be associated to VPCs defined in [VpcConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcConfig.html) / [VpcTemplatesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcTemplatesConfig.html). |
| AWS Site-to-Site VPN                 | Customer gateways and VPN connections                                                 | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html)                                                                                                                                                          | [CustomerGatewayConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomerGatewayConfig.html)      | Define Customer gateways and VPN connections that terminate on Transit Gateways or Virtual Private Gateways.                                                                                                                                                                                                                                                                                                                                                                                              |
| AWS Transit Gateway                  | Transit Gateways and Transit Gateway route tables                                     | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html)                                                                                                                                                          | [TransitGatewayConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.TransitGatewayConfig.html)        | Define Transit Gateways to deploy to a specified account and region in the AWS Organization.                                                                                                                                                                                                                                                                                                                                                                                                              |
| AWS Transit Gateway                  | Transit Gateway peering connections                                                   | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html)                                                                                                                                                          | [TransitGatewayPeeringConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.TransitGatewayConfig.html) | Create Transit Gateway peering connections between two Transit Gateways defined in [TransitGatewayConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.TransitGatewayPeeringConfig.html).                                                                                                                                                                                                                                                                    |
| Amazon VPC                           | Customer-managed prefix lists                                                         | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html)                                                                                                                                                          | [PrefixListConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.PrefixListConfig.html)                | Define customer-managed prefix lists to deploy to account(s) and region(s) in the AWS Organization. Prefix lists can be referenced in place of CIDR ranges in subnet route tables, security groups, and Transit Gateway route tables.                                                                                                                                                                                                                                                                     |
| Amazon VPC                           | DHCP options sets                                                                     | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html)                                                                                                                                                          | [DhcpOptsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.DhcpOptsConfig.html)                    | Define custom DHCP options sets to deploy to account(s) and region(s) in the AWS Organization. DHCP options sets can be used by VPCs defined in [VpcConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcConfig.html) / [VpcTemplatesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcTemplatesConfig.html).                                                                                          |
| Amazon VPC                           | Flow Logs (global)                                                                    | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html)                                                                                                                                                          | [VpcFlowLogsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcFlowLogsConfig.html)              | Define a global VPC flow log configuration for VPCs deployed by the accelerator. VPC-specific flow logs can also be created in [VpcConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcConfig.html) / [VpcTemplatesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcTemplatesConfig.html).                                                                                                           |
| Amazon VPC                           | VPCs, subnets, security groups, NACLs, route tables, NAT Gateways, and VPC endpoints  | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html)                                                                                                                                                          | [VpcConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcConfig.html)                              | Define VPCs to deploy to a specified account and region in the AWS Organization.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Amazon VPC                           | VPC endpoint policies                                                                 | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html)                                                                                                                                                          | [EndpointPolicyConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.EndpointPolicyConfig.html)        | Define custom VPC endpoint policies to deploy to account(s) and region(s) in the AWS Organization. Endpoint policies can be used by interface endpoints and/or gateway endpoints defined in [VpcConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcConfig.html) / [VpcTemplatesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcTemplatesConfig.html).                                              |
| Amazon VPC                           | VPC peering connections                                                               | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html)                                                                                                                                                          | [VpcPeeringConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcPeeringConfig.html)                | Create a peering connection between two VPCs defined in [VpcConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcConfig.html). **NOTE:** Not supported with VPCs deployed using [VpcTemplatesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcTemplatesConfig.html).                                                                                                                                  |
| Amazon VPC IP Address Manager (IPAM) | IPAM pools and scopes                                                                 | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html) / [CentralNetworkServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralNetworkServicesConfig) | [IpamConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IpamConfig.html)                            | Enable IPAM delegated administrator and configuration settings for IPAM pools and scopes. **NOTE:** IPAM is required for VPCs and subnets configured to use dynamic IPAM CIDR allocations.                                                                                                                                                                                                                                                                                                                |
| Amazon VPC Templates                 | VPCs, subnets, security groups, NACLs, route tables, NAT Gateways, and VPC endpoints  | [NetworkConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkConfig.html)                                                                                                                                                          | [VpcTemplatesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcTemplatesConfig.html)            | Deploys a standard-sized VPC to multiple defined account(s) and/or organizational unit(s).                                                                                                                                                                                                                                                                                                                                                                                                                |

### AWS Organizations Configuration

Used to manage organizational units and policies in the AWS Organization. Defined in **organization-config.yaml**.

| Service / Feature      | Resource                        | Base Configuration                                                                                                                      | Service / Feature Configuration                                                                                                                           | Details                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS Account Quarantine | Quarantine                      | [OrganizationConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.OrganizationConfig.html) | [QuarantineNewAccountsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.QuarantineNewAccountsConfig.html) | If enabled, a Service Control Policy (SCP) is applied to newly-created accounts that denies all API actions from principles outside of the accelerator. This SCP is stripped from the new account when the accelerator completes resource provisioning for the new account. |
| AWS Organizations      | Backup Policies                 | [OrganizationConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.OrganizationConfig.html) | [BackupPolicyConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.BackupPolicyConfig.html)                   | Define organizational backup policies to be deployed to account(s) and/or organizational unit(s).                                                                                                                                                                           |
| AWS Organizations      | Organizational Units            | [OrganizationConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.OrganizationConfig.html) | [OrganizationalUnitConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.OrganizationalUnitConfig.html)       | Define organizational units (OUs) for the AWS Organization. **NOTE:** When using AWS Control Tower, OUs must be registered in the Control Tower console prior to defining them in the configuration.                                                                        |
| AWS Organizations      | Service Control Policies (SCPs) | [OrganizationConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.OrganizationConfig.html) | [ServiceControlPolicyConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.ServiceControlPolicyConfig.html)   | Define organizational service control policies to be deployed to account(s) and/or organizational unit(s).                                                                                                                                                                  |
| AWS Organizations      | Tag Policies                    | [OrganizationConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.OrganizationConfig.html) | [TaggingPolicyConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.TaggingPolicyConfig.html)                 | Define organizational tag policies to be deployed to account(s) and/or organizational unit(s).                                                                                                                                                                              |

### Security Configuration

Used to manage configuration of AWS security services. Defined in **security-config.yaml**.

| Service / Feature              | Resource                                                   | Base Configuration                                                                                                                                                                                                                                                                              | Service / Feature Configuration                                                                                                                                     | Details                                                                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS Audit Manager              | Audit Manager                                              | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html) / [CentralSecurityServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralSecurityServicesConfig.html) | [AuditManagerConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.AuditManagerConfig.html)                             | Enable Audit Manager delegated administrator and configuration settings.                                                                                                                                          |
| Amazon CloudWatch              | Metrics, Alarms, and Log Groups                            | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html)                                                                                                                                                                 | [CloudWatchConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CloudWatchConfig.html)                                 | Define CloudWatch metrics, alarms, and log groups to deploy into account(s) and/or organizational unit(s). You can also import existing log groups into your configuration.                                       |
| AWS Config                     | Config Recorder, Delivery Channel, Rules, and Remediations | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html)                                                                                                                                                                 | [AwsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.AwsConfig.html)                                               | Define an AWS Config Recorder, Delivery Channel, and custom and/or managed rule sets to deploy across the AWS Organization.                                                                                       |
| Amazon Detective               | Detective                                                  | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html) / [CentralSecurityServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralSecurityServicesConfig.html) | [DetectiveConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.DetectiveConfig.html)                                   | Enable Detective delegated administrator and configuration settings. **Note:** Requires Amazon GuardDuty to be enabled for at least 48 hours.                                                                     |
| Amazon EBS                     | Default Volume Encryption                                  | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html) / [CentralSecurityServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralSecurityServicesConfig.html) | [EbsDefaultVolumeEncryptionConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.EbsDefaultVolumeEncryptionConfig.html) | Enable EBS default volume encryption across the AWS Organization.                                                                                                                                                 |
| Amazon GuardDuty               | GuardDuty                                                  | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html) / [CentralSecurityServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralSecurityServicesConfig.html) | [GuardDutyConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GuardDutyConfig.html)                                   | Enable GuardDuty delegated administrator and configuration settings.                                                                                                                                              |
| AWS IAM                        | Access Analyzer                                            | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html)                                                                                                                                                                 | [AccessAnalyzerConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.AccessAnalyzerConfig.html)                         | If enabled, IAM Access Analyzer analyzes policies and reports a list of findings for resources that grant public or cross-account access from outside your AWS Organizations in the IAM console and through APIs. |
| AWS IAM                        | Password Policy                                            | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html)                                                                                                                                                                 | [IamPasswordPolicyConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.IamPasswordPolicyConfig.html)                   | Define a password policy for IAM users in the AWS Organization.                                                                                                                                                   |
| AWS KMS                        | Customer-Managed Keys                                      | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html)                                                                                                                                                                 | [KeyManagementServiceConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.KeyManagementServiceConfig.html)             | Define customer-managed KMS keys to be deployed to account(s) and/or organizational unit(s).                                                                                                                      |
| Amazon Macie                   | Macie                                                      | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html) / [CentralSecurityServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralSecurityServicesConfig.html) | [MacieConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.MacieConfig.html)                                           | Enable Macie delegated administrator and configuration settings.                                                                                                                                                  |
| Amazon S3                      | S3 Public Access Block                                     | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html) / [CentralSecurityServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralSecurityServicesConfig.html) | [S3PublicAccessBlockConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.S3PublicAccessBlockConfig.html)               | Enable S3 public access block setting across the AWS Organization.                                                                                                                                                |
| AWS Security Hub               | Security Hub                                               | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html) / [CentralSecurityServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralSecurityServicesConfig.html) | [SecurityHubConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityHubConfig.html)                               | Enable Security Hub delegated administrator and configuration settings.                                                                                                                                           |
| Amazon SNS                     | Subscriptions                                              | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html) / [CentralSecurityServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralSecurityServicesConfig.html) | [SnsSubscriptionConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SnsSubscriptionConfig.html)                       | Configure email subscriptions for security-related SNS notifications. **NOTE:** **DEPRECATED** Use SnsTopicConfig in the global configuration instead.                                                            |
| AWS Systems Manager Automation | Automation Documents                                       | [SecurityConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SecurityConfig.html) / [CentralSecurityServicesConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CentralSecurityServicesConfig.html) | [SsmAutomationConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.SsmAutomationConfig.html)                           | Define SSM Automation Documents to be deployed to account(s) and/or organizational unit(s).                                                                                                                       |

### Customization Configuration

Used to manage configuration of custom applications and CloudFormation stacks. Defined in the optional file **customizations-config.yaml**.

| Service / Feature             | Resource                                                                                 | Base Configuration                                                                                                                                                                                                                                                                      | Service / Feature Configuration                                                                                                                             | Details                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| AWS CloudFormation            | Stacks                                                                                   | [CustomizationsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomizationsConfig.html) / [CustomizationConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomizationConfig.html) | [CloudFormationStackConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CloudFormationStackConfig.html)       | Define custom CloudFormation Stacks.                                                                                                |
| AWS CloudFormation            | StackSets                                                                                | [CustomizationsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomizationsConfig.html) / [CustomizationConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomizationConfig.html) | [CloudFormationStackSetConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CloudFormationStackSetConfig.html) | Define custom CloudFormation Stacksets.                                                                                             |
| Amazon Elastic Load Balancing | Application Load Balancers                                                               | [CustomizationsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomizationsConfig.html) / [AppConfigItem](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.AppConfigItem.html)             | [ApplicationLoadBalancerConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.ApplicationLoadBalancerConfig)    | Define an Application Load Balancer to be used for a custom application.                                                            |
| Amazon Elastic Load Balancing | Network Load Balancers                                                                   | [CustomizationsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomizationsConfig.html) / [AppConfigItem](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.AppConfigItem.html)             | [NetworkLoadBalancerConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NetworkLoadBalancerConfig)            | Define a Network Load Balancer to be used for a custom application.                                                                 |
| Amazon Elastic Load Balancing | Target Groups                                                                            | [CustomizationsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomizationsConfig.html) / [AppConfigItem](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.AppConfigItem.html)             | [TargetGroupItemConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.TargetGroupItemConfig)                    | Define a Target Group to be used with an Elastic Load Balancer.                                                                     |
| Amazon EC2                    | Autoscaling Groups                                                                       | [CustomizationsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomizationsConfig.html) / [AppConfigItem](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.AppConfigItem.html)             | [AutoScalingConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.AutoScalingConfig)                            | Define an autoscaling group to be used for a custom application.                                                                    |
| Amazon EC2                    | Launch Template                                                                          | [CustomizationsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomizationsConfig.html) / [AppConfigItem](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.AppConfigItem.html)             | [LaunchTemplateConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.LaunchTemplateConfig)                      | Define a launch template to be used for a custom application.                                                                       |
| Amazon EC2                    | Next-generation firewalls (standalone or autoscaling) and firewall management appliances | [CustomizationsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomizationsConfig.html)                                                                                                                                             | [Ec2FirewallConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.Ec2FirewallConfig.html)                       | Define third-party EC2-based firewall appliances.                                                                                   |
| AWS Service Catalog           | Portfolios, products, and shares                                                         | [CustomizationsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomizationsConfig.html) / [CustomizationConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.CustomizationConfig.html) | [PortfolioConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.PortfolioConfig.html)                           | Define Service Catalog portfolios, products, and grant access permissions. You may also share portfolios to other accounts and OUs. |

### Other Services and Features

Other mandatory and non-configurable services/features deployed by the solution are described in the [Architecture overview](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/architecture-overview.html) and [Architecture details](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/architecture-details.html) section of the solution [Implementation Guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/solution-overview.html).

---

## Centralized Logging

The Landing Zone Accelerator Centralized Logging solution provides the ability to consolidate and manage log files from various sources into a Centralized Logging Account. This enables users to consolidate logs such as audit logs for access, configuration changes, and billing events. You can also collect Amazon CloudWatch Logs from multiple accounts and AWS Regions. The following sections discuss the types of logs that are centralized and the mechanisms used by the accelerator to centralize them.

### Supported Log Types

- ELB Access Logs
- VPC Flow Logs
- Macie Reports
- Cost and Usage Reports
- Config History
- Config Snapshots
- GuardDuty Findings
- CloudWatch Logs
- CloudTrail Digest
- CloudTrail Insights
- CloudTrail Logs
- S3 Server Access Logs
- SSM Inventory
- SSM Session Manager
- Security Hub Findings

### Log Centralization Methods

- **S3 Replication** - Log types that do not support service-native central logging methods or logging to CloudWatch Logs are stored in account-specific S3 buckets. These buckets are configured with an S3 replication rule to replicate logs to centralized logging S3 bucket in the central logging account.
- **Service-Native** - The AWS Service writes directly to the centralized logging bucket in the central logging account.
- **Log Streaming** - Some services do not support native centralized logging capability and do not allow writing directly to S3 in a centralized account. In order to enable this functionality, the accelerator utilizes CloudWatch and native log forwarding capabilities via the following workflow:
  - Log Group is created in CloudWatch.
  - A subscription filter is added to the CloudWatch Log Group.
  - The subscription filter points to a Log Destination.
  - The Log Destination is a region specific Kinesis Stream in the Central Logging Account.
    - Each enabled region has its own Kinesis Stream in the Central Logging Account.
  - The Kinesis Streams are forwarded into a Kinesis Firehose in the same specific region.
  - The logs are processed by a Lambda function and written to the Central Logging S3 Bucket in the Home Region.
- **Not Replicated** - Log types that are not replicated to the centralized logging S3 bucket.

| Bucket Type                |                     Bucket Name                     |                                                                                                                                                                                                    Purpose |
| :------------------------- | :-------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| Centralized Logging Bucket |  aws-accelerator-central-logs-{account#}-{region}   | Stores all Landing Zone Accelerator centralized logs that have been enabled via the accelerator. This mechanism allows the solution to store a combined set of logs in a single account and single region. |
| ELB Access Logs            | aws-accelerator-elb-access-logs-{account#}-{region} |                                                                                                                           Stores ELB Access logs in the centralized logging account on a per region basis. |
| S3 Access Logs             | aws-accelerator-s3-access-logs-{account#}-{region}  |                                                                                                                                                       Stores S3 Access logs on a per account/region basis. |

| Log Type                         |                                                    S3 Path                                                     |                                                                                      Example                                                                                       | Supported Centralization Methods |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | -------------------------------: |
| ELB                              |                                             {account#}/{region}/\*                                             |                                             s3://aws-accelerator-elb-access-logs-123456789016-us-east-1/{account#}/{region}/\*.log.gz                                              |                   S3 Replication |
| VPC Flow Logs                    |                 vpc-flow-logs/AWSLogs/{account#}/vpcflowlogs/{region}/{year}/{month}/{day}/\*                  |                       s3://aws-accelerator-central-logs-123456789016-us-east-1/vpc-flow-logs/AWSLogs/123456789016/vpcflowlogs/us-east-1/2023/04/14/\*.log.gz                       |   Log Streaming / Serivce-Native |
| Macie Reports                    |                             macie/{account#}/AWSLogs/{account#}/Macie/{region}/\*                              |                            s3://aws-accelerator-central-logs-123456789016-us-east-1/macie/123456789016/AWSLogs/123456789016/Macie/us-east-1/\*.jsonl.gz                            |                   Service-Native |
| Cost and Usage Reports           |                                       cur/{account#}/accelerator-cur/\*                                        |                           s3://aws-accelerator-central-logs-123456789016-us-east-1/cur/123456789016/accelerator-cur/20220901-20221001/\*.snappy.parquet                            |                   S3 Replication |
| Config History                   |                config/AWSLogs/{account#}/Config/{region}/{year}/{month}/{day}/ConfigHistory/\*                 |                         s3://aws-accelerator-central-logs-123456789016-us-east-1/AWSLogs/123456789016/Config/us-east-1/2023/4/10/ConfigHistory/\*.json.gz                          |                   Service-Native |
| Config Snapshots                 |                config/AWSLogs/{account#}/Config/{region}/{year}/{month}/{day}/ConfigSnapshot/\*                |                         s3://aws-accelerator-central-logs-123456789016-us-east-1/AWSLogs/123456789016/Config/us-east-1/2023/4/10/ConfigSnapshot/\*.json.gz                         |                   Service-Native |
| GuardDuty                        |                     guardduty/AWSLogs/{account#}/GuardDuty/region/{year}/{month}/{day}/\*                      |                         s3://aws-accelerator-central-logs-123456789016-us-east-1/guardduty/AWSLogs/123456789016/GuardDuty/us-east-1/2023/04/08/\*.jsonl.gz                         |                   Service-Native |
| CloudWatch Logs                  |                                 CloudWatchLogs/{year}/{month}/{day}/{hour}/\*                                  |                                          s3://aws-accelerator-central-logs-123456789016-us-east-1/CloudWatchLogs/2023/04/17/14/\*.parquet                                          |                    Log Streaming |
| CloudTrail Organization Digest   | cloudtrail-organization/AWSLogs/{organizationId}/{account#}/CloudTrail-Digest/{region}/{year}/{month}/{day}/\* |        s3://aws-accelerator-central-logs-123456789016-us-east-1/cloudtrail-organization/AWSLogs/o-abc12cdefg/123456789016/CloudTrail-Digest/us-east-1/2023/04/14/\*.json.gz        |                   Service-Native |
| CloudTrail Organization Insights |               cloudtrail-organization/AWSLogs/{organizationID}/{account#}/CloudTrail-Insight/\*                |                  s3://aws-accelerator-central-logs-123456789016-us-east-1/cloudtrail-organization/AWSLogs/o-abc12cdefg/123456789016/CloudTrail-Insight/\*.json.gz                  |                   Service-Native |
| CloudTrail Organization Logs     |    cloudtrail-organization/AWSLogs/{organizationId}/{account#}/CloudTrail/{region}/{year}/{month}/{day}/\*     |           s3://aws-accelerator-central-logs-123456789016-us-east-1/cloudtrail-organization/AWSLogs/o-abc12cdefg//123456789016/CloudTrail/us-east-1/2023/04/14/\*.json.gz           |   Log Streaming / Service-Native |
| S3 Access Logs                   |                             aws-accelerator-s3-access-logs-{account#}-{region}/\*                              |                                                           s3://aws-accelerator-s3-access-logs-123456789016-us-east-1/\*                                                            |                   Not Replicated |
| SSM Inventory                    |                                                ssm-inventory/\*                                                | s3://aws-accelerator-central-logs-123456789016-us-east-1/ssm-inventory/AWS:ComplianceSummary/accountid=123456789016/region=us-east-1/resourcetype=ManagedInstanceInventory/\*.json |                   Service-Native |
| SSM Sessions Manager             |                                         session/{account#}/{region}/\*                                         |                                           s3://aws-accelerator-central-logs-123456789016-us-east-1/session/123456789016/us-east-1/\*.log                                           |   Log Streaming / Service-Native |
| Security Hub                     |                                     CloudWatchLogs/{year}/{month}/{day}/\*                                     |                                          s3://aws-accelerator-central-logs-123456789016-us-east-1/CloudWatchLogs/2023/04/21/00/\*.parquet                                          |                    Log Streaming |

---

## Package Structure

### @aws-accelerator/accelerator

A CDK Application. The core of the accelerator solution. Contains all the stack
definitions and deployment pipeline for the accelerator. This also includes the
CDK Toolkit orchestration.

### @aws-accelerator/config

A pure typescript library containing modules to manage the accelerator config
files.

### @aws-accelerator/constructs

Contains L2/L3 constructs that have been built to support accelerator actions,
such as creating an AWS Organizational Unit or VPC. These constructs are
intended to be fully reusable, independent of the accelerator, and do not
directly access the accelerator configuration files. Example: CentralLogsBucket,
an S3 bucket that is configured with a CMK with the proper key and bucket
policies to allow services and accounts in the organization to publish logs to
the bucket.

### @aws-accelerator/installer

Contains a CDK Application that defines the accelerator Installer stack.

### @aws-accelerator/ui (future)

A web application that utilizes the aws-ui-components library to present a
console to configure the accelerator

### @aws-accelerator/utils

Contains common utilities and types that are needed by @aws-accelerator/\*
packages. For example, throttling and backoff for AWS SDK calls

### @aws-cdk-extensions/cdk-extensions

Contains L2 constructs that extend the functionality of the CDK repo. The CDK
repo is an actively developed project. As the accelerator team identifies
missing features of the CDK, those features will be initially developed locally
within this repo and submitted to the CDK project as a pull request.

### @aws-cdk-extensions/tester

Accelerator tester CDK app. This package creates AWS Config custom rules for every test cases defined in test case manifest file.

--- |

## Creating an Installer Stack

The Installer Stack, a CDK Application, can be deployed through a CloudFormation template produced by your CLI by
navigating to the directory for the installer and running a CDK synthesis. The template can either be deployed
directly via the AWS CLI or console. Below are the commands for completing the deployment of the Installer stack.

### 1. Build the Installer stack for deployment

- Install dependencies for the Installer stack

```
- [Node](https://nodejs.org/en/)
- [AWS CDK](https://aws.amazon.com/cdk/)
- [Yarn](https://yarnpkg.com/)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
```

- Install project dependencies

```
cd <rootDir>/source
yarn install && yarn lerna link
```

- To run the CDK synthesis

```
cd <rootDir>/source/packages/@aws-accelerator/installer
yarn build && yarn cdk synth
```

After running these commands, the Installer stack template will be saved to `<rootDir>/source/packages/@aws-accelerator/installer/cdk.out/AWSAccelerator-InstallerStack.template.json`

### 2. Create a GitHub personal access token

Follow the instructions on [GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-personal-access-token-classic) to create a personal access token (Classic).

When creating the token select public_repo for the selected scope.

### 3. Store Token in Secrets Manager

Store the personal access token in Secrets Manager.

1. In the AWS Management Console, navigate to Secrets Manager
2. Click Store a new secret
3. On the Choose secret type step select Other type of secret
4. Select the Plaintext tab
5. Completely remove the example text and paste your secret with no formatting no leading or trailing spaces
6. Select the aws/secretsmanager encryption key
7. Click Next
8. On the Configure secret step set the Secret name to accelerator/github-token
9. On the Configure rotation step click Next
10. On the Review step click Store

### 4. Deploy the Installer stack

- Configure the AWS CLI CloudFormation command for the Installer stack

- Create an S3 bucket and copy the generated template file.

```
cd <rootDir>/source/packages/@aws-accelerator/installer
aws s3 mb s3://<bucket name>
aws s3 cp ./cdk.out/AWSAccelerator-InstallerStack.template.json s3://<bucket name>
```

- Create the Installer stack with AWS CLI command:

```
aws cloudformation create-stack --stack-name AWSAccelerator-InstallerStack --template-body https://<bucket name>.s3.<region>.amazonaws.com/AWSAccelerator-InstallerStack.template.json \
--parameters ParameterKey=RepositoryName,ParameterValue=<Repository_Name> \
ParameterKey=RepositoryBranchName,ParameterValue=<Branch_Name> \
ParameterKey=ManagementAccountEmail,ParameterValue=<Management_Email> \
ParameterKey=LogArchiveAccountEmail,ParameterValue=<LogArchive_Email> \
ParameterKey=AuditAccountEmail,ParameterValue=<Audit_Email> \
ParameterKey=EnableApprovalStage,ParameterValue=Yes \
ParameterKey=ApprovalStageNotifyEmailList,ParameterValue=comma-delimited-notify-emails \
ParameterKey=ControlTowerEnabled,ParameterValue=Yes \
--capabilities CAPABILITY_IAM
```

- Alternate deployment of CloudFormation via AWS console:

```

- From your Management account, navigate to CloudFormation page in the AWS console
- Select ‘Create Stack’ and from the dropdown pick ‘with new resources (standard)’
- For the prerequisite template, select ‘Template is ready’
- When specifying the template, select ‘Upload a template file’
- Ensure that you select the correct file ‘AWSLandingZoneAccelerator-InstallerStack.template.json’
- Fill out the required parameters in the UI, and create the stack once the parameters are inputted.

```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

    http://www.apache.org/licenses/

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
