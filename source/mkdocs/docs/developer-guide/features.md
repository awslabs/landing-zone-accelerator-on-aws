# Feature Development

This section outlines guidance for developing features for Landing Zone Accelerator.

## Deploying resource dependencies via Landing Zone Accelerator

When developing features for the accelerator, you may encounter situations where resources in one stack may need to reference resources created in prior stages of the pipeline. This is especially true if you need to ensure a certain resource is available in all accounts and regions managed by the solution before that resource is consumed by subsequent stacks (e.g. cross-account IAM roles, S3 buckets). `DependenciesStack` has been introduced to the pipeline for this use case. Deployed during the `Key` stage of the pipeline, any resources added to this stack may be utilized globally by the accelerator in subsequent stacks. This stack may be considered a means to "bootstrap" the environment with accelerator-specific (non-CDK) dependencies.

The `DependenciesStack` may be found in `./source/packages/@aws-accelerator/accelerator/stacks/dependencies-stack.ts`.

## Resource availability by region or partition

The LZA is built to manage the deployment of AWS resources across all available partitions and regions. As new services and features are released, there is often a lack of feature parity across these regions or partitions. The LZA team has made the decision not to create guardrails blocking customers from deploying elective resources to regions or partitions where they are unavailable. This practice requires additional research during the initial implementation, as well as follow-up work to remove the guardrail when the feature becomes available.

When designing a feature not available in all regions/partitions, do not create checks or validations to block deployment or throw an error based on the environment. Customers are ultimately responsible for determining the services and features available in the AWS regions and partitions they deploy to. 

## Adding Validation

The LZA runs a set of validation functions against the provided configuration repository in order to alert customers of syntactical errors. These validations save customers significant time as this can reduce the time for the pipeline to fail in the event of a misconfiguration. This occurs during the `Build` stage of the pipeline, where the CodeBuild project runs the same `config-validator.ts` script referenced in [Configuration Validation](./scripts.md/#configuration-validator). This script orchestrates a collection of configuration-file-specific validation classes defined in the `./source/packages/@aws-accelerator/accelerator/config/validator` directory.

When developing a feature that modifies or creates new possible configurations, please ensure you create new validation functions in the appropriate validator class. Examples of common validations include:
- Validate account and organizational unit names referenced in `deploymentTargets` are valid
```ts
  private validateSsmDocumentDeploymentTargetOUs(
    values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const documentSet of values.centralSecurityServices.ssmAutomation.documentSets ?? []) {
      for (const ou of documentSet.shareTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for SSM documents does not exists in organization-config.yaml file.`);
        }
      }
    }
  }
```
- Validate referenced files exist
```ts
  private validateTaggingPolicyFile(configDir: string, values: OrganizationConfig, errors: string[]) {
    for (const taggingPolicy of values.taggingPolicies ?? []) {
      if (!fs.existsSync(path.join(configDir, taggingPolicy.policy))) {
        errors.push(`Invalid policy file ${taggingPolicy.policy} for tagging policy ${taggingPolicy.name} !!!`);
      }
    }
  }
```
- Validate AWS service-specific properties
```ts
  private validateCloudTrailSettings(values: GlobalConfig, errors: string[]) {
    if (
      values.logging.cloudtrail.organizationTrail &&
      values.logging.cloudtrail.organizationTrailSettings?.multiRegionTrail &&
      !values.logging.cloudtrail.organizationTrailSettings.globalServiceEvents
    ) {
      errors.push(
        `The organization CloudTrail setting multiRegionTrail is enabled, the globalServiceEvents must be enabled as well`,
      );
    }
    for (const accountTrail of values.logging.cloudtrail.accountTrails ?? []) {
      if (accountTrail.settings.multiRegionTrail && !accountTrail.settings.globalServiceEvents) {
        errors.push(
          `The account CloudTrail with the name ${accountTrail.name} setting multiRegionTrail is enabled, the globalServiceEvents must be enabled as well`,
        );
      }
    }
  }
```
- Validate resource names for uniqueness
```ts
  private validateStackNameForUniqueness(
    values: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>,
    errors: string[],
  ) {
    const stackNames = [...(values.customizations?.cloudFormationStacks ?? [])].map(item => item.name);
    const stackSetNames = [...(values.customizations?.cloudFormationStackSets ?? [])].map(item => item.name);

    if (new Set(stackNames).size !== stackNames.length) {
      errors.push(`Duplicate custom stack names defined [${stackNames}].`);
    }

    if (new Set(stackSetNames).size !== stackSetNames.length) {
      errors.push(`Duplicate custom stackset names defined [${stackSetNames}].`);
    }
  }
```

## Snapshot Testing

The LZA currently utilizes [snapshot testing](https://jestjs.io/docs/snapshot-testing) to identify and mitigate unintended consequences of new features. Snapshot testing occurs at the stack level, the config level, and the construct level. 

To update snapshot tests, run the following command from the `source` directory:
```
yarn update-snapshots
```
To execute all tests, change directory to `source` and run
```
yarn test
```

### Accelerator Test Updates

When developing a new feature, please enable or create the new resource by updating the [all-enabled](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/source/packages/%40aws-accelerator/accelerator/test/configs/all-enabled) and [snapshot-only](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/source/packages/%40aws-accelerator/accelerator/test/configs/snapshot-only)  configuration directory. After updating the configuration, run `yarn test -u` from the `accelerator` directory.
Currently snapshot-only directory files are used for snapshot testing and all-enabled directory files are used for functional test. Gradually snapshot-only directory configuration files will be migrated to all-enabled directory.

[all-enabled](https://github.com/awslabs/landing-zone-accelerator-on-aws/tree/main/source/packages/%40aws-accelerator/accelerator/test/configs/all-enabled) directory configuration files are validated through pre-commit hook. 
To manually validate all-enabled directory config files, change directory to `source` and run 
```
yarn validate-config packages/@aws-accelerator/accelerator/test/configs/all-enabled/
```

### Config Test Updates

If you create a new config type, please update the appropriate configuration test within `config/test`. After making this update, run `yarn test -u` from the `config` directory.

### Construct Test Updates

If you create a new construct, please create a new unit test for the construct within `constructs/test`. Similar to the folder structure within `constructs/lib`, these test files are separated by AWS service. After creating a new unit test, run `yarn test -u` from the `constructs` directory.