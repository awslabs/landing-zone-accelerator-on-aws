# Networking

The default [network-config.yaml](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations/lza-sample-config-govcloud-us/govcloud-us-config/network-config.yaml) configuration will deploy an AWS Virtual Private Cloud (VPC) with a primary Classless Inter-Domain Routing (CIDR) block of 10.0.0.0/16.

The LZA solution provides the flexibility to easily deploy additional services to suit your cloud computing needs. The default deployment does not include enablement of select services, such as a NAT gateway, AWS Network Firewall, or AWS Transit Gateway. You should evaluate the configuration options to configure the network architecture in accordance with your infrastructure needs.

The following network diagram is an example foundational network topology. The diagram identifies the use of an inspection VPC for where traffic can be inspected and filtered, such as through the use of a web application firewall and intrusion detection/intrusion prevention system. Network communications among VPCs are facilitated through the use of Transit Gateways.

![Landing Zone Accelerator on AWS architecture -- networking
resources.](./images/image2.png)