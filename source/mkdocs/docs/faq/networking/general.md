# General Networking FAQ

## What is the purpose of the `centralNetworkServices` configuration block?

This configuration block in `network-config.yaml` is a collection of several advanced networking services such as Route 53 Resolver, AWS Network Firewall, VPC IPAM, and Gateway Load Balancer. This collection of services and features support the concept of network centralization in AWS, meaning that a single member account (designated as `delegatedAdminAccount` in the configuration file) owns the resources. This strategy reduces the complexity, cost, and maintenance overhead of cloud network architectures, as core networking components are all centralized in a single member account of the organization.

Each resource housed in this account can be shared with the rest of the organization via AWS Resource Access Manager (RAM) or other means such as network routing strategies or VPC endpoint distribution. For example, in the case of centralized packet inspection via AWS Network Firewall or Gateway Load Balancer, VPC endpoints can be distributed to other member accounts that enable consumption of the services by your workloads. You may also design network architectures using Transit Gateway that “force” packets through a centralized inspection VPC prior to reaching their destination.

In addition, many newer AWS networking services are beginning to adopt the concept of “delegated administration,” meaning that a member account is delegated administrative authority for a service or set of services. This is identical to the functionality of security service delegated administration that has become a staple of centralized security operations in the cloud. The delegatedAdminAccount will be used for this purpose, along with the uses listed above. VPC IPAM is the first feature to use this paradigm, and forthcoming features in the accelerator will enable it if available.

## What are the differences between the `vpcs` and `vpcTemplates` configuration blocks?

The `vpcs` block serves as a way to define VPCs that are only meant to be deployed to a single account and region. This block is useful for defining core VPCs, such as a VPC for centralized interface endpoints and/or centralized deep packet inspection. This can also be leveraged to deploy one-off workload VPCs, but if a “t-shirt sizing” strategy has been established for your cloud infrastructure, `vpcTemplates` is likely a better configuration strategy for your workload VPCs.

`vpcTemplates` is useful for deploying a standard VPC size across multiple workload accounts or organizational units (OUs) in a single region. An example of this would be deploying a standard workload VPC to all accounts under a development OU. This feature utilizes VPC IPAM to ensure VPC CIDR ranges do not conflict but are provisioned with the same CIDR prefix length across all deployment target accounts. So long as the IPAM pool is not depleted, new VPCs will automatically be vended when accounts are registered to an OU and the accelerator pipeline is released, unless the account is explicitly excluded in the `deploymentTargets` configuration property.

## How do I define a centralized interface endpoint VPC?

Landing Zone Accelerator automates the heavy lifting associated with the configuration and management of a centralized interface endpoint VPC. This is facilitated through the `central` property under the `interfaceEndpoints` configuration in a [VpcConfig](../../typedocs/interfaces/packages__aws-accelerator_config_lib_models_network-config.IVpcConfig.html). Setting `central: true` will automate the provisioning of Route 53 private hosted zones for each endpoint service defined under this `interfaceEndpoints` configuration.

Additionally, to utilize these central endpoints from other VPCs and VPC templates, you may define `useCentralEndpoints: true` in their respective configuration blocks in order to automate the necessary private hosted zone associations to those VPCs.

**Notes:**

1. Additional network routing, such as routes via Transit Gateway or VPC peering, must be in place so API calls from spoke VPCs can reach the central interface endpoints VPC.
2. Only one central interface endpoint VPC may be defined per AWS region.
3. A VPC template cannot be used as a target for central endpoints.

!!!note "See also"
    For additional information on this design pattern, refer to [Centralized access to VPC private endpoints](https://docs.aws.amazon.com/whitepapers/latest/building-scalable-secure-multi-vpc-network-infrastructure/centralized-access-to-vpc-private-endpoints.html) from the AWS Whitepaper _Building a Scalable and Secure Multi-VPC AWS Network Infrastructure_

## Why is my VPC still associated with the central endpoint private hosted zones after I set `useCentralEndpoints: false` or deleted the VPC?

Landing Zone Accelerator associates a VPC with the central interface endpoint Route 53 private hosted zones (PHZs) **additively only**. When you set `useCentralEndpoints: true`, a custom resource running in the account that owns the central interface endpoint VPC (the account where `interfaceEndpoints.central: true` is configured, which is the `Network` account in the [Universal Configuration](https://github.com/aws/lza-universal-configuration/tree/main/modules/base/default/network-config.yaml)) associates that VPC with each endpoint service's PHZ.

The accelerator never performs the reverse operation. When you later set `useCentralEndpoints: false`, or delete the VPC entirely, LZA does **not** disassociate the VPC from those hosted zones. The association is left in place, and you must remove it manually. This is a deliberate design decision, not a defect.

### Why the accelerator does not remove the association automatically

Disassociating a VPC from a private hosted zone immediately stops private DNS resolution for those service endpoints inside the VPC. If the accelerator automatically removed an association for a VPC that still relied on the central endpoints (for example, a VPC that opts out in configuration but whose workloads still depend on private DNS during a migration), it would break name resolution and interrupt those workloads. There is also no reliable way for the accelerator to distinguish associations it created from associations you may have created outside LZA against the same hosted zone, so an automated reverse pass risks removing associations it does not own. Because the blast radius of an incorrect disassociation is high and the manual operation is a single API call, the accelerator leaves both the decision and the action to you.

### Impact of leaving the association in place

- Workloads in the VPC continue to resolve the central endpoints' private DNS names and route API calls through the central interface endpoints, so you continue to incur interface-endpoint usage and cross-VPC data-transfer charges even if you intended that traffic to take a different path.
- Each association counts against the Route 53 quota for the number of VPCs that can be associated with a private hosted zone (a default of 300 per hosted zone, adjustable). Stale associations consume that quota.

### How to remove the association manually

Perform these steps only **after** a pipeline run that includes the configuration change. When you set `useCentralEndpoints: false` (or remove the VPC from `network-config.yaml`), the next pipeline run strips the `accelerator:use-central-endpoints` tag from the VPC, which is what stops the association custom resource from re-adding it. If you disassociate before that run, the accelerator re-associates the VPC on its next run.

1. **List the hosted zones the VPC is still associated with.** Run this using the VPC ID and the Region the VPC was created in. You can run it from the account that owns the VPC or from the account that owns the central interface endpoint VPC:

    ```bash
    aws route53 list-hosted-zones-by-vpc \
      --vpc-id <vpc-id> \
      --vpc-region <region>
    ```

    The central endpoint hosted zones are named for the service and Region, for example `ec2.us-east-1.amazonaws.com` (there is one zone per endpoint service you configured as central). Note the `HostedZoneId` of each central endpoint zone you want to detach.

2. **Disassociate the VPC from each central endpoint hosted zone.** You can run this from either the account that created the hosted zone (the central interface endpoint VPC account) or the account that created the VPC; no cross-account authorization is required for disassociation. For a VPC that has already been deleted, run it from the hosted zone owner account:

    ```bash
    aws route53 disassociate-vpc-from-hosted-zone \
      --hosted-zone-id <hosted-zone-id> \
      --vpc VPCRegion=<region>,VPCId=<vpc-id>
    ```

    Repeat for each central endpoint hosted zone returned in step 1.

**Notes:**

1. Disassociate only the central endpoint hosted zones you intend to stop using. Do not disassociate the VPC from hosted zones owned by an AWS service (those with an `OwningService` value in the `list-hosted-zones-by-vpc` output) or from any zone you associated outside of LZA.
2. You cannot remove the last VPC from a private hosted zone. The central interface endpoint VPC remains associated with each zone as its owner, so disassociating a spoke VPC is always permitted.
3. If a VPC opts out of central endpoints in configuration but its workloads still depend on private DNS resolution to those endpoints, leave the association in place. Leaving it is the safe default; removing it stops resolution immediately.

!!!warning
    Disassociation takes effect immediately and stops private DNS resolution for those endpoints in the VPC. Confirm that no workloads in the VPC still depend on the central endpoints before you disassociate.

!!!note "See also"
    [DisassociateVPCFromHostedZone](https://docs.aws.amazon.com/Route53/latest/APIReference/API_DisassociateVPCFromHostedZone.html) in the _Amazon Route 53 API Reference_, and [Quotas on hosted zones](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/DNSLimitations.html) in the _Amazon Route 53 Developer Guide_.

## How do I remove a route table that a gateway endpoint (S3 or DynamoDB) routes into?

Gateway endpoints for `s3` and `dynamodb` associate directly with route tables through the `RouteTableIds` property of the underlying `AWS::EC2::VPCEndpoint` resource. Landing Zone Accelerator builds that association list from any route entry in the VPC whose `type` is `gatewayEndpoint` and whose `target` is `s3` or `dynamodb`.

If you remove such a route table (or the subnet and route table together) in a single pipeline run, the deployment fails in the `AWSAccelerator-NetworkVpcEndpointsStack` with an error similar to:

```
Resource handler returned message: "The Route Table Id 'rtb-xxxxxxxxxxxxxxxxx' does not exist.
(Service: Ec2, Status Code: 400, ...)" ... HandlerErrorCode: GeneralServiceException
```

This happens because of the fixed stack deployment order. The `Network-Vpc` stack runs first and deletes the route table. The `Network-VpcEndpoints` stack runs next and attempts to update the gateway endpoint to drop the (now deleted) route table from its associations. Amazon EC2 rejects any endpoint update that still references a route table ID that no longer exists, so the endpoint update fails and the stack rolls back.

To remove the route table safely, split the change across **two pipeline runs**:

**Run 1 — remove the gateway endpoint route entries, keep the route table.** Delete only the `s3`/`dynamodb` routes from the route table's `routes` list. This lets the endpoint drop the association while the route table still exists, so the update succeeds.

Before:

```yaml
routeTables:
  - name: Network-Endpoints-A
    routes:
      - name: S3Gateway
        type: gatewayEndpoint
        target: s3
      - name: DynamoDBGateway
        type: gatewayEndpoint
        target: dynamodb
```

After (Run 1):

```yaml
routeTables:
  - name: Network-Endpoints-A
    routes: []
```

**Run 2 — delete the route table (and any associated subnet).** With no gateway endpoint referencing it, the route table can now be removed from `network-config.yaml` without the endpoint stack attempting an update against a deleted ID.

**Notes:**

1. The same two-pass approach applies whether you are removing a single route table or a subnet-and-route-table pair.
2. If you only need to stop routing S3/DynamoDB traffic through a route table but intend to keep the route table itself, only Run 1 is required.
3. As an alternative architecture, S3 and DynamoDB also offer interface endpoints, which associate with subnets rather than route tables and are not subject to this ordering constraint.

### Recovering a stack that already failed

If you already ran the deletion in a single pass, the `AWSAccelerator-NetworkVpcEndpointsStack` is left in the `UPDATE_ROLLBACK_FAILED` state. In this state the stack cannot accept new updates, so the pipeline cannot self-recover and you must first return the stack to a stable state manually.

1. **Identify the stuck stack and the failed endpoint resources.** In the account and Region reported in the pipeline error, open the `AWSAccelerator-NetworkVpcEndpointsStack-<account>-<region>` stack. On the **Resources** tab, note the logical IDs of the `AWS::EC2::VPCEndpoint` resources in `UPDATE_FAILED` state (the S3 and/or DynamoDB gateway endpoints, for example `CentralVpcS3...` and `CentralVpcDynamodb...`).

2. **Continue the rollback, skipping the failed endpoints.** Roll the stack back to `UPDATE_ROLLBACK_COMPLETE`, skipping the endpoint resources that cannot roll back because their route table no longer exists:

    ```bash
    aws cloudformation continue-update-rollback \
      --stack-name AWSAccelerator-NetworkVpcEndpointsStack-<account>-<region> \
      --resources-to-skip <S3EndpointLogicalId> <DynamodbEndpointLogicalId> \
      --region <region>
    ```

    Run this with credentials for the account that owns the stack, using the same Region as the stack.

3. **Reconcile config with the deployed state.** Skipping a resource leaves it inconsistent with the template, so before the next deployment your `network-config.yaml` must match reality: remove the deleted route table's `s3`/`dynamodb` route entries (as in Run 1 above). This ensures the next pipeline run computes a valid endpoint association list rather than reintroducing the deleted route table ID.

4. **Re-run the pipeline.** Release the `AWSAccelerator-Pipeline`. With the stack back in a stable state and the config reconciled, the endpoint update reconciles the associations, after which you can proceed to remove the route table itself on a subsequent run (Run 2 above).

!!!warning
    `continue-update-rollback --resources-to-skip` returns the specified resources to a stable stack state but leaves them inconsistent with the template. Always reconcile `network-config.yaml` before the next deployment; skipping this step can cause subsequent updates to fail. Skip only the minimum set of resources required to roll the stack back.

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