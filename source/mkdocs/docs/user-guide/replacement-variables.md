# Configuration Replacement Variables

The solution supports the definition of customer defined replacement variables in the [replacements-config.yaml](../typedocs/latest/modules/___packages__aws_accelerator_config_dist_config_lib_models_replacements_config.html) file.

!!! note "See also"
    - [Implementation Guide - Working with solution-specific variables](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/working-with-solution-specific-variables.html)

The solution supports statically defined variables in the file as well as dynamic lookups from the Parameter Store. This feature primarily meets two customer needs:

- Customers wishing to reuse a single generic Landing Zone Accelerator on AWS configuration across multiple Landing Zone Accelerator on AWS deployments
- Customers wishing to simplify their configuration files and decrease the number of manual configuration edits

!!! note
    Replacements functionality was made available starting with the v1.5.0 release.

## How to use

You can leverage this pattern by creating an additional, optional configuration file in the configuration repository named replacements-config.yaml.

```yaml
globalReplacements:
  - key: SnsEmail
    type: String
    value: example_email@example.com
```

You can reference the value from within the configuration files. For example, we might create a new Amazon SNS topic in the global-config.yaml file where the email address value uses the replacement previously defined:

```yaml
snsTopics:
  topics:
    - name: SampleTopic
      emailAddresses:
        - "{{SnsEmail}}"
```

### Parameter Store reference variables

Instead of providing the static value in the replacements-config.yaml file you also have the option to do a dynamic lookup from the Systems Manager Parameter Store.

```yaml
globalReplacements:
  - key: SnsEmail
    path: /accelerator/replacements/SnsEmailAddress
```

In the above example, we have a single replacement defined:

- The configuration files use the key in SnsEmail to indicate which value to replace.
- The path of `/accelerator/replacements/SnsEmailAddress` describes the Parameter Store path where the corresponding replacement value exists.

!!! Note
    Parameter Store parameters used for replacements must exist in the homeRegion of the management account.

You must explicitly create the Systems Manager parameter `/accelerator/replacements/SnsEmailAddress`. Create this Systems Manager parameter with an appropriate replacement value through Landing Zone Accelerator on AWS or by following this guide.

```bash
aws ssm put-parameter \
    --name "/accelerator/replacements/SnsEmailAddress" \
    --value "example_email@example.com" \
    --type String
```

After you create the Systems Manager parameter, you can reference the value from within the configuration files with the same syntax as static values.

### StringList variables

It is also possible to define variables of type `StringList`

For example:

```yaml
- key: AddressList
    type: StringList
    value:
      - address1@example.com
      - address2@example.com
```

To use a list variable, it is necessary to use the `[item1, item2]` notation for YAML lists.

For example, this is valid:

```yaml
topics:
  - name: SampleTopic
    emailAddresses: [{{AddressList}}]
```

Once the replacement is applied, the following content will be generated, which is valid YAML content.

```yaml
topics:
  - name: SampleTopic
    emailAddresses: [address1@example.com, address2@example.com]
```

The following configuration is NOT valid and will generate an error.

```yaml
topics:
  - name: SampleTopic
    emailAddresses:
      - {{AddressList}}
```

This can be used for any configuration items that expect a list of string values, including Regions and Organization Units in `deploymentTargets`. This cannot be used for lists of complex objects.

### Account number lookups

This feature also includes functionality to look up account IDs based on the account name without the use of Systems Manager parameters:

```yaml
parameters:
  - name: TrustedAccounts
    value: {{account Management}}
```

### Other considerations

The double-curly brace notation is reserved for usage in the LZA configuration files by LZA replacements and SSM dynamic references. Any instances of this syntax that do not follow the SSM dynamic reference syntax or exist in the replacements-config.yaml file will throw an error during configuration validation.

If you must use this syntax in your configuration files, you can skip static configuration validation by setting cdkOptions.skipStaticValidation to true in the global-config.yaml file.

When LZA loads the configuration files, it processes replacements before applying the YAML schema. To avoid schema validation warnings in your editor while working with the configuration files it is recommended to enclose the use of string variables in quotes. **Do not** enclose usage of `StringList` values in quotes.

e.g.

```yaml
snsTopics:
  topics:
    - name: SampleTopic
      emailAddresses:
        - "{{SnsEmail}}"
...
documents:
  - name: "{{ AcceleratorPrefix }}-SSM-ELB-Enable-Logging"
    template: ssm-documents/ssm-elb-enable-logging.yaml
```

!!! Note
    All YAML configuration files support replacements except accounts-config.yaml

### Previewing the results of replacements

To preview the resulting files with the processed replacements you can use the [Command Line Interface](../developer-guide/scripts.md). The following command will output a copy of your configuration files with the `-replaced` suffix with all replacement variables substituted with the values that will be used at runtime.

```bash
yarn config-replacement /path/to/aws-accelerator-config/
```

## Using Global Replacements in policy files

Global replacement variables defined in `replacements-config.yaml` can also be referenced from policy files using the `${ACCEL_LOOKUP::CUSTOM:VARIABLE_NAME}` syntax.

For example, given the following content in `replacements-config.yaml`:

```yaml
globalReplacements:
  - key: ALLOWED_REGIONS
    type: StringList
    value:
      - "us-east-1"
      - "us-east-2"
  - key: ALLOWED_ROLE
    type: String
    value: MyCustomRole
```

The following statement can be used in a SCP policy file referencing the variables.

```json
{
  "Effect": "Deny",
  "NotAction": [
    "ec2:*"
  ],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "aws:RequestedRegion": ${ACCEL_LOOKUP::CUSTOM:ALLOWED_REGIONS}
    },
    "ArnNotLike": {
      "aws:PrincipalARN": ["arn:${PARTITION}:iam::*:role/${ACCELERATOR_PREFIX}*", "arn:${PARTITION}:iam::*:role/${ACCEL_LOOKUP::CUSTOM:ALLOWED_ROLE}"]
    }
  }
}
```

This will deploy the following policy once replacements are processed:

```json
{
  "Effect": "Deny",
  "NotAction": ["ec2:*"],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": { "aws:RequestedRegion": ["us-east-1", "us-east-2"] },
    "ArnNotLike": {
      "aws:PrincipalARN": ["arn:aws:iam::*:role/AWSAccelerator*", "arn:aws:iam::*:role/MyCustomRole"]
    }
  }
}
```

!!! warning "Important"
    - String variables value will be rendered as is. You should enclose their usage in quotes.
    - StringList variables will render an array (i.e. `["us-east-1", "us-east-2"]`), their usage should not be enclosed by quotes or brackets.


!!! note "See also"
    See the [Policy replacements variables](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/working-with-solution-specific-variables.html#policy-replacement-variables) section in the Implementation Guide for more accelerator provided replacements variables that can be used in policy files.