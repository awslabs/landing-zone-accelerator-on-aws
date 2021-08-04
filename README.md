# aws-compliance-accelerator
%%SOLUTION_DESCRIPTION%%

The cdk-solution-init-pkg provides a reference for building solutions using the AWS Cloud Development Kit (CDK). This package contains basic build scripts, sample source code implementations, and other essentials for creating a solution from scratch.

***

## Initializing the Repository

After successfully cloning the repository into your local development environment, a source code package must be built based on your language of choice. This will define which language the CDK code will be written in.

Run the `initialize-repo.sh` script at the root level of the project file. This script will prompt a series of questions before initializing a git repo using the current directory name as the solution name. It will also stage the `deployment` and `source` directories with fundamental assets for your solution.

- The language selected when running this script will determine whether to provision a TypeScript, Python, Java, or C# CDK project into your `deployment` and `source` directories. This is the language you will be working with when defining your infrastructure using the CDK. Your source code packages for Lambda functions and custom resources may be in different languages.

***

## File Structure

Upon successfully cloning the repository into your local development environment but **prior** to running the initialization script, you will see the following file structure in your editor:

```
|- .github/ ...               - resources for open-source contributions.
|- deployment/                - contains build scripts, deployment templates, and dist folders for staging assets.
  |- .typescript/                - typescript-specific deployment assets.
  |- .python/                   - python-specific deployment assets.
  |- .java/                     - java-specific deployment assets.
  |- .csharp/                   - csharp-specific deployment assets.
|- source/                    - all source code, scripts, tests, etc.
  |- .typescript/                - typescript-specific source assets.
  |- .python/                   - python-specific source assets.
  |- .java/                     - java-specific source assets.
  |- .csharp/                   - csharp-specific source assets.
|- .gitignore
|- .viperlightignore          - Viperlight scan ignore configuration  (accepts file, path, or line item).
|- .viperlightrc              - Viperlight scan configuration.
|- buildspec.yml              - main build specification for CodeBuild to perform builds and execute unit tests.
|- CHANGELOG.md               - required for every solution to include changes based on version to auto-build release notes.
|- CODE_OF_CONDUCT.md         - standardized open source file for all solutions.
|- CONTRIBUTING.md            - standardized open source file for all solutions.
|- copy-repo.sh               - copies the baseline repo to another directory and optionally initializes it there.
|- initialize-repo.sh         - initializes the repo.
|- LICENSE.txt                - required open source file for all solutions - should contain the Apache 2.0 license.
|- NOTICE.txt                 - required open source file for all solutions - should contain references to all 3rd party libraries.
|- README.md                  - required file for all solutions.

* Note: Not all languages are supported at this time. Actual appearance may vary depending on release.
```

**After** running the initialization script, you will see a language-specific directory in both the `/source` and `/deployment` folders expanded based on your CDK language choice. Example below after `./initialize-repo.sh` is run with `typescript` selected as the language of choice. Notice the removal of the language-specific directories after running the command. The repo is now ready for solution development.

```
|- .github/ ...               - resources for open-source contributions.
|- deployment/                - contains build scripts, deployment templates, and dist folders for staging assets.
  |- cdk-solution-helper/     - helper function for converting CDK output to a format compatible with the AWS Solutions pipelines.
  |- build-open-source-dist.sh  - builds the open source package with cleaned assets and builds a .zip file in the /open-source folder for distribution to GitHub
  |- build-s3-dist.sh         - builds the solution and copies artifacts to the appropriate /global-s3-assets or /regional-s3-assets folders.
  |- clean-dists.sh           - utility script for clearing distributables.
|- source/                    - all source code, scripts, tests, etc.
  |- bin/
    |- cdk-solution.ts        - the CDK app that wraps your solution.
  |- lambda/                  - example Lambda function with source code and test cases.
    |- test/
    |- index.js
    |- package.json
  |- lib/
    |- cdk-solution-stack.ts  - the main CDK stack for your solution.
  |- test/
    |- __snapshots__/
    |- cdk-solution-test.ts   - example unit and snapshot tests for CDK project.
  |- cdk.json                 - config file for CDK.
  |- jest.config.js           - config file for unit tests.
  |- package.json             - package file for the CDK project.
  |- README.md                - doc file for the CDK project.
  |- run-all-tests.sh         - runs all tests within the /source folder. Referenced in the buildspec and build scripts.
|- .gitignore
|- .viperlightignore          - Viperlight scan ignore configuration  (accepts file, path, or line item).
|- .viperlightrc              - Viperlight scan configuration.
|- buildspec.yml              - main build specification for CodeBuild to perform builds and execute unit tests.
|- CHANGELOG.md               - required for every solution to include changes based on version to auto-build release notes.
|- CODE_OF_CONDUCT.md         - standardized open source file for all solutions.
|- CONTRIBUTING.md            - standardized open source file for all solutions.
|- LICENSE.txt                - required open source file for all solutions - should contain the Apache 2.0 license.
|- NOTICE.txt                 - required open source file for all solutions - should contain references to all 3rd party libraries.
|- README.md                  - required file for all solutions.
```

***

## Building your CDK Project

After initializing the repository, make any desired code changes. As you work through the development process, the following commands might be useful for
periodic testing and/or formal testing once development is completed. These commands are CDK-related and should be run at the /source level of your project.

CDK commands:
- `cdk init` - creates a new, empty CDK project that can be used with your AWS account.
- `cdk synth` - synthesizes and prints the CloudFormation template generated from your CDK project to the CLI.
- `cdk deploy` - deploys your CDK project into your AWS account. Useful for validating a full build run as well as performing functional/integration testing
of the solution architecture.

Additional scripts related to building, testing, and cleaning-up assets may be found in the package.json file or in similar locations for your selected CDK language. You can also run `cdk -h` in the terminal for details on additional commands.

***

## Running Unit Tests

The `/source/run-all-tests.sh` script is the centralized script for running all unit, integration, and snapshot tests for both the CDK project as well as any associated Lambda functions or other source code packages.

- Note: It is the developer's responsibility to ensure that all test commands are called in this script, and that it is kept up to date.

This script is called from the solution build scripts to ensure that specified tests are passing while performing build, validation and publishing tasks via the pipeline.

***

## Building Project Distributable
* Configure the bucket name of your target Amazon S3 distribution bucket
```
export DIST_OUTPUT_BUCKET=my-bucket-name # bucket where customized code will reside
export SOLUTION_NAME=my-solution-name
export VERSION=my-version # version number for the customized code
export REGION=aws-region-code # e.g. us-east-1
```
_Note:_ You would have to create an S3 bucket with the prefix 'my-bucket-name-<aws_region>'; aws_region is where you are testing the customized solution. Also, the assets in bucket should be publicly accessible.

* Now build the distributable:
```
chmod +x ./build-s3-dist.sh
./build-s3-dist.sh $DIST_OUTPUT_BUCKET $SOLUTION_NAME $VERSION
```

* Deploy the distributable to an Amazon S3 bucket in your account. _Note:_ you must have the AWS Command Line Interface installed.
```
aws s3 cp ./dist/ s3://$DIST_OUTPUT_BUCKET-$REGION/$SOLUTION_NAME/$VERSION/ --recursive --acl bucket-owner-full-control --profile aws-cred-profile-name
```

* Get the link of the solution template uploaded to your Amazon S3 bucket.
* Deploy the solution to your account by launching a new AWS CloudFormation stack using the link of the solution template in Amazon S3.

***

## Building Open-Source Distributable

* Run the following command to build the open-source project:
```
chmod +x ./build-open-source-dist.sh
./build-open-source-dist.sh $SOLUTION_NAME
```

* Validate that the assets within the output folder are accurate and that there are no missing files.

***

## Collection of operational metrics
This solution collects anonymous operational metrics to help AWS improve the quality and features of the solution. For more information, including how to disable this capability, please see the [implementation guide](deep link into the documentation with specific information about the metrics and how to opt-out).

***

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

    http://www.apache.org/licenses/

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.
