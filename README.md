# Landing Zone Accelerator on AWS

The Landing Zone Accelerator on AWS solution helps you quickly deploy a secure,
resilient, scalable, and fully automated cloud foundation that accelerates your
readiness for your cloud compliance program. A landing zone is a cloud
environment that offers a recommended starting point, including default
accounts, account structure, network and security layouts, and so forth. From a
landing zone, you can deploy workloads that utilize your solutions and
applications.

The Landing Zone Accelerator (LZA) is architected to align with AWS best
practices and in conformance with multiple, global compliance frameworks. When
used in coordination with services such as AWS Control Tower, the Landing Zone
Accelerator provides a comprehensive no-code solution across 35+ AWS services to
manage and govern a multi-account environment built to support customers with
highly-regulated workloads and complex compliance requirements. The LZA helps
you establish platform readiness with security, compliance, and operational
capabilities.

This solution is provided as an open-source project that is built using the AWS
Cloud Development Kit (CDK). You install directly into your environment giving
you full access to the infrastructure as code (IaC) solution. Through a
simplified set of configuration files, you are able to configure additional
functionality, guardrails and security services (eg. AWS Managed Config Rules,
and AWS SecurityHub), manage your foundational networking topology (eg. VPCs,
Transit Gateways, and Network Firewall), and generate additional workload
accounts using the AWS Control Tower Account Factory.

There are no additional charges or upfront commitments required to use Landing
Zone Accelerator on AWS. You pay only for AWS services enabled in order to set
up your platform and operate your guardrails. This solution can also support
non-standard AWS partitions, including AWS GovCloud (US), and the US Secret and
Top Secret regions.

For an overview and solution deployment guide, please visit
[Landing Zone Accelerator on AWS](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/)

---

IMPORTANT: This solution will not, by itself, make you compliant. It provides
the foundational infrastructure from which additional complementary solutions
can be integrated. The information contained in this solution implementation
guide is not exhaustive. You must be review, evaluate, assess, and approve the
solution in compliance with your organization’s particular security features,
tools, and configurations. It is the sole responsibility of you and your
organization to determine which regulatory requirements are applicable and to
ensure that you comply with all requirements. Although this solution discusses
both the technical and administrative requirements, this solution does not help
you comply with the non-technical administrative requirements.

---

This solution collects anonymous operational metrics to help AWS improve the
quality of features of the solution. For more information, including how to
disable this capability, please see the [implementation guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/collection-of-operational-metrics.html).

---

## Package Structure

### @aws-accelerator/accelerator

A CDK Application. The core of the accelerator solution. Contains all the stack
definitions and deployment pipeline for the accelerator. This also includes the
CDK Toolkit orchestration.

### @aws-accelerator/config

A pure typescript library containing modules to manage the accelerator config
files.

### @aws-accelerator/constructs

Contains L2/L3 constructs that have been built to support accelerator actions,
such as creating an AWS Organizational Unit or VPC. These constructs are
intended to be fully reusable, independent of the accelerator, and do not
directly access the accelerator configuration files. Example: CentralLogsBucket,
an S3 bucket that is configured with a CMK with the proper key and bucket
policies to allow services and accounts in the organization to publish logs to
the bucket.

### @aws-accelerator/installer

Contains a CDK Application that defines the accelerator Installer stack.

### @aws-accelerator/ui (future)

A web application that utilizes the aws-ui-components library to present a
console to configure the accelerator

### @aws-accelerator/utils

Contains common utilities and types that are needed by @aws-accelerator/\*
packages. For example, throttling and backoff for AWS SDK calls

### @aws-cdk-extensions/cdk-extensions

Contains L2 constructs that extend the functionality of the CDK repo. The CDK
repo is an actively developed project. As the accelerator team identifies
missing features of the CDK, those features will be initially developed locally
within this repo and submitted to the CDK project as a pull request.

### @aws-cdk-extensions/tester

Accelerator tester CDK app. This package creates AWS Config custom rules for every test cases defined in test case manifest file.

---

## Included Features

| Service / Feature   | Resource                                              | Details                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS Control Tower   | Control Tower                                         | Enabled in the global-config.yaml. It is recommended that AWS Control Tower is enabled, if available, in the desired home region for your environment prior to installing the accelerator. When enabled, the accelerator will integrate with resources and guardrails deployed by AWS Control Tower.                                                      |
| AWS Config          | Config Recorder                                       | The accelerator configures AWS Config Recorders in all specified accounts and regions                                                                                                                                                                                                                                                                     |
| AWS Config          | Config Rules                                          | Defined in the security-config.yaml and deployed to all specified accounts and regions as individual account Config Rules. Support for Organizations Config Rules is planned for a future version                                                                                                                                                         |
| AWS Organizations   | Organizational Units                                  | Defined in the organization-config.yaml and deployed through the management (root) in the home region                                                                                                                                                                                                                                                     |
| AWS Organizations   | Service Control Policies                              | Defined in the organization-config.yaml and deployed through the management (root) in the home region                                                                                                                                                                                                                                                     |
| AWS SecurityHub     | SecurityHub                                           | Defined in the security-config.yaml and deployed to all specified accounts and regions. Additionally, the accelerator will designate a service administrator account, commonly this is the security audit account                                                                                                                                         |
| Amazon Macie        | Macie Session                                         | Defined in the security-config.yaml and deployed to all specified accounts and regions. Additionally, the accelerator will designate a service administrator account, commonly this is the security audit account                                                                                                                                         |
| Amazon GuardDuty    | GuardDuty                                             | Defined in the security-config.yaml and deployed to all specified accounts and regions. Additionally, the accelerator will designate a service administrator account, commonly this is the security audit account                                                                                                                                         |
| AWS Cloudtrail      | Organizations Trail                                   | Defined in the global-config.yaml. When specified, an Organizations trail is deployed through the management (root) account to cover all regions, and all trails are recorded to the central-logging-bucket defined in the log-archive account.                                                                                                           |
| Centralized Logging | S3                                                    | Defined in the global-config.yaml, integrates with AWS Control Tower, if enabled, to centralize logs from AWS services, such as AWS CloudTrail, AWS Config and VPC FlowLogs                                                                                                                                                                               |
| AWS IAM             | Policies / Roles / Groups / Users                     | Defined in the iam-config.yaml and deployed to all specified accounts and regions. The accelerator will integrate an identity provider (IdP) metadata document can be stored in AWS CUsers that are specified in the configuration are created with AWS Secrets Manager generated passwords and stored locally in the account where the user was created. |
| AWS IAM             | SAML Federation                                       | Defined in the iam-config.yaml and deployed to all specified accounts and regions. The accelerator will integrate the specified identity provider (IdP) metadata document with AWS IAM.                                                                                                                                                                   |
| Core Networking     | VPC / Subnets / Route Tables / Security Groups/ NACLs | Defined in the network-config.yaml and deployed to all specified accounts and regions                                                                                                                                                                                                                                                                     |
| Core Networking     | Transit Gateway                                       | Defined in the network-config.yaml and deployed to all specified accounts and regions. The accelerator will automatically attach VPCs to specified Transit Gateways                                                                                                                                                                                       |
| Core Networking     | VPC Endpoints                                         | Defined in the network-config.yaml and deployed to all specified accounts and regions. The accelerator will also deploy AWS Route53 Hosted Zones to specified VPCs to support centralized VPC endpoint usage                                                                                                                                              |
| Core Networking     | VPC Flow Logs                                         | Defined in the network-config.yaml and deployed to all specified accounts and regions. VPC Flow Logs can be configured on all defined VPCs to send to S3 for centralized logging and/or CloudWatch Logs                                                                                                                                                   |

## Creating an Installer Stack

The Installer Stack, a CDK Application, can be deployed through a CloudFormation template produced by your CLI by
navigating to the directory for the installer and running a CDK synthesis. The template can either be deployed
directly via the AWS CLI or console. Below are the commands for completing the deployment of the Installer stack.

### 1. Build the Installer stack for deployment

- To run the CDK synthesis

```
cd <rootDir>/source/packages/@aws-accelerator/installer
yarn cdk synth
```

- Configure the AWS CLI CloudFormation command for the Installer stack

```
aws cloudformation create-stack --stack-name AWSAccelerator-InstallerStack --template-body file://cdk.out/AWSAccelerator-InstallerStack.template.json \
--parameters ParameterKey=RepositoryName,ParameterValue=<Repository_Name> \
ParameterKey=RepositoryBranchName,ParameterValue=<Branch_Name> \
ParameterKey=AcceleratorQualifier,ParameterValue=<Accelerator_Qualifier> \
ParameterKey=ManagementAccountId,ParameterValue=<Management_Id> \
ParameterKey=ManagementAccountEmail,ParameterValue=<Management_Email> \
ParameterKey=ManagementAccountRoleName,ParameterValue= \
ParameterKey=LogArchiveAccountEmail,ParameterValue=<LogArchive_Email> \
ParameterKey=AuditAccountEmail,ParameterValue=<Audit_Email> \
ParameterKey=EnableApprovalStage,ParameterValue=Yes
ParameterKey=ApprovalStageNotifyEmailList,ParameterValue=comma-delimited-notify-emails
--capabilities CAPABILITY_IAM
```

- Alternate deployment of CloudFormation via AWS console:

```
- Navigate to CloudFormation page in the AWS console
- Select ‘Create Stack’ and from the dropdown pick ‘with new resources (standard)’
- For the prerequisite template, select ‘Template is ready’
- When specifying the template, select ‘Upload a template file’
- Ensure that you select the correct file ‘AWSLandingZoneAccelerator-InstallerStack.template.json’
- Fill out the required parameters in the UI, and create the stack once the parameters are inputted.
```

- Dependencies for the Installer stack

```
- [Node](https://nodejs.org/en/)
- [AWS CDK](https://aws.amazon.com/cdk/)
- [Yarn](https://yarnpkg.com/)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

    http://www.apache.org/licenses/

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
