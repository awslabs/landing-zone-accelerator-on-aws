# AWS Gateway Load Balancer FAQ

## Can I create a Gateway Load Balancer?

Yes. A Gateway Load Balancer (GWLB) must be configured to take advantage of other features such as GWLB endpoints and subnet and gateway route tables targeting GWLB endpoints. The GWLB as well as other features can be configured in the `network-config.yaml` accelerator configuration file. Gateway Load Balancers must be deployed to a VPC that is owned by the `delegatedAdminAccount`, however endpoints for the service can be distributed to any member account.

**Note:** Availability Zone (AZ) mappings differ between accounts. This means the actual AZ that zone A maps to in one account will likely differ in another member account of your organization. Before deploying a GWLB, ensure that these mappings are documented and your remaining network infrastructure is planned around these mappings.

GWLB endpoints are dependent on **endpoint services**, which are strictly zonal. This means an error will occur if you try to create an endpoint in a zone that that the GWLB was not deployed to. A workaround for this is to deploy your GWLB to all AZs in a region, however this may increase costs associated with data transfer between AZs.

!!!note "See also"
    * [Gateway Load Balancer configuration reference](../../typedocs/latest/classes/_aws_accelerator_config.GwlbConfig.html)
    * [AWS PrivateLink Developer Guide: More information on zonal dependencies for GWLB endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/create-gateway-load-balancer-endpoint-service.html)

## Can I create a target group for my Gateway Load Balancer?

Yes. As of v1.3.0 of the accelerator, EC2-based next-generation firewalls and target groups may be defined in the `customizations-config.yaml` accelerator configuration file. You may reference the target group name as the `targetGroup` property of a Gateway Load Balancer configuration in `network-config.yaml`, which tells the accelerator to place the configured instances/autoscaling groups into a target group for that Gateway Load Balancer.

**Note:** Gateway Load Balancers only support target groups using the GENEVE protocol and port 6081. If the target group uses any other configuration, an error will be thrown during the validation.

## How do I deploy Gateway Load Balancer endpoints?

GWLB endpoints are configured under the `endpoints` property of the `gatewayLoadBalancers` configuration object in the `network-config.yaml` accelerator configuration file. Endpoints can be deployed to any account that the accelerator manages, enabling the concept of separate security trust zones for north-south and east-west packet flows. These endpoints are consumers of an endpoint service that is created alongside the Gateway Load Balancer.

Successful creation of cross-account endpoints is dependent on the Availability Zones the GWLB is deployed to. Please refer to the guidance under **_Can I create a Gateway Load Balancer?_** for more information.