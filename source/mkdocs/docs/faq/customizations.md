# LZA Customizations FAQ

## What is Customizations stage?
The customizations stage is used to manage configuration of custom applications, third-party firewall appliances, and CloudFormation stacks. If there are AWS services which are not currently supported natively by the LZA, Customizations offers a solution to create these resources via custom CloudFormation stacks or stacksets. For more information on Customizations and the associated Typedocs, please see: https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/v1.6.0/classes/_aws_accelerator_config.CustomizationsConfig.html


## How can I protect CloudFormation resources deployed via Customizations?
The Landing Zone Accelerator is intended to give customers the freedom to customize their environment to their compliance requirements and does not enforce deletion protections on CloudFormation resources deployed in the Customizations stage. The recommended approach is to utilize resource-level deletion policies in the CloudFormation stack as shown in the link below:
https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html
