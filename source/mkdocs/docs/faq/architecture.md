# Architecture FAQ

## What does the solution deploy?

The Landing Zone Accelerator is ultimately an orchestration engine that will deploy and configure the resources you specify in your configuration files. The Landing Zone Accelerator orchestration engine is deployed using AWS CloudFormation and utilizes AWS CodeCommit, AWS CodePipeline, and AWS CodeBuild to execute a Cloud Development Kit (CDK) application. This application is responsible for ingesting your configuration and deploying your resources through additional AWS CloudFormation stacks across your environment.

For further details on the Landing Zone Accelerator orchestration engine, see [Architecture overview](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/architecture-overview.html) and [Architecture details](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/architecture-details.html) in the implementation guide.

## What does the AWS sample configuration deploy?

The Landing Zone Accelerator provides opinionated configurations that are based on our years of building environments for customers with highly regulated workloads. By using the [standard sample configuration](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/reference/sample-configurations/lza-sample-config), you can expect the architecture in the solution’s [Architecture overview](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/architecture-overview.html) to be deployed.

## Is there a sample configuration for my industry?

You may find the current list of supported industry sample configurations in the [sample configurations](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/reference/sample-configurations) directory of our GitHub repository. Supporting documentation for these sample configurations can be found in the README.md of each configuration directory. 

## How do I customize what the solution deploys?

The solution's [configuration files](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/configuration-files.html) are the primary interface for what the accelerator deploys. The supported services, features, and API references for these config files can be found in the [User Guide](../user-guide/index.md) of our [GitHub Pages website](../index.md). You may use the configuration reference to update a sample configuration to meet your organization's needs, or to craft your own configuration from scratch.