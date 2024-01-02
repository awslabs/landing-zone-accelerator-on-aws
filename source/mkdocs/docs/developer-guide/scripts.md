# Core Command Line Interface (CLI) and Package Scripts

## Core CLI

The Landing Zone Accelerator CDK application is invoked using a custom-built implementation of the CDK toolkit. The implementation has additional context option flags that can be used to target pipeline stages, specific accounts, and other attributes. Users can invoke the accelerator pipeline stages locally using this CLI, or programmatically in sequence by running AWSAccelerator-Pipeline. Invoking stages locally can speed up development cycles by enabling developers to focus on deployment of a single stage, or help more advanced users of the solution to quickly deploy targeted updates to an environment. 

???+ note "Before using the CLI" 
    1. Ensure you have credentials for your accelerator management account set as [environment variables](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html) or as an [AWS CLI profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html)
    2.  Change your local working directory (starting from the root directory of the project): `cd source/packages/\@aws-accelerator/accelerator`

???+ warning 
     Local use of the CLI should be used with caution. Configuration changes deployed via this method do not have an approval/diff gate by default. You can add an approval gate to deploy operations by appending the following option: `--require-approval any-change`

**Example usage of the CLI:**
```
yarn run ts-node --transpile-only cdk.ts <toolkit_command> <options>
```

Native toolkit commands and options can be found in the [AWS CDK Toolkit reference](https://docs.aws.amazon.com/cdk/v2/guide/cli.html).

**Accelerator-specific context options:**

`--account`        The AWS account ID to deploy the pipeline stage

`--config-dir`     The local directory where the accelerator configuration files are stored

`--partition`      The AWS partition to deploy the pipeline stage

`--region`         The AWS region to deploy the pipeline stage

`--stage`          The pipeline stage to deploy. Stage names can be found in the [accelerator-stage.ts](https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/source/packages/%40aws-accelerator/accelerator/lib/accelerator-stage.ts) file.

??? info "Example synth command"
    ```
    yarn run ts-node --transpile-only cdk.ts synth --stage network-vpc --require-approval any-change --config-dir /path/to/aws-accelerator-config/ --partition aws --region <region> --account <REDACTED>
    ```

??? info "Example deploy command"
    ```
    yarn run ts-node --transpile-only cdk.ts deploy --stage network-vpc --require-approval any-change --config-dir /path/to/aws-accelerator-config/ --partition aws --region <region> --account <REDACTED> --app cdk.out
    ```

## Configuration Validator

The accelerator has a helper script that runs config validation on a provided configuration directory. This script is run during the Build stage of the pipeline, but may also be run locally if the development toolchain is installed.

**Example usage of the CLI:**
```
yarn run ts-node --transpile-only config-validator.ts /path/to/aws-accelerator-config/
```

??? info "Alternative syntax"
    ```
    yarn validate-config /path/to/aws-accelerator-config/
    ```

## Helper Scripts

Several helper scripts are built into the project that support performing common actions across the monorepo. These scripts are contained within ./source/package.json.
!!! note
    When scripts are run from the **./source** directory, the scope is the entire monorepo. They can also be run for each package under their respective directories.

 - `yarn build` - compiles TypeScript code into JavaScript
 - `yarn cleanup` - removes compiled TypeScript code, Node modules, and other build artifacts from the local repo
 - `yarn cleanup:tsc` - removes only compiled TypeScript code
 - `yarn docs` - generate TypeDocs
 - `yarn generate-all-docs` - generate TypeDocs for all versions of the solution (only available in **./source** directory)
 - `yarn install` - install package dependencies
 - `yarn lint` - run ESLint
 - `yarn prettier` - run Prettier
 - `yarn test` - run unit tests
 - `yarn test:clean` - remove test reports
 - `yarn validate-config /path/to/aws-accelerator-config` - shorthand for the configuration validator script documented in the previous section
 - `yarn update-snapshots` - verify current release version and automatically update snapshots