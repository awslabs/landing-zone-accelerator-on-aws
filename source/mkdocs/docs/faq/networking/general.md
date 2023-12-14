# General Networking FAQ

## What is the purpose of the `centralNetworkServices` configuration block?

This configuration block in `network-config.yaml` is a collection of several advanced networking services such as Route 53 Resolver, AWS Network Firewall, VPC IPAM, and Gateway Load Balancer. This collection of services and features support the concept of network centralization in AWS, meaning that a single member account (designated as `delegatedAdminAccount` in the configuration file) owns the resources. This strategy reduces the complexity, cost, and maintenance overhead of cloud network architectures, as core networking components are all centralized in a single member account of the organization.

Each resource housed in this account can be shared with the rest of the organization via AWS Resource Access Manager (RAM) or other means such as network routing strategies or VPC endpoint distribution. For example, in the case of centralized packet inspection via AWS Network Firewall or Gateway Load Balancer, VPC endpoints can be distributed to other member accounts that enable consumption of the services by your workloads. You may also design network architectures using Transit Gateway that “force” packets through a centralized inspection VPC prior to reaching their destination.

In addition, many newer AWS networking services are beginning to adopt the concept of “delegated administration,” meaning that a member account is delegated administrative authority for a service or set of services. This is identical to the functionality of security service delegated administration that has become a staple of centralized security operations in the cloud. The delegatedAdminAccount will be used for this purpose, along with the uses listed above. VPC IPAM is the first feature to use this paradigm, and forthcoming features in the accelerator will enable it if available.

## What are the differences between the `vpcs` and `vpcTemplates` configuration blocks?

The `vpcs` block serves as a way to define VPCs that are only meant to be deployed to a single account and region. This block is useful for defining core VPCs, such as a VPC for centralized interface endpoints and/or centralized deep packet inspection. This can also be leveraged to deploy one-off workload VPCs, but if a “t-shirt sizing” strategy has been established for your cloud infrastructure, `vpcTemplates` is likely a better configuration strategy for your workload VPCs.

`vpcTemplates` is useful for deploying a standard VPC size across multiple workload accounts or organizational units (OUs) in a single region. An example of this would be deploying a standard workload VPC to all accounts under a development OU. This feature utilizes VPC IPAM to ensure VPC CIDR ranges do not conflict but are provisioned with the same CIDR prefix length across all deployment target accounts. So long as the IPAM pool is not depleted, new VPCs will automatically be vended when accounts are registered to an OU and the accelerator pipeline is released, unless the account is explicitly excluded in the `deploymentTargets` configuration property.

## How do I define a centralized interface endpoint VPC?

Landing Zone Accelerator automates the heavy lifting associated with the configuration and management of a centralized interface endpoint VPC. This is facilitated through the `central` property under the `interfaceEndpoints` configuration in a [VpcConfig](../../typedocs/latest/classes/_aws_accelerator_config.VpcConfig.html). Setting `central: true` will automate the provisioning of Route 53 private hosted zones for each endpoint service defined under this `interfaceEndpoints` configuration.

Additionally, to utilize these central endpoints from other VPCs and VPC templates, you may define `useCentralEndpoints: true` in their respective configuration blocks in order to automate the necessary private hosted zone associations to those VPCs.

**Notes:**

1. Additional network routing, such as routes via Transit Gateway or VPC peering, must be in place so API calls from spoke VPCs can reach the central interface endpoints VPC.
2. Only one central interface endpoint VPC may be defined per AWS region.
3. A VPC template cannot be used as a target for central endpoints.

!!!note "See also"
    For additional information on this design pattern, refer to [Centralized access to VPC private endpoints](https://docs.aws.amazon.com/whitepapers/latest/building-scalable-secure-multi-vpc-network-infrastructure/centralized-access-to-vpc-private-endpoints.html) from the AWS Whitepaper _Building a Scalable and Secure Multi-VPC AWS Network Infrastructure_

## Why do I see default VPCs in some regions when the `delete` parameter in `defaultVpc` is enabled?

Landing Zone Accelerator provisions AWS CloudFormation stacks in regions that are specified in the `global-config.yaml` configuration file. In these regions, networking resources are deployed via the CloudFormation stacks. The deletion of the [Default Amazon Virtual Private Cloud (VPC)](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) are handled through a custom resource provisioned in the Network-Vpc stack. This custom resource invokes an AWS Lambda function to delete common VPC resources that are attached to the default VPC, then delete the VPC itself. At the time of this writing, the Landing Zone Accelerator only deletes the default VPCs from regions designated as `enabledRegions` in `global-config.yaml`.

For example: A user has the following regions enabled via the Landing Zone Accelerator:

**global-config.yaml**

```yaml
homeRegion: us-east-1
enabledRegions:
  - us-east-1
  - eu-west-2
```

They have enabled the deletion of the default VPCs in their operating regions.

**network-config.yaml**

```yaml
defaultVpc:
  delete: true
  excludeAccounts: []
```

The user navigates to us-east-2 in their console and verifies that the Default VPC still remains. This is because the Network-Vpc CloudFormation stack has not been deployed in this region to execute the process of deleting the default VPC for this region. In this event, a user will have to seek alternative methods to deleting these VPCs from their accounts. One such method is through the CLI, please refer to the [documentation](https://docs.aws.amazon.com/vpc/latest/userguide/delete-vpc.html) for more information.