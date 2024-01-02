# Deep Packet Inspection FAQ

## What architectural design patterns can I leverage with Landing Zone Accelerator?

The accelerator network configuration offers much flexibility in terms of core network design. The accelerator supports all common strategies for deep packet inspection architectures, including north-south and east-west patterns using a hub-spoke design with centralized inspection VPC. One caveat to this flexibility is our prescriptive approach to network centralization, meaning that a member account must be explicitly defined as a `delegatedAdminAccount` to own central network resources under the `centralNetworkServices` configuration block. This design strategy is derived from our years of experience as well as best practices defined in AWS Whitepapers and Prescriptive Guidance patterns.

Using the accelerator, you can define any number of core and workload VPCs for your environment. For network security purposes, a centralized inspection or firewall VPC should be established in the delegated administrator account. This VPC is used for deploying either AWS Network Firewall or Gateway Load Balancer. You define your network boundaries and filtering rules via policies applied to the Network Firewall or third-party security appliances behind Gateway Load Balancer. You can then define a routing strategy via Transit Gateway and VPC subnet route tables to ensure your north-south and east-west traffic is inspected and filtered appropriately.

!!!note "See also"
    * [AWS Whitepaper: Building a Scalable and Secure Multi-VPC AWS Network Infrastructure](https://docs.aws.amazon.com/whitepapers/latest/building-scalable-secure-multi-vpc-network-infrastructure/welcome.html)
    * [AWS Prescriptive Guidance: The AWS Security Reference Architecture](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/welcome.html)

## How do I enable inspection at the edge of my VPC for public-facing workloads?

This can be accomplished by configuring a **gateway route table** for your workload VPCs and targeting a Gateway Load Balancer or AWS Network Firewall endpoint deployed to a subnet in that VPC. Using the accelerator, you can do this by configuring the `gatewayAssociation` property for a VPC route table. Traffic traverses these VPC endpoints transparently, meaning source IP addresses are preserved. This allows fine-grained inspection of network traffic based on external/untrusted security zones defined in the configuration of the Network Firewall or backend security appliance policy. Gateway route tables can be associated with a VPC’s internet gateway or virtual private gateway.

!!!note "See also"
    * [Route table configuration reference](../../typedocs/latest/classes/_aws_accelerator_config.RouteTableConfig.html)
    * [AWS PrivateLink Developer Guide: More information on traffic patterns for edge inspection](https://docs.aws.amazon.com/vpc/latest/privatelink/create-gateway-load-balancer-endpoint-service.html)