# AWS Network Firewall FAQ

## Can I create a Network Firewall?

Yes. AWS Network Firewalls (ANFWs) can be created and managed by the accelerator. ANFWs must be configured to take advantage of other accelerator features such as subnet and gateway route tables targeting ANFW endpoints. The ANFW as well as other associated features can be configured in the `network-config.yaml` accelerator configuration file. ANFW rule groups and policies are centrally managed in the `delegatedAdminAccount`, however they can be shared via AWS Resource Access Manager (RAM) to other member accounts for consumption. ANFW endpoints can be created in any member account, so long as the associated policy has been shared to that account or the organizational unit (OU) in which it resides.

!!!note "See also"
    [AWS Network Firewall configuration reference](../../typedocs/latest/classes/_aws_accelerator_config.NfwConfig.html)

## What is the relationship between firewalls, policies, and rule groups?

Firewalls have a one-to-one relationship with policies. Policies have a one-to-many relationship with rule groups. Rules defined within the rule groups are the explicit stateful and/or stateless inspection criteria for traffic passing through a firewall endpoint. When defining your ANFW configuration in the accelerator, it helps to work backwards from where the firewall endpoints will be deployed and what workloads the endpoints will be inspecting. From there you can define a policy and associated rule groups for those firewall endpoints to protect security trust zones that you’ve defined for your environment.

!!!note "See also"
    [AWS Network Firewall Developer Guide: More information on Network Firewall components](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-components.html)

## How do I deploy firewall endpoints?

Firewalls and their associated configuration properties are defined under the `firewalls` property of the `networkFirewall` object in the `network-config.yaml` accelerator configuration file. A firewall endpoint will be deployed in each VPC subnet specified in the `subnets` configuration property, so long as those subnets are contained within the VPC configured as the `vpc` property.

**Note:** Firewall endpoints are zonal resources, and as such a best practice is to deploy an endpoint per Availability Zone that will be enabled in your environment. This ensures your inspection infrastructure remains highly available and routing blackholes do not occur in the case of zone failure.

!!!note "See also"
    [Firewall configuration reference](../../typedocs/latest/classes/_aws_accelerator_config.NfwFirewallConfig.html)