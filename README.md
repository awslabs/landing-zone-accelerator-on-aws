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

---

## Included Features

| Service           | Resource                          | Details                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS Config        | Config Recorder                   | The accelerator configures AWS Config Recorders in all specified accounts and regions                                                                                                                                                                   |
| AWS Config        | Config Rules                      | Defined in the security-config.yaml and deployed to all specified accounts and regions as individual account Config Rules. Support for Organizations Config Rules is planned for a future version                                                       |
| AWS Organizations | Organizational Units              | Defined in the organization-config.yaml and deployed through the management (root) in the home region                                                                                                                                                   |
| AWS Organizations | Service Control Policies          | Defined in the organization-config.yaml and deployed through the management (root) in the home region                                                                                                                                                   |
| Amazon Macie      | Macie Session                     | Defined in the security-config.yaml and deployed to all specified accounts and regions. Additionally, the accelerator will designate a service administrator account, commonly this is the security audit account                                       |
| Amazon GuardDuty  | GuardDuty                         | Defined in the security-config.yaml and deployed to all specified accounts and regions. Additionally, the accelerator will designate a service administrator account, commonly this is the security audit account                                       |
| AWS Cloudtrail    | Organizations Trail               | Defined in the global-config.yaml. When specified, an Organizations trail is deployed through the management (root) account to cover all regions, and all trails are recorded to the central-logging-bucket defined in the log-archive account.         |
| AWS IAM           | Policies / Roles / Groups / Users | Defined in the iam-config.yaml and deployed to all specified accounts and regions. Users that are specified in the configuration are created with AWS Secrets Manager generated passwords and stored locally in the account where the user was created. |

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

    http://www.apache.org/licenses/

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
