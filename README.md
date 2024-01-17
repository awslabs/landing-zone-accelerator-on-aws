- [Landing Zone Accelerator on AWS](#landing-zone-accelerator-on-aws)
  - [Documentation](#documentation)
  - [Package Structure](#package-structure)
    - [@aws-accelerator/accelerator](#aws-acceleratoraccelerator)
    - [@aws-accelerator/config](#aws-acceleratorconfig)
    - [@aws-accelerator/constructs](#aws-acceleratorconstructs)
    - [@aws-accelerator/installer](#aws-acceleratorinstaller)
    - [@aws-accelerator/lza_modules](#aws-acceleratorlza-modules)
    - [@aws-accelerator/ui (future)](#aws-acceleratorui-future)
    - [@aws-accelerator/utils](#aws-acceleratorutils)
    - [@aws-cdk-extensions/cdk-extensions](#aws-cdk-extensionscdk-extensions)
    - [@aws-cdk-extensions/tester](#aws-cdk-extensionstester)

# Landing Zone Accelerator on AWS

The Landing Zone Accelerator on AWS (LZA) is architected to align with AWS best practices
and in conformance with multiple, global compliance frameworks. We recommend customers
deploy AWS Control Tower as the foundational landing zone and enhance their landing zone
capabilities with Landing Zone Accelerator. These complementary capabilities provide a
comprehensive low-code solution across 35+ AWS services to manage and govern a multi-account
environment built to support customers with highly-regulated workloads and complex compliance
requirements. AWS Control Tower and Landing Zone Accelerator help you establish platform
readiness with security, compliance, and operational capabilities.

Landing Zone Accelerator is provided as an open-source project that is built using the AWS
Cloud Development Kit (CDK). You install directly into your environment to
get full access to the infrastructure as code (IaC) solution. Through a
simplified set of configuration files, you are able to configure additional
functionality, controls and security services (e.g. AWS Managed Config Rules,
and AWS Security Hub), manage your foundational networking topology (e.g. VPCs,
Transit Gateways, and Network Firewall), and generate additional workload
accounts using the AWS Control Tower Account Factory.

There are no additional charges or upfront commitments required to use Landing
Zone Accelerator on AWS. You pay only for AWS services enabled in order to set
up your platform and operate your controls. This solution can also support
non-standard AWS partitions, including AWS GovCloud (US), and the US Secret and
Top Secret regions.

For an overview and solution deployment guide, please visit
[Landing Zone Accelerator on AWS](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/)

---

IMPORTANT: This solution will not, by itself, make you compliant. It provides
the foundational infrastructure from which additional complementary solutions
can be integrated. The information contained in this solution implementation
guide is not exhaustive. You must review, evaluate, assess, and approve the
solution in compliance with your organization’s particular security features,
tools, and configurations. It is the sole responsibility of you and your
organization to determine which regulatory requirements are applicable and to
ensure that you comply with all requirements. Although this solution discusses
both the technical and administrative requirements, this solution does not help
you comply with the non-technical administrative requirements.

---

This solution collects anonymized operational metrics to help AWS improve the
quality of features of the solution. For more information, including how to
disable this capability, please see the [implementation guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/collection-of-operational-metrics.html).

## Documentation

Additional documentation for the solution is hosted on [GitHub Pages](https://awslabs.github.io/landing-zone-accelerator-on-aws). We strongly recommend reviewing this resource as well as the [Implementation Guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws) for important details on deployment, customization, and maintenance of the solution and its included sample configuration files. 

> **NOTE:** The installation and configuration reference documentation that was previously hosted in this README has been migrated to the new GitHub Pages location.

## Package Structure

### @aws-accelerator/accelerator

A CDK Application. The core of the accelerator solution. Contains all the stack
definitions and deployment pipelines for the accelerator. This also includes the
CDK Toolkit orchestration.

### @aws-accelerator/config

A pure TypeScript library containing modules to manage the accelerator config
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

### @aws-accelerator/lza-modules

Contains various accelerator modules, deployed by the solution.

### @aws-accelerator/ui (future)

A web application that utilizes the aws-ui-components library to present a
console to configure the accelerator.

### @aws-accelerator/utils

Contains common utilities and types that are needed by @aws-accelerator/\*
packages. For example, throttling and backoff for AWS SDK calls.

### @aws-cdk-extensions/cdk-extensions

Contains L2 constructs that extend the functionality of the CDK repo. The CDK
repo is an actively developed project. As the accelerator team identifies
missing features of the CDK, those features will be initially developed locally
within this repo and submitted to the CDK project as a pull request.

### @aws-cdk-extensions/tester

Accelerator tester CDK app. This package creates AWS Config custom rules for every test case defined in the test case manifest file.

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

    http://www.apache.org/licenses/

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
