# Landing Zone Accelerator on AWS - Modules

This package orchestrates the implementation and sequencing of diverse modules(components) within the LandingZone Accelerator framework.

# How to integrate a NEW module into Accelerator?

Integrating a new module into LZA pipeline, can be achieved by following:

## Pre-Requisites

1.  For modules that need to make SDK API calls, you must create the corresponding API module within the `aws-lza` package, in the `source/packages/@aws-lza/lib` directory. While modules can support CDK applications, the CDK app development functionality is still under construction. Documentation will be updated once this feature is implemented.

For more information on this how to create SDK API module please refer this [documentation](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/module-development/).

## Integrate module into Accelerator Pipeline

1. Create orchestration of the new module. Implement the module's orchestration logic in the `source/packages/@aws-accelerator/modules/lib/actions/` folder. Define the execution flow, including whether the module will run in a single account or across multiple accounts and regions. Since LZA configuration is accessible, you'll need to process the LZA configuration data and define both the module's execution sequence and the order of various module actions. The orchestration should clearly specify how the module will be coordinated and executed within the LZA system. This involves determining the scope and sequence of operations based on the LZA configuration settings. You can find an example of such module here `source/packages/@aws-accelerator/modules/lib/actions/example-module.ts`. **Jest unit tests** must be added for the module orchestration class.

2. Add new module into `AcceleratorModules` enum in `source/packages/@aws-accelerator/modules/models/enums.ts` file.

3. Add the new module into `AcceleratorModuleStageDetails` constant in `source/packages/@aws-accelerator/modules/models/constants.ts` file. To ensure the new module runs at the appropriate point in the process, it should be incorporated into the specific stage of the Accelerator pipeline where its execution is required.

## Development LifeCycle

Incorporating a new module into the LZA pipeline requires submitting several merge requests in a specific sequence. The process unfolds as follows:

### Step 1 - Merge Request for SDK API calls module into `aws-lza`
Create merge request to create  SDK API calls module into `aws-lza` package, in the `source/packages/@aws-lza/lib` directory. This merge request must contain **jest unit tests**. This merge request should only be limited to `aws-lza` package.

### Step 2 - Merge Request for Module Orchestration Abstract Class
Within the `source/packages/@aws-accelerator/modules/lib/actions` directory, develop an abstract class for module orchestration and include its corresponding **jest unit tests**. The abstract class must contain a single public async function called execute, which should conform to the `AcceleratorModuleDetailsType` specification found in `source/packages/@aws-accelerator/modules/models/types.ts`. Additional private functions can be implemented within this class to handle specific module operations and various action implementations. This merge request ideally should have single file containing abstract class for module orchestration and corresponding unit test file.

### Step 3 - Merge Request for updating module runner inputs
As part of this merge request you will need to add new module name into `AcceleratorModules` enum in `source/packages/@aws-accelerator/modules/models/enums.ts` file. You will also need to add the new module into `AcceleratorModuleStageDetails` constant in `source/packages/@aws-accelerator/modules/models/constants.ts` file which will ensure LZA pipeline invokes the module execution.


**Note:** 

`source/packages/@aws-accelerator/modules/lib/actions/example-module.ts` file shows how to write a new module orchestration abstract class.