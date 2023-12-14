# Networking

## Overview

The **network-config.yaml** sample configuration is intended to set up various centralized networking constructs that you can use to customize and build additional infrastructure. Specific IP address ranges; AWS Transit Gateway routing configurations; and advanced capabilities such as Amazon Route 53 Resolver, Amazon VPC IP Address Manager, and AWS Network Firewall likely require additional customization. The solution doesn't deploy these configuration items as default.

## Architecture

![Network Architecture](./images/standard_network.jpg "Network Architecture")

1. This solution offers optional hybrid connectivity with [AWS Direct Connect](http://aws.amazon.com/directconnect/) to an on-premises data center. AWS Site-to-Site VPN (not depicted) is another option for hybrid connectivity. You can choose to deploy this infrastructure for hybrid connectivity to your AWS environment. The Direct Connect Gateway (or AWS VPN connection) is associated with a central AWS Transit Gateway, which allows communication between your on-premises network and cloud network.

2. The Inspection VPC provides a central point for deep packet inspection. Optionally, you can use this VPC to centrally manage Network Firewall or third-party intrusion detection system/intrusion prevention system (IDS/IPS) appliances[^1]. You can also use a [Gateway Load Balancer](http://aws.amazon.com/elasticloadbalancing/gateway-load-balancer/) for scalability and high availability of your third-party appliances. The Gateway Load Balancer isn't required for AWS Network Firewall deployments.

    We designed the Inspection VPC generically, and you might require additional configuration if using third-party appliances. For example, a best practice when using Gateway Load Balancer is to separate the load balancer subnet and endpoint subnet so that you can manage network access control lists (ACLs) independently from one another. For similar reasons, you might also want to separate your appliances’ management and data network interfaces into separate subnets.

3. When you design VPC endpoints in a centralized pattern, you can access multiple VPC endpoints in your environment from a central Endpoints VPC[^2]. This can help you save on your cost and management overhead of deploying interface endpoints to multiple workload VPCs. This solution deploys constructs for managing the centralization of these endpoints and their dependencies (for example, Route 53 private hosted zones). We provide more information about this pattern in [Centralized access to VPC private endpoints](https://docs.aws.amazon.com/whitepapers/latest/building-scalable-secure-multi-vpc-network-infrastructure/centralized-access-to-vpc-private-endpoints.html).
    
4. A central Transit Gateway provides a virtual router that allows you to attach multiple Amazon VPCs and hybrid network connections in a single place. You can use this in combination with routing patterns through Transit Gateway route tables to achieve network isolation, centralized inspection, and other strategies required for your compliance needs.

5. Optionally, you can use [AWS Resource Access Manager (AWS RAM)](http://aws.amazon.com/ram/) to share networking resources to other core and workload OUs or accounts. For example, you can share Network Firewall policies created in the Network account with workload accounts that require fine-grained network access control and deep packet inspection within application VPCs.

6. The Shared Services account and VPC provide commonly used patterns for organizations that have resources other than core network infrastructure that the organization needs to be share. Some examples include [AWS Directory Service for Microsoft Active Directory](http://aws.amazon.com/directoryservice/) (AWS Managed Microsoft AD), agile collaboration applications, and package or container repositories.

7. An optional External Access VPC for shared applications, remote access (RDP/SSH) bastion hosts, or other resources that require public internet access is not included in the sample configuration and is depicted for illustration purposes only.

8. Additional workload accounts can have application VPCs and Transit Gateway attachments deployed when provisioned by the solution. Deployment of network infrastructure in these workload accounts is dependent on your input to the network-config.yaml file.

[^1]: For more information on centralized inspection patterns, see the AWS Whitepaper [Building a Scalable and Secure Multi-VPC AWS Network Infrastructure](https://docs.aws.amazon.com/whitepapers/latest/building-scalable-secure-multi-vpc-network-infrastructure/welcome.html).

[^2]: Centralized endpoints aren't available in the GovCloud (US) Regions.