# LZA Version 2 Networking Stacks

## Overview

The Landing Zone Accelerator (LZA) now supports greater capacity for deploying networking resources. With this feature the LZA `network-vpc` stage splits networking resources across multiple stacks to allow for more than 500 resources to be deployed per account and region.

This feature now logically separates the deployment of resources in CloudFormation based off of the VPC and resource types. With this logical grouping of resources, the capacity for resources deployed by the LZA and CloudFormation greatly increases.

## How It Works

When this feature is enabled, all existing resources deployed in the Networking VPC stack will still exist in the base stack, and will continued to be updated and modified by the LZA in that stack. Any new resources deployed by the LZA will be deployed in the designated V2 stack which will be determined by the VPC and the resource type. The LZA will now deploy up to 8 new stacks per VPC defined in the configuration. The stacks are separated as follows

- VPC base stack
- VPC route table stack
- VPC subnets stack
- VPC security groups stack
- VPC subnet share stack
- VPC route entries stack
- VPC load balancers stack
- VPC nacls stack

Dependencies between these stacks are managed by the LZA, so new resources and dependencies will be deployed in the correct order during the `network-vpc` stage.

## When to Use

V2 stacks should be enabled if an account and region has reached the 500 resource limit per CloudFormation stack in the `NetworkVpc` stack. It should also be enabled if future planning will deploy many resources in the `network-vpc` stage in a particular account and region. Version 2 stacks will be enabled by default in new environments.

## Configuration

To enable Version 2 stacks for the LZA in the `global-config.yaml` file, add the `useV2Stacks` parameter at the top level, and set the value to `true`.

### Example Configuration

Below is an example configuration for the global-config that protects critical networking infrastructure:

```yaml
useV2Stacks: true
```

## Best Practices

### Protecting Networking Resources

When enabling V2 stacks it is *highly recommended* to enable [Stack Policies](./stack-policy.md) to protect critical networking resources. Stack Policies will ensure that their are no unexpected changes to networking resources while enabling this feature

It is also *highly recommended* to enable the diff stage (via the LZA installer template) so that changes can be reviewed before deploying v2 stacks.

## Limitations

The new stack format allows for the deployment of many VPCS and many resources for each VPC. However, this comes at the expense of deploying many more stacks for each environment. The CloudFormation stack limit for each account should be considered before enabling this feature.

At this time outposts and V2 stacks can not be enabled at the same time.
