- [Frequently Asked Questions](#frequently-asked-questions)
  - [Solution - General](#solution---general)
    - [What is Landing Zone Accelerator on AWS?](#what-is-landing-zone-accelerator-on-aws)
    - [Why should I use this solution?](#why-should-i-use-this-solution)
    - [How does it work?](#how-does-it-work)
    - [Is this solution only applicable to government customers?](#is-this-solution-only-applicable-to-government-customers)
    - [Will AWS have access to customer’s data if they use this solution?](#will-aws-have-access-to-customers-data-if-they-use-this-solution)
    - [Where can I get additional technical assistance for Landing Zone Accelerator?](#where-can-i-get-additional-technical-assistance-for-landing-zone-accelerator)
  - [Solution - Architecture](#solution---architecture)
    - [What does the solution deploy?](#what-does-the-solution-deploy)
    - [What does the AWS best practices configuration deploy?](#what-does-the-aws-best-practices-configuration-deploy)
    - [Is there a best practices configuration for my industry?](#is-there-a-best-practices-configuration-for-my-industry)
    - [How do I customize what the solution deploys?](#how-do-i-customize-what-the-solution-deploys)
  - [Solution - Control Tower and Organizational Governance](#solution---control-tower-and-organizational-governance)
    - [How does this solution relate to AWS Control Tower?](#how-does-this-solution-relate-to-aws-control-tower)
    - [Is Landing Zone Accelerator compatible with AWS Control Tower?](#is-landing-zone-accelerator-compatible-with-aws-control-tower)
    - [AWS Control Tower just added new features that now overlap with Landing Zone Accelerator, what should I do?](#aws-control-tower-just-added-new-features-that-now-overlap-with-landing-zone-accelerator-what-should-i-do)
    - [Can I create AWS GovCloud (US) accounts using Landing Zone Accelerator? What happens to the commercial account if I’m using AWS Control Tower?](#can-i-create-aws-govcloud-us-accounts-using-landing-zone-accelerator-what-happens-to-the-commercial-account-if-im-using-aws-control-tower)
    - [If I deploy Landing Zone Accelerator now, can I enroll my environment into AWS Control Tower when the service becomes available in my region, such as AWS GovCloud (US) ADCs?](#if-i-deploy-landing-zone-accelerator-now-can-i-enroll-my-environment-into-aws-control-tower-when-the-service-becomes-available-in-my-region-such-as-aws-govcloud-us-adcs)
  - [Solution - Customizations for Control Tower (CfCT)](#solution---customizations-for-control-tower-cfct)
    - [How does Landing Zone Accelerator relate to CfCT?](#how-does-landing-zone-accelerator-relate-to-cfct)
    - [How do I choose between using Landing Zone Accelerator or CfCT?](#how-do-i-choose-between-using-landing-zone-accelerator-or-cfct)
    - [Can I use both Landing Zone Accelerator and CfCT? Are there any one-way doors?](#can-i-use-both-landing-zone-accelerator-and-cfct-are-there-any-one-way-doors)
  - [Solution - Operations](#solution---operations)
    - [How do I manage my organizational units (OUs) when using CT and Landing Zone Accelerator?](#how-do-i-manage-my-organizational-units-ous-when-using-ct-and-landing-zone-accelerator)
    - [How do I create additional accounts when using CT and Landing Zone Accelerator?](#how-do-i-create-additional-accounts-when-using-ct-and-landing-zone-accelerator)
    - [How do I add existing accounts when using CT and Landing Zone Accelerator?](#how-do-i-add-existing-accounts-when-using-ct-and-landing-zone-accelerator)
    - [How do I manage my SCPs when using CT and Landing Zone Accelerator?](#how-do-i-manage-my-scps-when-using-ct-and-landing-zone-accelerator)
    - [How do I troubleshoot deployment and validation errors?](#how-do-i-troubleshoot-deployment-and-validation-errors)
  - [Networking - General](#networking---general)
    - [What is the purpose of the `centralNetworkServices` configuration block?](#what-is-the-purpose-of-the-centralnetworkservices-configuration-block)
    - [What are the differences between the `vpcs` and `vpcTemplates` configuration blocks?](#what-are-the-differences-between-the-vpcs-and-vpctemplates-configuration-blocks)
    - [How do I define a centralized interface endpoint VPC?](#how-do-i-define-a-centralized-interface-endpoint-vpc)
    - [Why do I see default VPCs in some regions when the `delete` parameter in `defaultVpc` is enabled?](#why-do-i-see-default-vpcs-in-some-regions-when-the-delete-parameter-in-defaultvpc-is-enabled)
  - [Networking - Deep Packet Inspection Architectures](#networking---deep-packet-inspection-architectures)
    - [What architectural design patterns can I leverage with Landing Zone Accelerator?](#what-architectural-design-patterns-can-i-leverage-with-landing-zone-accelerator)
    - [How do I enable inspection at the edge of my VPC for public-facing workloads?](#how-do-i-enable-inspection-at-the-edge-of-my-vpc-for-public-facing-workloads)
  - [Networking - Direct Connect](#networking---direct-connect)
    - [Can I create a Direct Connect dedicated or hosted connection?](#can-i-create-a-direct-connect-dedicated-or-hosted-connection)
    - [Can I create a Direct Connect Gateway?](#can-i-create-a-direct-connect-gateway)
    - [How do I create a Direct Connect virtual interface?](#how-do-i-create-a-direct-connect-virtual-interface)
    - [Can I create a hosted virtual interface?](#can-i-create-a-hosted-virtual-interface)
    - [How do I associate a Direct Connect Gateway with a Transit Gateway?](#how-do-i-associate-a-direct-connect-gateway-with-a-transit-gateway)
    - [Why is my NetworkAssociations stack in UPDATE_ROLLBACK_COMPLETE status after adding a Transit Gateway Association?](#why-is-my-networkassociations-stack-in-update_rollback_complete-status-after-adding-a-transit-gateway-association)
  - [Networking - AWS Network Firewall](#networking---aws-network-firewall)
    - [Can I create a Network Firewall?](#can-i-create-a-network-firewall)
    - [What is the relationship between firewalls, policies, and rule groups?](#what-is-the-relationship-between-firewalls-policies-and-rule-groups)
    - [How do I deploy firewall endpoints?](#how-do-i-deploy-firewall-endpoints)
  - [Networking - Gateway Load Balancer](#networking---gateway-load-balancer)
    - [Can I create a Gateway Load Balancer?](#can-i-create-a-gateway-load-balancer)
    - [Can I create a target group for my Gateway Load Balancer?](#can-i-create-a-target-group-for-my-gateway-load-balancer)
    - [How do I deploy Gateway Load Balancer endpoints?](#how-do-i-deploy-gateway-load-balancer-endpoints)
  - [Security - General](#security---general)
    - [What purpose do the breakGlassUsers in `reference/sample-configurations/aws-best-practices/iam-config.yaml` serve, and what do I do with them?](#what-purpose-do-the-breakglassusers-in-referencesample-configurationsaws-best-practicesiam-configyaml-serve-and-what-do-i-do-with-them)

# Frequently Asked Questions

## Solution - General

### What is Landing Zone Accelerator on AWS?

The Landing Zone Accelerator on AWS is an open-source solution that will help customers quickly deploy a secure, scalable, and fully-automated cloud foundation. The Landing Zone Accelerator is architected to align with AWS best practices and in conformance with multiple, global compliance frameworks. When used in coordination with services such as AWS Control Tower, it provides a simplified no-code solution to manage and govern a multi-account environment built to support customers with complex compliance requirements. Additionally, the Landing Zone Accelerator on AWS supports non-standard AWS partitions, including AWS GovCloud (US), and the US Secret and Top Secret regions.

The Landing Zone Accelerator is built using the AWS Cloud Development Kit (CDK), and installs directly into a customers environment, where they have full access to the infrastructure as code (IaC) solution. Through a simplified set of configuration files, customers are able to enable additional functionality, guardrails (eg. AWS Managed Config Rules), and manage their foundational networking topology (eg. Transit Gateways and Network Firewall).

### Why should I use this solution?

Landing Zone Accelerator is ideal for customers that don’t have the expertise or don’t want to design an enterprise platform and governance tool chain. Any customer who is looking to build on AWS and wants to do so in a compliant way can use this solution to quickly improve their cloud security posture.

### How does it work?

Landing Zone Accelerator is installed into your AWS Organizations Management account through AWS CloudFormation. You can utilize a provided default configuration to initialize your environment with technical security controls and foundational infrastructure on AWS that aligns with best practices and conforms with several compliance frameworks. Customers are able to make additional modifications to configuration files, such as adding additional AWS accounts or VPCs.

### Is this solution only applicable to government customers?

No, Landing Zone Accelerator is applicable for all customers that need to implement an architecture based on best practice security. Deployment is supported in any of the regions where Control Tower is available, as well as AWS GovCloud (US).

Landing Zone Accelerator is delivered with [sample configuration files](reference/sample-configurations) which deploy opinionated and prescriptive architectures designed to meet the security and operational requirements of many customers around the world. While installation of the provided prescriptive architectures are reasonably simple, deploying a customized architecture does require extensive understanding of the AWS platform.

### Will AWS have access to customer’s data if they use this solution?

No, Landing Zone Accelerator resides within your Management account and is controlled by you. The Landing Zone Accelerator on AWS does not change any of the responsibilities in the [Shared Responsibility Model](https://aws.amazon.com/compliance/shared-responsibility-model/). Another benefit to having the code available as open source is the transparency it brings so customers can be certain of what is being done in their accounts.

### Where can I get additional technical assistance for Landing Zone Accelerator?

Customers are able use the [AWS Support console](https://support.console.aws.amazon.com/support/home) to file issues directly against Landing Zone Accelerator. Please use **_Service: Control Tower → Category: Landing Zone Accelerator_** when filing support tickets.

## Solution - Architecture

### What does the solution deploy?

The Landing Zone Accelerator is ultimately an orchestration engine that will deploy and configure the resources you specify in your configuration files. The Landing Zone Accelerator orchestration engine is deployed using AWS CloudFormation and utilizes AWS CodeCommit, AWS CodePipeline, and AWS CodeBuild to execute a Cloud Development Kit (CDK) application. This application is responsible for ingesting your configuration and deploying your resources through additional AWS CloudFormation stacks across your environment.

For further details on the Landing Zone Accelerator orchestration engine, see [Architecture overview](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/architecture-overview.html) and [Architecture details](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/architecture-details.html) in the implementation guide.

### What does the AWS best practices configuration deploy?

The Landing Zone Accelerator provides opinionated configurations that are based on our years of building environments for customers with highly regulated workloads. By using the [aws-best-practices configuration](reference/sample-configurations/aws-best-practices), you can expect the architecture in the solution’s [Architecture overview](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/architecture-overview.html) to be deployed.

### Is there a best practices configuration for my industry?

You may find the current list of supported industry best practice configurations in the [sample configurations](reference/sample-configurations) directory of our GitHub repository. Supporting documentation for these best practice configurations can be found in the [Support for specific regions and industries](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/industry-and-regional-guidance.html) section of the solution implementation guide.

### How do I customize what the solution deploys?

The solution's [configuration files](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/configuration-files.html) are the primary interface for what the accelerator deploys. The supported services, features, and API references for these config files can be found in the [README](README.md) of our GitHub repository. You may use the configuration reference to update a best practices configuration to meet your organization's needs, or to craft your own configuration from scratch.

## Solution - Control Tower and Organizational Governance

### How does this solution relate to AWS Control Tower?

When used in coordination with AWS Control Tower (CT), Landing Zone Accelerator will utilize the functionality provided by CT directly, such as using the CT Account Factory to generate and enroll new accounts. Landing Zone Accelerator fully intends to utilize AWS Control Tower APIs, when made available, to orchestrate additional features that CT provides, specifically 1/ OU creation and management, 2/ SCP creation and management, and 3/ CT control management. In the interim, Landing Zone Accelerator will not automate any actions that can potentially cause significant drift with CT, such as OU creation. The Landing Zone Accelerator team will work closely with the AWS Control Tower team to look around corners and avoid any one-way doors in design, implementation or deployment.

### Is Landing Zone Accelerator compatible with AWS Control Tower?

Yes, Landing Zone Accelerator is designed to coordinate directly with AWS Control Tower. AWS strongly recommends that you deploy AWS Control Tower as the foundation for the Landing Zone Accelerator. Landing Zone Accelerator extends the functionality of AWS Control Tower by adding additional orchestration of networking and security services within AWS. The Landing Zone Accelerator can be used to enable and orchestrate additional AWS services and features beyond the current functionality of AWS Control Tower through a simplified set of configuration files.

AWS Control Tower provides the easiest way to set up and govern a secure, multi-account AWS environment, also known as a landing zone. AWS Control Tower creates customers’ landing zone using AWS Organizations, bringing ongoing account management and governance as well as implementation best practices based on AWS’s experience working with thousands of customers as they move to the cloud.

By using the default [Landing Zone Accelerator on AWS sample configurations](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations), you are able to quickly implement technical security controls and infrastructure foundations on AWS, in alignment with AWS best practices and in conformance with multiple, global compliance frameworks. If necessary, Landing Zone Accelerator can be deployed independently of AWS Control Tower to support regions and partitions that are currently not yet supported by AWS Control Tower. Learn more about AWS Control Tower Commercial Region availability [here](https://docs.aws.amazon.com/controltower/latest/userguide/region-how.html). Learn more about AWS Control Tower GovCloud (US) support [here](https://docs.aws.amazon.com/govcloud-us/latest/UserGuide/govcloud-controltower.html).

### AWS Control Tower just added new features that now overlap with Landing Zone Accelerator, what should I do?

A key design principle of Landing Zone Accelerator is to evolve over time as new AWS services and features become available. Where possible, Landing Zone Accelerator will defer to native AWS services to deliver functionality and over time will deprecate code/functionality in Landing Zone Accelerator if it can be replaced by a native AWS service such as AWS Control Tower.

### Can I create AWS GovCloud (US) accounts using Landing Zone Accelerator? What happens to the commercial account if I’m using AWS Control Tower?

Yes. You can specify the creation of an AWS GovCloud (US) account through the Landing Zone Accelerator configuration files. This requires that your Management Root account meets the requirements for creating an AWS GovCloud (US) account. After adding the new account information to the Landing Zone Accelerator configuration and releasing the pipeline, Landing Zone Accelerator will automate the creation of a new GovCloud account through the Organizations service. Since the creation of a GovCloud account also creates a commercial pair, the Landing Zone Accelerator will then automate the enrollment of the commercial account using the AWS Control Tower Account Factory Service Catalog product.

### If I deploy Landing Zone Accelerator now, can I enroll my environment into AWS Control Tower when the service becomes available in my region, such as AWS GovCloud (US) ADCs?

Yes. Landing Zone Accelerator is designed to align directly with the landing zone structure that AWS Control Tower provides. Landing Zone Accelerator requires the 3 mandatory accounts that are configured when you enable AWS Control Tower, 1/Management Root, 2/Logging, 3/Audit. When AWS Control Tower becomes available in your region, you will be able to configure your AWS Control Tower landing zone to reuse these same accounts for their specified functions. Additionally, per guidance from the AWS Control Tower service team, where possible, Landing Zone Accelerator will also deploy the same mandatory controls defined by the AWS Control Tower into your environment.

## Solution - Customizations for Control Tower (CfCT)

### How does Landing Zone Accelerator relate to CfCT?

CfCT allows customers to easily add customizations to their AWS Control Tower landing zone using AWS CloudFormation templates and service control policies (SCPs). Customers are able to configure their environment by updating and adding additional functionality to their CloudFormation templates. Customers that want to dive deeper into the foundational AWS resources and building blocks that are provided with CloudFormation, and/or have developmental experience with Infrastructure as Code (IaC), can utilize CfCT to add their customizations. CfCT handles the deployment of CloudFormation templates using StackSets which allows the deployment of up to 2000 stack instances at a time. Customers have the flexibility to define the dependencies and order that their CloudFormation templates should be deployed though the CfCT configuration.

Landing Zone Accelerator provides customers with a no-code solution for configuring an enterprise-ready and accreditation-ready environment on AWS. Customers with limited experience with IaC are able to interact with Landing Zone Accelerator through a simplified set of configuration files. Leveraging the AWS Cloud Development Kit (CDK) allows the Landing Zone Accelerator to deploy parallel stacks that go beyond the current instance limits of StackSets. Landing Zone Accelerator handles the dependencies and ordering of the CloudFormation templates and resource deployments; customers simply define what features they want enabled by Landing Zone Accelerator through their configuration files, and Landing Zone Accelerator handles where in the orchestration pipeline to enable the related resources and their dependencies.

### How do I choose between using Landing Zone Accelerator or CfCT?

Customers should use CfCT if they want to develop and maintain their own CloudFormation templates and also want the ability to define the dependencies and order that they should be deployed through the CfCT configuration across their multi-account environment.

Customers should use Landing Zone Accelerator if they want a no-code solution with a simplified set of configuration files that handles the deployment of resources across 35 services and their dependencies across their multi-account environment. Customers should also use Landing Zone Accelerator if they need a solution that can work in all regions and partitions, such as AWS GovCloud (US) and the US Secret and Top Secret regions.

### Can I use both Landing Zone Accelerator and CfCT? Are there any one-way doors?

You can use both Landing Zone Accelerator and CfCT to deploy additional customizations to your CT landing zone. Both Landing Zone Accelerator and CfCT support event driven architectures and post an SNS topic at the completion of their respective pipelines. Subscriptions can be set up against these SNS topics to initiate additional pipelines or custom IaC deployments. This includes having CfCT called after the completion of a Landing Zone Accelerator pipeline and vice versa. For customers that want a hybrid approach of a no-code solution to handle the orchestration and deployment of AWS security and networking services through Landing Zone Accelerator, can then use CfCT to add additional customizations directly with custom-developed CloudFormation templates

## Solution - Operations

### How do I manage my organizational units (OUs) when using CT and Landing Zone Accelerator?

All OUs and accounts that you create in CT are governed automatically by CT. OUs that are generated outside of CT require you to manually enroll the OU with CT before it can be managed and governed by CT. When using CT and Landing Zone Accelerator together, Landing Zone Accelerator will not automate the creation of additional OUs, as there is currently not an automated mechanism to enroll the newly created OU with CT. This design decision minimizes opportunities for environment drift with CT.

When using Landing Zone Accelerator without CT, this additional step is not required.

For more information on enrolling OUs in Landing Zone Accelerator, please see [Adding an Organizational Unit (OU)](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/administrator-tasks.html#adding-an-organizational-unit-ou) in the solution implementation guide.

### How do I create additional accounts when using CT and Landing Zone Accelerator?

When new account entries are added to the Landing Zone Accelerator `accounts-config.yaml` configuration file and the Core pipeline is released, Landing Zone Accelerator will utilize the CT Account Factory Service Catalog product to generate the new accounts. Similar to OUs, accounts that are generated outside of CT require you to enroll the account with CT before it can be managed and governed by CT. If you create an account outside of Control Tower (likely directly through the Organizations console or API), you can add the account information to the Landing Zone Accelerator configuration and the solution will automatically enroll the new account into CT using the CT Account Factory Service Catalog product.

For more information on enrolling new accounts in Landing Zone Accelerator, please see [Adding a new account](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/administrator-tasks.html#adding-a-new-account) in the solution implementation guide.

### How do I add existing accounts when using CT and Landing Zone Accelerator?

Please refer to [Adding an existing account](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/administrator-tasks.html#adding-an-existing-account) in the solution implementation guide for guidance on adding an existing account to your Landing Zone Accelerator environment.

### How do I manage my SCPs when using CT and Landing Zone Accelerator?

You can use Landing Zone Accelerator to deploy custom SCPs into your environment in addition to the SCPs that are deployed and managed by CT. Landing Zone Accelerator will only manage SCPs that are part of the accelerator configuration, and will not manage any SCPs that are deployed by CT. Note, Organizations sets a limit of 5 SCPs per OU and CT will consume up to 3 SCPs which will leave 2 additional SCPs that you can add. For finer grained SCPs, Landing Zone Accelerator also allows you to deploy custom SCPs to specific accounts.

For more information on managing SCPs in Landing Zone Accelerator, please see [Adding a Service Control Policy (SCP)](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/administrator-tasks.html#adding-a-service-control-policy-scp) in the solution implementation guide.

### How do I troubleshoot deployment and validation errors?

Common troubleshooting scenarios are documented in the [Troubleshooting](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/troubleshooting.html) section of the solution implementation guide. This section will continue to grow with additional scenarios as common deployment and environment validation error cases are reported.

## Networking - General

### What is the purpose of the `centralNetworkServices` configuration block?

This configuration block in `network-config.yaml` is a collection of several advanced networking services such as Route 53 Resolver, AWS Network Firewall, VPC IPAM, and Gateway Load Balancer. This collection of services and features support the concept of network centralization in AWS, meaning that a single member account (designated as `delegatedAdminAccount` in the configuration file) owns the resources. This strategy reduces the complexity, cost, and maintenance overhead of cloud network architectures, as core networking components are all centralized in a single member account of the organization.

Each resource housed in this account can be shared with the rest of the organization via AWS Resource Access Manager (RAM) or other means such as network routing strategies or VPC endpoint distribution. For example, in the case of centralized packet inspection via AWS Network Firewall or Gateway Load Balancer, VPC endpoints can be distributed to other member accounts that enable consumption of the services by your workloads. You may also design network architectures using Transit Gateway that “force” packets through a centralized inspection VPC prior to reaching their destination.

In addition, many newer AWS networking services are beginning to adopt the concept of “delegated administration,” meaning that a member account is delegated administrative authority for a service or set of services. This is identical to the functionality of security service delegated administration that has become a staple of centralized security operations in the cloud. The delegatedAdminAccount will be used for this purpose, along with the uses listed above. VPC IPAM is the first feature to use this paradigm, and forthcoming features in the accelerator will enable it if available.

### What are the differences between the `vpcs` and `vpcTemplates` configuration blocks?

The `vpcs` block serves as a way to define VPCs that are only meant to be deployed to a single account and region. This block is useful for defining core VPCs, such as a VPC for centralized interface endpoints and/or centralized deep packet inspection. This can also be leveraged to deploy one-off workload VPCs, but if a “t-shirt sizing” strategy has been established for your cloud infrastructure, `vpcTemplates` is likely a better configuration strategy for your workload VPCs.

`vpcTemplates` is useful for deploying a standard VPC size across multiple workload accounts or organizational units (OUs) in a single region. An example of this would be deploying a standard workload VPC to all accounts under a development OU. This feature utilizes VPC IPAM to ensure VPC CIDR ranges do not conflict but are provisioned with the same CIDR prefix length across all deployment target accounts. So long as the IPAM pool is not depleted, new VPCs will automatically be vended when accounts are registered to an OU and the accelerator pipeline is released, unless the account is explicitly excluded in the `deploymentTargets` configuration property.

### How do I define a centralized interface endpoint VPC?

Landing Zone Accelerator automates the heavy lifting associated with the configuration and management of a centralized interface endpoint VPC. This is facilitated through the `central` property under the `interfaceEndpoints` configuration in a [VpcConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.VpcConfig.html). Setting `central: true` will automate the provisioning of Route 53 private hosted zones for each endpoint service defined under this `interfaceEndpoints` configuration.

Additionally, to utilize these central endpoints from other VPCs and VPC templates, you may define `useCentralEndpoints: true` in their respective configuration blocks in order to automate the necessary private hosted zone associations to those VPCs.

**Notes:**

1. Additional network routing, such as routes via Transit Gateway or VPC peering, must be in place so API calls from spoke VPCs can reach the central interface endpoints VPC.
2. Only one central interface endpoint VPC may be defined per AWS region.
3. A VPC template cannot be used as a target for central endpoints.

For additional information on this design pattern, refer to [Centralized access to VPC private endpoints](https://docs.aws.amazon.com/whitepapers/latest/building-scalable-secure-multi-vpc-network-infrastructure/centralized-access-to-vpc-private-endpoints.html) from the AWS Whitepaper _Building a Scalable and Secure Multi-VPC AWS Network Infrastructure_

### Why do I see default VPCs in some regions when the `delete` parameter in `defaultVpc` is enabled?

Landing Zone Accelerator provisions AWS CloudFormation stacks in regions that are specified in the `global-config.yaml` configuration file. In these regions, networking resources are deployed via the CloudFormation stacks. The deletion of the [Default Amazon Virtual Private Cloud (VPC)](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) are handled through a custom resource provisioned in the Network-Vpc stack. This custom resource invokes an AWS Lambda function to delete common VPC resources that are attached to the default VPC, then delete the VPC itself. At the time of this writing, the Landing Zone Accelerator only deletes the default VPCs from regions designated as `enabledRegions` in `global-config.yaml`.

For example: A user has the following regions enabled via the Landing Zone Accelerator:

**global-config.yaml**

```
homeRegion: us-east-1
enabledRegions:
  - us-east-1
  - eu-west-2
```

They have enabled the deletion of the default VPCs in their operating regions.

**network-config.yaml**

```
defaultVpc:
  delete: true
  excludeAccounts: []
```

The user navigates to us-east-2 in their console and verifies that the Default VPC still remains. This is because the Network-Vpc CloudFormation stack has not been deployed in this region to execute the process of deleting the default VPC for this region. In this event, a user will have to seek alternative methods to deleting these VPCs from their accounts. One such method is through the CLI, please refer to the [documentation](https://docs.aws.amazon.com/vpc/latest/userguide/delete-vpc.html) for more information.

## Networking - Deep Packet Inspection Architectures

### What architectural design patterns can I leverage with Landing Zone Accelerator?

The accelerator network configuration offers much flexibility in terms of core network design. The accelerator supports all common strategies for deep packet inspection architectures, including north-south and east-west patterns using a hub-spoke design with centralized inspection VPC. One caveat to this flexibility is our prescriptive approach to network centralization, meaning that a member account must be explicitly defined as a `delegatedAdminAccount` to own central network resources under the `centralNetworkServices` configuration block. This design strategy is derived from our years of experience as well as best practices defined in AWS Whitepapers and Prescriptive Guidance patterns.

Using the accelerator, you can define any number of core and workload VPCs for your environment. For network security purposes, a centralized inspection or firewall VPC should be established in the delegated administrator account. This VPC is used for deploying either AWS Network Firewall or Gateway Load Balancer. You define your network boundaries and filtering rules via policies applied to the Network Firewall or third-party security appliances behind Gateway Load Balancer. You can then define a routing strategy via Transit Gateway and VPC subnet route tables to ensure your north-south and east-west traffic is inspected and filtered appropriately.

[AWS Whitepaper: Building a Scalable and Secure Multi-VPC AWS Network Infrastructure](https://docs.aws.amazon.com/whitepapers/latest/building-scalable-secure-multi-vpc-network-infrastructure/welcome.html)

[AWS Prescriptive Guidance: The AWS Security Reference Architecture](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/welcome.html)

### How do I enable inspection at the edge of my VPC for public-facing workloads?

This can be accomplished by configuring a **gateway route table** for your workload VPCs and targeting a Gateway Load Balancer or AWS Network Firewall endpoint deployed to a subnet in that VPC. Using the accelerator, you can do this by configuring the `gatewayAssociation` property for a VPC route table. Traffic traverses these VPC endpoints transparently, meaning source IP addresses are preserved. This allows fine-grained inspection of network traffic based on external/untrusted security zones defined in the configuration of the Network Firewall or backend security appliance policy. Gateway route tables can be associated with a VPC’s internet gateway or virtual private gateway.

Route table configuration reference: https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.RouteTableConfig.html

More information on traffic patterns for edge inspection: https://docs.aws.amazon.com/vpc/latest/privatelink/create-gateway-load-balancer-endpoint-service.html

## Networking - Direct Connect

### Can I create a Direct Connect dedicated or hosted connection?

No. Direct Connect dedicated connections must first be requested through the AWS console, approved by AWS, and then ordered through an APN partner or network provider. Hosted connections must be ordered through an APN partner and then accepted in the AWS console. After this prerequisite has been completed, Landing Zone Accelerator can take in the physical connection ID (dxcon-xxxxxx) as a configuration property to create and manage private and transit virtual interfaces.

More information: https://docs.aws.amazon.com/directconnect/latest/UserGuide/resiliency_toolkit.html

### Can I create a Direct Connect Gateway?

Yes. A Direct Connect Gateway must be configured in order to configure other features such as virtual interfaces and associations with transit gateways. The gateway as well as other features can be configured in the `network-config.yaml` accelerator configuration file. It is recommended that the Direct Connect Gateway is configured in the same account that the transit gateway(s) reside in. This enables the accelerator to manage the full lifecycle of transit gateway associations to the Direct Connect Gateway, as well as manage transit gateway static routes, route table associations, and route table propagations that reference the Direct Connect Gateway.

Direct Connect Gateway configuration reference: https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.DxGatewayConfig.html

### How do I create a Direct Connect virtual interface?

You must first complete the [prerequisites](https://docs.aws.amazon.com/directconnect/latest/UserGuide/resiliency_toolkit.html#prerequisites) to set up a physical Direct Connect connection. A Direct Connect Gateway must also be created and managed by the accelerator to create virtual interfaces. Once the physical connection is no longer in a pending state, you can reference the physical connection ID (dxcon-xxxxxx) in the `network-config.yaml` accelerator configuration file to begin creating virtual interfaces.

**Note:** The accelerator can manage the full lifecycle of a virtual interface if the Direct Connect Gateway and physical connection reside in the same account. Due to billing requirements for Direct Connect owners, this is not always possible. For these use cases, the accelerator can also allocate hosted virtual interfaces, but there is a manual billing acceptance step that must be completed by a human after the initial creation.

Direct Connect virtual interface configuration reference: https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.DxVirtualInterfaceConfig.html

### Can I create a hosted virtual interface?

Yes. If the `ownerAccount` property of the virtual interface configuration specifies a different account than the `account` property of the Direct Connect Gateway, the accelerator CDK application will create a hosted virtual interface allocation from the account that owns the physical connection to the Direct Connect Gateway owner account. Virtual interface allocations must be manually accepted after creation and attached to a Direct Connect Gateway in order to be used. The accelerator will not manage this acceptance process as it is billing-related and should be explicitly reviewed by a human or automation outside of the accelerator.

**Notes:**

- The physical connection must be owned by an account managed by the accelerator.
- After the initial creation of the hosted virtual interface, the `interfaceName` and `tags` properties can no longer be managed by the accelerator. However, `jumboFrames` and `enableSiteLink` may still be updated.

### How do I associate a Direct Connect Gateway with a Transit Gateway?

It is required that both the Direct Connect Gateway and Transit Gateway are managed by the accelerator. An association to a transit gateway can be configured in the `network-config.yaml` accelerator configuration file. It is recommended that both gateways reside in the same account, however due to billing requirements for some organizations, this is not always possible. For these use cases, the accelerator can also create an **association proposal** from a Transit Gateway owner account to a Direct Connect Gateway owner account. This is determined dynamically by the CDK application based on the `account` property of each resource.

**Notes:**

- There are limitations with association proposals. After the initial proposal is created, a manual acceptance process must be completed. The accelerator will not manage this acceptance process as it is billing-related and should be explicitly reviewed by a human. Updates to the proposal (i.e. allowed route prefixes) can be made via the accelerator, but must be reviewed and approved by a human or automation outside of the accelerator.
- Gateway associations configured in the same account can additionally manage transit gateway static routes, route table associations, and route table propagations via the accelerator. Association proposals cannot manage these additional features.
- The association process between a Direct Connect Gateway and Transit Gateway can take anywhere from five to twenty minutes on average. The length of time depends on current load of the Direct Connect control plane in the region the association is occurring. Your pipeline progression will be paused until it validates the association has completed.

Direct Connect Gateway Transit Gateway association reference: https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.DxTransitGatewayAssociationConfig.html

### Why is my NetworkAssociations stack in UPDATE_ROLLBACK_COMPLETE status after adding a Transit Gateway Association?

The association process between a Direct Connect Gateway and Transit Gateway can take anywhere from five to twenty minutes on average. The length of time depends on current load of the Direct Connect control plane in the region the association is occurring. Prior to v1.3.0, the accelerator was utilizing an AWS Lambda-backed custom resource to process this association and validate its completion. If the association took longer than 15 minutes, the Lambda would time out and cause this error. If running a version prior to v1.3.0, you can safely retry the Deploy stage of the pipeline after the association has completed to get past this error, and it will not occur on subsequent runs.

As of v1.3.0, this issue has been rectified and the custom resource should no longer fail after 15 minutes. Note that the association process will pause pipeline progression until it has completed.

## Networking - AWS Network Firewall

### Can I create a Network Firewall?

Yes. AWS Network Firewalls (ANFWs) can be created and managed by the accelerator. ANFWs must be configured to take advantage of other accelerator features such as subnet and gateway route tables targeting ANFW endpoints. The ANFW as well as other associated features can be configured in the `network-config.yaml` accelerator configuration file. ANFW rule groups and policies are centrally managed in the `delegatedAdminAccount`, however they can be shared via AWS Resource Access Manager (RAM) to other member accounts for consumption. ANFW endpoints can be created in any member account, so long as the associated policy has been shared to that account or the organizational unit (OU) in which it resides.

AWS Network Firewall configuration reference: https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NfwConfig.html

### What is the relationship between firewalls, policies, and rule groups?

Firewalls have a one-to-one relationship with policies. Policies have a one-to-many relationship with rule groups. Rules defined within the rule groups are the explicit stateful and/or stateless inspection criteria for traffic passing through a firewall endpoint. When defining your ANFW configuration in the accelerator, it helps to work backwards from where the firewall endpoints will be deployed and what workloads the endpoints will be inspecting. From there you can define a policy and associated rule groups for those firewall endpoints to protect security trust zones that you’ve defined for your environment.

More information on ANFW components: https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-components.html

### How do I deploy firewall endpoints?

Firewalls and their associated configuration properties are defined under the `firewalls` property of the `networkFirewall` object in the `network-config.yaml` accelerator configuration file. A firewall endpoint will be deployed in each VPC subnet specified in the `subnets` configuration property, so long as those subnets are contained within the VPC configured as the `vpc` property.

**Note:** Firewall endpoints are zonal resources, and as such a best practice is to deploy an endpoint per Availability Zone that will be enabled in your environment. This ensures your inspection infrastructure remains highly available and routing blackholes do not occur in the case of zone failure.

ANFW firewall configuration reference: https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.NfwFirewallConfig.html

## Networking - Gateway Load Balancer

### Can I create a Gateway Load Balancer?

Yes. A Gateway Load Balancer (GWLB) must be configured to take advantage of other features such as GWLB endpoints and subnet and gateway route tables targeting GWLB endpoints. The GWLB as well as other features can be configured in the `network-config.yaml` accelerator configuration file. Gateway Load Balancers must be deployed to a VPC that is owned by the `delegatedAdminAccount`, however endpoints for the service can be distributed to any member account.

**Note:** Availability Zone (AZ) mappings differ between accounts. This means the actual AZ that zone A maps to in one account will likely differ in another member account of your organization. Before deploying a GWLB, ensure that these mappings are documented and your remaining network infrastructure is planned around these mappings.

GWLB endpoints are dependent on **endpoint services**, which are strictly zonal. This means an error will occur if you try to create an endpoint in a zone that that the GWLB was not deployed to. A workaround for this is to deploy your GWLB to all AZs in a region, however this may increase costs associated with data transfer between AZs.

Gateway Load Balancer configuration reference: https://awslabs.github.io/landing-zone-accelerator-on-aws/classes/_aws_accelerator_config.GwlbConfig.html

More information on zonal dependencies for GWLB endpoints: https://docs.aws.amazon.com/vpc/latest/privatelink/create-gateway-load-balancer-endpoint-service.html

### Can I create a target group for my Gateway Load Balancer?

Yes. As of v1.3.0 of the accelerator, EC2-based next-generation firewalls and target groups may be defined in the `customizations-config.yaml` accelerator configuration file. You may reference the target group name as the `targetGroup` property of a Gateway Load Balancer configuration in `network-config.yaml`, which tells the accelerator to place the configured instances/autoscaling groups into a target group for that Gateway Load Balancer.

**Note:** Gateway Load Balancers only support target groups using the GENEVE protocol and port 6081. If the target group uses any other configuration, an error will be thrown during the validation.

### How do I deploy Gateway Load Balancer endpoints?

GWLB endpoints are configured under the `endpoints` property of the `gatewayLoadBalancers` configuration object in the `network-config.yaml` accelerator configuration file. Endpoints can be deployed to any account that the accelerator manages, enabling the concept of separate security trust zones for north-south and east-west packet flows. These endpoints are consumers of an endpoint service that is created alongside the Gateway Load Balancer.

Successful creation of cross-account endpoints is dependent on the Availability Zones the GWLB is deployed to. Please refer to the guidance under **_Can I create a Gateway Load Balancer?_** for more information.

## Security - General

### What purpose do the breakGlassUsers in `reference/sample-configurations/aws-best-practices/iam-config.yaml` serve, and what do I do with them?

Break glass access is a [recommended best practice](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/break-glass-access.html) for gaining access to the organization management account or sub-accounts when there is a security incident or failure of the Identity Provider (IdP) infrastructure. [MFA](https://aws.amazon.com/iam/features/mfa/) and [password reset on next sign-in](https://docs.aws.amazon.com/IAM/latest/APIReference/API_CreateLoginProfile.html) policies are enforced for break glass users through the `iam-policies/boundary-policy.json` and `iam-config.yaml` settings. It is imperative for the organization management admin to register [MFA devices](https://docs.aws.amazon.com/singlesignon/latest/userguide/how-to-register-device.html) and reset the Landing Zone Accelerator generated passwords before they expire, per the `maxPasswordAge` (https://docs.aws.amazon.com/IAM/latest/APIReference/API_UpdateAccountPasswordPolicy.html) setting in `security-config.yaml`. Of equal importance is the protection of the hardware MFA devices and passwords against unauthorized disclosure. This often involves enforcing [dual authorization](https://csrc.nist.gov/glossary/term/dual_authorization), that is, one trusted individual having access to the password and a different trusted individual having access to the MFA token.
