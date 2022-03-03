# AWS Platform Accelerator

The AWS Platform Accelerator is provided by the AWS Solutions Library, a
collection of cloud-based solutions for dozens of technical and business
problems, vetted for you by AWS. This solution will accelerate the
implementation of technical security controls and infrastructure foundation on
AWS, in alignment with AWS best practices and in conformance with multiple,
global compliance frameworks.

The AWS Platform Accelerator allows customers to define their environment in a
set of configuration files. These files are ingested by a Cloud Development Kit
(CDK) application that will deploy specified AWS resources, such as security
services and networking services, into a multi-account and multi-region
environment using CDK-generated AWS CloudFormation.

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

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

    http://www.apache.org/licenses/

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
