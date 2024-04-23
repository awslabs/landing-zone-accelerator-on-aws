# AWS Control Tower and Customizations for Control Tower (CfCT) FAQ

## How does this solution relate to AWS Control Tower?

When used in coordination with AWS Control Tower (CT), Landing Zone Accelerator will utilize the functionality provided by CT directly, such as using the CT Account Factory to generate and enroll new accounts. Landing Zone Accelerator fully intends to utilize AWS Control Tower APIs, when made available, to orchestrate additional features that CT provides, specifically 1/ OU creation and management, 2/ SCP creation and management, and 3/ CT control management. In the interim, Landing Zone Accelerator will not automate any actions that can potentially cause significant drift with CT, such as OU creation. The Landing Zone Accelerator team will work closely with the AWS Control Tower team to look around corners and avoid any one-way doors in design, implementation or deployment.

## Is Landing Zone Accelerator compatible with AWS Control Tower?

Yes, Landing Zone Accelerator is designed to coordinate directly with AWS Control Tower. AWS strongly recommends that you deploy AWS Control Tower as the foundation for the Landing Zone Accelerator. Landing Zone Accelerator extends the functionality of AWS Control Tower by adding additional orchestration of networking and security services within AWS. The Landing Zone Accelerator can be used to enable and orchestrate additional AWS services and features beyond the current functionality of AWS Control Tower through a simplified set of configuration files.

AWS Control Tower provides the easiest way to set up and govern a secure, multi-account AWS environment, also known as a landing zone. AWS Control Tower creates customers’ landing zone using AWS Organizations, bringing ongoing account management and governance as well as implementation best practices based on AWS’s experience working with thousands of customers as they move to the cloud.

By using the default [Landing Zone Accelerator on AWS sample configurations](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/reference/sample-configurations), you are able to quickly implement technical security controls and infrastructure foundations on AWS, in alignment with AWS best practices and in conformance with multiple, global compliance frameworks. If necessary, Landing Zone Accelerator can be deployed independently of AWS Control Tower to support regions and partitions that are currently not yet supported by AWS Control Tower. Learn more about AWS Control Tower Commercial Region availability [here](https://docs.aws.amazon.com/controltower/latest/userguide/region-how.html). Learn more about AWS Control Tower GovCloud (US) support [here](https://docs.aws.amazon.com/govcloud-us/latest/UserGuide/govcloud-controltower.html).

## AWS Control Tower just added new features that now overlap with Landing Zone Accelerator, what should I do?

A key design principle of Landing Zone Accelerator is to evolve over time as new AWS services and features become available. Where possible, Landing Zone Accelerator will defer to native AWS services to deliver functionality and over time will deprecate code/functionality in Landing Zone Accelerator if it can be replaced by a native AWS service such as AWS Control Tower.

## Can I create AWS GovCloud (US) accounts using Landing Zone Accelerator? What happens to the commercial account if I’m using AWS Control Tower?

Yes. You can specify the creation of an AWS GovCloud (US) account through the Landing Zone Accelerator configuration files. This requires that your Management Root account meets the requirements for creating an AWS GovCloud (US) account. After adding the new account information to the Landing Zone Accelerator configuration and releasing the pipeline, Landing Zone Accelerator will automate the creation of a new GovCloud account through the Organizations service. Since the creation of a GovCloud account also creates a commercial pair, the Landing Zone Accelerator will then automate the enrollment of the commercial account using the AWS Control Tower Account Factory Service Catalog product.

## If I deploy Landing Zone Accelerator now, can I enroll my environment into AWS Control Tower when the service becomes available in my region, such as AWS GovCloud (US) ADCs?

Yes. Landing Zone Accelerator is designed to align directly with the landing zone structure that AWS Control Tower provides. Landing Zone Accelerator requires the 3 mandatory accounts that are configured when you enable AWS Control Tower, 1/Management Root, 2/Logging, 3/Audit. When AWS Control Tower becomes available in your region, you will be able to configure your AWS Control Tower landing zone to reuse these same accounts for their specified functions. Additionally, per guidance from the AWS Control Tower service team, where possible, Landing Zone Accelerator will also deploy the same mandatory controls defined by the AWS Control Tower into your environment.

## How does Landing Zone Accelerator relate to CfCT?

CfCT allows customers to easily add customizations to their AWS Control Tower landing zone using AWS CloudFormation templates and service control policies (SCPs). Customers are able to configure their environment by updating and adding additional functionality to their CloudFormation templates. Customers that want to dive deeper into the foundational AWS resources and building blocks that are provided with CloudFormation, and/or have developmental experience with Infrastructure as Code (IaC), can utilize CfCT to add their customizations. CfCT handles the deployment of CloudFormation templates using StackSets which allows the deployment of up to 2000 stack instances at a time. Customers have the flexibility to define the dependencies and order that their CloudFormation templates should be deployed though the CfCT configuration.

Landing Zone Accelerator provides customers with a no-code solution for configuring an enterprise-ready and accreditation-ready environment on AWS. Customers with limited experience with IaC are able to interact with Landing Zone Accelerator through a simplified set of configuration files. Leveraging the AWS Cloud Development Kit (CDK) allows the Landing Zone Accelerator to deploy parallel stacks that go beyond the current instance limits of StackSets. Landing Zone Accelerator handles the dependencies and ordering of the CloudFormation templates and resource deployments; customers simply define what features they want enabled by Landing Zone Accelerator through their configuration files, and Landing Zone Accelerator handles where in the orchestration pipeline to enable the related resources and their dependencies.

## How do I choose between using Landing Zone Accelerator or CfCT?

Customers should use CfCT if they want to develop and maintain their own CloudFormation templates and also want the ability to define the dependencies and order that they should be deployed through the CfCT configuration across their multi-account environment.

Customers should use Landing Zone Accelerator if they want a no-code solution with a simplified set of configuration files that handles the deployment of resources across 35 services and their dependencies across their multi-account environment. Customers should also use Landing Zone Accelerator if they need a solution that can work in all regions and partitions, such as AWS GovCloud (US) and the US Secret and Top Secret regions.

## Can I use both Landing Zone Accelerator and CfCT? Are there any one-way doors?

You can use both Landing Zone Accelerator and CfCT to deploy additional customizations to your CT landing zone. Both Landing Zone Accelerator and CfCT support event driven architectures and post an SNS topic at the completion of their respective pipelines. Subscriptions can be set up against these SNS topics to initiate additional pipelines or custom IaC deployments. This includes having CfCT called after the completion of a Landing Zone Accelerator pipeline and vice versa. For customers that want a hybrid approach of a no-code solution to handle the orchestration and deployment of AWS security and networking services through Landing Zone Accelerator, can then use CfCT to add additional customizations directly with custom-developed CloudFormation templates

## Can I deploy or manage existing AWS Control Tower in Landing Zone Accelerator solution?

Using the Landing Zone Accelerator on AWS solution, you can create, update, or reset an AWS Control Tower Landing Zone.
It is possible to maintain the AWS Control Tower Landing Zone using the Landing Zone Accelerator solution. When the installer stack of the solution is deployed with the `ControlTowerEnabled` parameter set to `Yes`, then the Landing Zone Accelerator can deploy the AWS Control Tower Landing Zone for you. The solution will deploy the AWS Control Tower Landing Zone with the most recent version available.  

The Landing Zone Accelerator solution can deploy AWS Control Tower Landing Zone when following pre-requisites are met.

- AWS Organizations with all feature enabled

When AWS Organizations are not configured in your environment, the Landing Zone Accelerator solution will return an error. In the event that AWS Organizations has been configured, but not all features have been enabled, the solution will enable all features for your organization. After you create an organization and before you can deploy Landing Zone Accelerator solution, you must verify that you own the email address provided for the management account in the organization.  In order to learn more about setting up an AWS organization, you may refer to this [Creating an organization](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_org_create.html). 

- No AWS services enabled for AWS Organizations 

The Landing Zone Accelerator solution cannot deploy AWS Control Tower Landing Zone if AWS Organizations have any AWS service access enabled.


- No organization units in AWS Organizations

The Landing Zone Accelerator solution cannot deploy AWS Control Tower Landing Zone if there are any organizational units in AWS Organizations. AWS Control Tower and the Landing Zone Accelerator solution will create the necessary organization units for the deployment of the AWS Control Tower Landing Zone.

- No additional accounts in AWS Organizations

The Landing Zone Accelerator cannot deploy AWS Control Tower Landing Zone when there are other accounts in AWS Organizations than the management account. During the deployment of the AWS Control Tower Landing Zone, the solution will create shared accounts (LogArchive and Audit).


!!! warning "GovCloud (US)"
    Since shared accounts (LogArchive and Audit) will be existing in GovCloud (US), AWS Control Tower can be deployed when shared accounts (LogArchive and Audit) are successfully invited into AWS Organizations. The Landing Zone Accelerator requires that only three (3) AWS accounts (Management, LogArchive, and Audit) be part of the AWS Organization.


- No AWS IAM Identity Center configured

The Landing Zone Accelerator cannot deploy AWS Control Tower Landing Zone when an existing AWS IAM Identity Center is configured. AWS IAM Identity Center will be deployed during the deployment of the AWS Control Tower Landing Zone.

- None of the AWS Control Tower service roles are preset
    - [AWSControlTowerAdmin](https://docs.aws.amazon.com/controltower/latest/userguide/access-control-managing-permissions.html#AWSControlTowerAdmin)
    - [AWSControlTowerCloudTrailRole](https://docs.aws.amazon.com/controltower/latest/userguide/access-control-managing-permissions.html#AWSControlTowerCloudTrailRole)
    - [AWSControlTowerStackSetRole](https://docs.aws.amazon.com/controltower/latest/userguide/access-control-managing-permissions.html#AWSControlTowerStackSetRole)
    - [AWSControlTowerConfigAggregatorRoleForOrganizations](https://docs.aws.amazon.com/controltower/latest/userguide/roles-how.html#config-role-for-organizations)

If there are any AWS Control Tower service roles in the management account, Landing Zone Accelerator cannot deploy the AWS Control Tower Landing Zone. 


Landing Zone Accelerator performs the following pre-requisites before deploying AWS Control Tower Landing Zone. This [document](https://docs.aws.amazon.com/controltower/latest/userguide/lz-api-prereques.html) provides more information about AWS Control Tower pre-requisites. The solution will not perform any of the pre-requisites if there is an existing AWS Control Tower Landing Zone.

- Deploy AWS Control Tower service roles 
    - [AWSControlTowerAdmin](https://docs.aws.amazon.com/controltower/latest/userguide/access-control-managing-permissions.html#AWSControlTowerAdmin)
    - [AWSControlTowerCloudTrailRole](https://docs.aws.amazon.com/controltower/latest/userguide/access-control-managing-permissions.html#AWSControlTowerCloudTrailRole)
    - [AWSControlTowerStackSetRole](https://docs.aws.amazon.com/controltower/latest/userguide/access-control-managing-permissions.html#AWSControlTowerStackSetRole)
    - [AWSControlTowerConfigAggregatorRoleForOrganizations](https://docs.aws.amazon.com/controltower/latest/userguide/roles-how.html#config-role-for-organizations)

The Landing Zone Accelerator will deploy above AWS Control Tower service roles.



- Deploy AWS KMS CMK

The Landing Zone Accelerator will deploy AWS KMS CMK to encrypt AWS Control Tower resources.

The Landing Zone Accelerator solution will add the following `landingZone` configuration.

[GlobalConfig](../typedocs/latest/classes/_aws_accelerator_config.GlobalConfig.html) / [ControlTowerConfig](../typedocs/latest/classes/_aws_accelerator_config.ControlTowerConfig.html) / [ControlTowerLandingZoneConfig](../typedocs/latest/classes/_aws_accelerator_config.ControlTowerLandingZoneConfig.html)

```
landingZone:
  version: '3.3'
  logging:
    loggingBucketRetentionDays: 365
    accessLoggingBucketRetentionDays: 3650
    organizationTrail: true
  security:
    enableIdentityCenterAccess: true
```

#### AWS Control Tower Landing Zone Deployment
Landing Zone Accelerator will create two organizational units (`Security` and `Infrastructure`) when it deploys AWS Control Tower Landing Zone. In addition, AWS Organization level AWS CloudTrail trails will be configured with AWS KMS CMK encryption.

In the event that there is already an existing AWS Control Tower Landing Zone, Landing Zone Accelerator will not make any changes to it during initial deployment. In order to manage existing AWS Control Tower Landing Zone through the Landing Zone Accelerator solution, you will need to add `landingZone` configuration [ControlTowerLandingZoneConfig](../typedocs/latest/classes/_aws_accelerator_config.ControlTowerLandingZoneConfig.html) for `controlTower` configuration [GlobalConfig](../typedocs/latest/classes/_aws_accelerator_config.GlobalConfig.html) / [ControlTowerConfig](../typedocs/latest/classes/_aws_accelerator_config.ControlTowerConfig.html).

If any changes are made to the AWS Control Tower Landing Zone configuration, the Landing Zone Accelerator solution will attempt to update the AWS Control Tower Landing Zone. In the event that the current AWS Control Tower Landing Zone has drifted, the solution will attempt to reset it. 

The Landing Zone Accelerator solution will update AWS Control Tower Landing Zone when the [GlobalConfig.enabledRegions](../typedocs/latest/classes/_aws_accelerator_config.GlobalConfig.html#enabledRegions) property is modified. In this solution, the AWS Control Tower Landing Zone govern regions will be updated to match those included in [GlobalConfig.enabledRegions](../typedocs/latest/classes/_aws_accelerator_config.GlobalConfig.html#enabledRegions). 

!!! note
    Due to the fact that the Landing Zone Accelerator may deploy certain global AWS services, such as AWS Identity and Access Management (IAM) and AWS Organizations, the solution will add the global region to the list of governed regions in the AWS Control Tower if the home region of the Landing Zone Accelerator is not the same as the global region.  
---   


!!! warning "Important"

    In the event that the Landing Zone Accelerator solution determines that an existing AWS Control Tower Landing Zone needs to be reset or updated due to a change in `landingZone` [ControlTowerLandingZoneConfig](../typedocs/latest/classes/_aws_accelerator_config.ControlTowerLandingZoneConfig.html) configuration, it will validate that the version property of `landingZone` [ControlTowerLandingZoneConfig](../typedocs/latest/classes/_aws_accelerator_config.ControlTowerLandingZoneConfig.html) configuration is similar to the latest version ([AWS Control Tower release notes](https://docs.aws.amazon.com/controltower/latest/userguide/release-notes.html)) of AWS Control Tower Landing Zone available. This is due to the fact that changes to AWS Control Tower Landing Zone can only be made when the version matches that of the most recent available version of AWS Control Tower Landing Zone. A version mismatch error will be thrown when the Landing Zone Accelerator solution finds the latest version is not provided in global configuration.



!!! note
    The AWS Console should be used to enable or disable the region deny property for your AWS Control Tower Landing Zone. Currently, the Landing Zone Accelerator solution does not support the modification of the region deny feature. 
---    

!!! warning "Important"

    When the AWS Control Tower home region is an opt-in region, deploying the AWS Control Tower Landing Zone using the Landing Zone Accelerator on AWS may fail with the error message `AccessDenied`. The issue can be resolved by ensuring that the LogArchive and Audit accounts have opt-in regions enabled and then retrying the Control Tower. After Control Tower has been successfully deployed, you can retry the Landing Zone Accelerator pipeline.

#### Register organizational unit with AWS Control Tower
The Landing Zone Accelerator supports the registration of AWS Organizations organizational units with the AWS Control Tower. 

If a new organizational unit is found in the organization configuration file, the following activities will be performed by the solution:

- Create the AWS Organizations organizational unit.
- Register the organizational unit with AWS Control Tower.
- Invite any existing Amazon Web Services accounts to join the AWS Organization and accept the invitation from the invited account.
- Move the invited accounts into the organizational unit specified in the account configuration file.
- Enrollment in the AWS Control Tower for the invited accounts


Creating new organizational units and registering with AWS Control Tower is accomplished by adding them to the [OrganizationalUnitConfig](../typedocs/latest/classes/_aws_accelerator_config.OrganizationalUnitConfig.html) configuration.

!!! note
    For existing AWS accounts to be invited into AWS Organizations and registered with AWS Control Tower, the `managementAccountAccessRole` role in [GlobalConfig](../typedocs/latest/classes/_aws_accelerator_config.GlobalConfig.html) must be created. It is necessary for this role to include a trust policy that allows the management account to assume the role. The AWS managed policy [AdministratorAccess](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AdministratorAccess.html) must be assigned to this role. This role allows AWS Control Tower to manage your individual accounts and report information about them to your Audit and Log Archive accounts. The following is an example of a role trust policy. 
```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "controltower.amazonaws.com",
                "AWS": "arn:<PARTITION>:iam::<MANAGEMENT_ACCOUNT_ID>:root"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

---  



The Landing Zone Accelerator will check the status of already registered organizational units with the AWS Control Tower. In the event that the registration status has been `FAILED`, the solution will re-register the organizational unit.



