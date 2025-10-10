# CloudFormation Stack Policy Protection

## Overview

The Landing Zone Accelerator (LZA) now supports CloudFormation Stack Policies, enabling organizations to prevent unintentional updates or deletions of critical stack resources during CloudFormation stack updates. Stack policies in LZA allow configuration of specific resource types to be protected. Only stacks created by LZA are affected by this feature.

This capability serves as a fail-safe mechanism specifically designed for stack updates, complementing existing IAM controls rather than replacing them. Stack Resource Protection helps organizations maintain infrastructure stability by preventing accidental modifications to critical resources while still providing flexibility for controlled updates when needed.

## How It Works

When enabled, LZA applies a stack policy to all CloudFormation stacks it manages. The policy prevents the specified resource types from being replaced or deleted during stack updates. This protection applies to all accounts and regions where LZA deploys resources.

The stack policy uses a "deny-by-default" approach for the specified resource types:

- It explicitly denies `Update:Replace` and `Update:Delete` operations for the protected resource types
- It allows all other update operations on protected resources (such as `Update:Modify`)
- It allows all operations on non-protected resources

## When to Use

Consider enabling stack policies when:

- You have critical infrastructure components that should never be accidentally deleted
- You want to prevent accidental replacement of resources that would cause service disruption
- You need an additional layer of protection beyond IAM permissions
- You're managing complex infrastructure where the impact of resource replacement might not be immediately obvious

## Configuration

To enable stack policies, add the `stackPolicy` section to your `global-config.yaml` file. The configuration requires two elements:

1. `enable`: Set to `true` to activate stack policies
2. `protectedTypes`: A list of CloudFormation resource types to protect

More information is available in the AWS documentation: [Prevent updates to stack resources - AWS CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/protect-stack-resources.html)

### Example Configuration

Below is an example configuration for the global-config that protects critical networking infrastructure:

```yaml
stackPolicy:
    enable: true
    protectedTypes:
        - "AWS::EC2::InternetGateway"
        - "AWS::EC2::NatGateway"
        - "AWS::EC2::PrefixList"
        - "AWS::EC2::Route"
        - "AWS::EC2::RouteTable"
        - "AWS::EC2::SubnetRouteTableAssociation"
        - "AWS::EC2::TransitGateway"
        - "AWS::EC2::TransitGatewayPeeringAttachment"
        - "AWS::EC2::TransitGatewayRoute"
        - "AWS::EC2::TransitGatewayRouteTable"
        - "AWS::EC2::TransitGatewayRouteTableAssociation"
        - "AWS::EC2::TransitGatewayRouteTablePropagation"
        - "AWS::EC2::TransitGatewayVpcAttachment"
        - "AWS::EC2::VPC"
        - "AWS::EC2::VPCCidrBlock"
        - "AWS::EC2::VPCEndpoint"
        - "AWS::EC2::VPCGatewayAttachment"
        - "AWS::NetworkFirewall::Firewall"
        - "AWS::NetworkFirewall::LoggingConfiguration"
        - "AWS::RAM::ResourceShare"
```

## Best Practices

### Resource Selection

When deciding which resource types to protect, consider:

- **Critical infrastructure components**: Protect resources that form the foundation of your infrastructure, such as VPCs, Transit Gateways, and core networking components.

- **Resources with external dependencies**: Protect resources that have dependencies outside of CloudFormation, such as resources that other systems or applications depend on.

- **Resources with state**: Protect resources that maintain state or configuration that would be lost if the resource were replaced.

### Handling Protected Resources

When you need to update a protected resource:

1. Temporarily disable the stack policy by setting `enable: false` in your configuration.
2. Deploy the changes using LZA.
3. Re-enable the stack policy by setting `enable: true`.
4. Deploy again to restore protection.

## Limitations

- Stack policies only protect resources during CloudFormation stack updates. They do not prevent resources from being modified directly through the AWS Management Console, CLI, or APIs.

- Stack policies do not prevent the deletion of an entire stack. To prevent stack deletion, use the `terminationProtection` setting in your global configuration.

- Stack policies only apply to stacks created and managed by LZA. They do not affect stacks created outside of LZA.