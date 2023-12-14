# Architecture and Design Philosophy

This section outlines the overall design and patterns used in the Landing Zone Accelerator to automate the deployment of AWS resources. For additional information, please see the [Architecture overview](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/architecture-overview.html) and [Architecture details](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/architecture-details.html) sections of the Implementation Guide.

## Overall Deployment Strategy

The LZA takes a configuration-based approach to deploying AWS resources across a set of AWS accounts we will refer to as the "deployment environment." The LZA pipeline ingests a set of configuration files provided by the user and transforms the desired configuration to a set of AWS CloudFormation stacks synthesized using the AWS CDK. These stacks are deployed via AWS CodePipeline in a logically ordered set of [stages](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-pipeline.html) to account for dependencies between various resources.

Most stages of the [core pipeline](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-pipeline.html) initiate an AWS CodeBuild job that runs the Core Command Line Interface (above) with appropriate arguments. The two most commonly run toolkit commands are **synth** and **deploy** to synthesize and deploy the CloudFormation templates. For example, during the Logging stage the following commands are run:
```
// Synthesize CloudFormation templates
yarn run ts-node --transpile-only cdk.ts synth --stage operations --config-dir /path/to/aws-accelerator-config/ --partition aws

// Deploy CloudFormation templates
yarn run ts-node --transpile-only cdk.ts deploy --stage network-vpc --require-approval any-change --config-dir /path/to/aws-accelerator-config/ --partition aws --app cdk.out
```

These commands execute the core logic of the CDK, contained in `source/packages/@aws-accelerator/accelerator`. Specifically, this command uses `cdk.ts` as an entrypoint to invoke `lib/accelerator.ts`, which executes parallel instances of `lib/toolkit.ts` to each synthesize or deploy a single CloudFormation stack for each unique pair of account and region in the deployment environment. The above command would synthesize a set of CloudFormation stacks with names following the pattern:
```
AWSAccelerator-LoggingStack-${ACCOUNT_ID}-${REGION}
```

## Accelerator

The accelerator module includes the core LZA engine logic and defines each stack deployed by the LZA pipeline.
### Stacks

AWS resources deployed by LZA are grouped by function as described in the [core pipeline](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-pipeline.html) page. For each stage, there is at least one corresponding class located in `source/packages/@aws-accelerator/accelerator/lib/stacks`. Using our example above, the logic defining the contents of the Logging stack is defined in `accelerator/lib/stacks/logging-stack.ts`. The logic contained in the stack evaluates the parsed configuration and accordingly adds CloudFormation resources and CDK [constructs](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html) to define the AWS resources in scope.

### When would I add or modify a stack?

Changes are made at the stack level when creating new resources via LZA or modifying the deployment method for existing deployments. Most feature requests will require changes to at least one Stack class.

## Config

The accepted format of the YAML files defined in the `aws-accelerator-config` configuration repository is defined within `source/packages/@aws-accelerator/config`. For example, valid types within the `global-config.yaml` are defined in `config/lib/global-config.ts`. Within these classes we determine the accepted properties and options for the deployment of AWS services. This module also includes a `/validation` subdirectory that contains code to verify the customer-provided set of YAML files is valid during the Build phase of the pipeline. 

### When would I add or modify a config?

Changes are made to the config files when enabling the creation of new resource types via LZA or adding additional configuration options. This is a good place to start development of a new feature as it forces you to consider the options to provide customers when using a new feature.

## Constructs

As defined by CDK:
> Constructs are the basic building blocks of AWS CDK apps. A construct represents a "cloud component" and encapsulates everything AWS CloudFormation needs to create the component.

LZA uses constructs to abstract more complex logic from the Stack classes to modular, well-defined components. Constructs may be used to deploy a single CloudFormation resource, a set of related resources, or any custom resources required by the Stacks. The LZA includes its constructs in the `source/packages/@aws-accelerator/constructs` directory.

### When would I add or modify a construct?

Constructs are created or modified when there is a significant code addition to facilitate the deployment of new resources. Constructs should be used to minimize the amount of business logic with the Stack classes.
