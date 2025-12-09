import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { version, config } from '../../../../package.json';
import { ResourceNamePrefixes } from '@aws-accelerator/installer';
import { LzaLambdaRuntime } from '@aws-accelerator/utils/lib/lambda';
import { NagSuppressions } from 'cdk-nag';
import { Bucket, BucketEncryptionType } from '@aws-accelerator/constructs';

export interface InstallerContainerStackProps extends cdk.StackProps {
  /**
   * External Pipeline Account usage flag
   */
  readonly useExternalPipelineAccount: boolean;
  /**
   * Use existing S3 bucket for LZA source code
   */
  readonly useS3Source: boolean;
  /**
   * KMS key ARN associated with an encrypted S3 bucket containing LZA source code
   */
  readonly s3SourceKmsKeyArn?: string;
  /**
   * Management Cross account role name
   */
  readonly managementCrossAccountRoleName?: string;
  /**
   * Single account deployment enable flag
   */
  readonly enableSingleAccountMode: boolean;
  /**
   * Accelerator Permission boundary usage flag
   */
  readonly usePermissionBoundary: boolean;
  /**
   * Set node version
   */
  readonly setNodeVersion: boolean;
}

export class InstallerContainerStack extends cdk.Stack {
  private readonly ecrUri = new cdk.CfnParameter(this, 'EcrUri', {
    type: 'String',
    description:
      'The Amazon Elastic Container Registry (Amazon ECR) repository, where Landing Zone Accelerator on AWS code is present.',
  });
  private readonly managementAccountEmail = new cdk.CfnParameter(this, 'ManagementAccountEmail', {
    type: 'String',
    description:
      'The management (primary) account email - NOTE: This must match the address of the management account email as listed in AWS Organizations > AWS accounts.',
    allowedPattern: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+',
    constraintDescription: 'Must be a valid email address matching "[^\\s@]+@[^\\s@]+\\.[^\\s@]+"',
  });

  private readonly logArchiveAccountEmail = new cdk.CfnParameter(this, 'LogArchiveAccountEmail', {
    type: 'String',
    description: 'The log archive account email',
    allowedPattern: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+',
    constraintDescription: 'Must be a valid email address matching "[^\\s@]+@[^\\s@]+\\.[^\\s@]+"',
  });

  private readonly auditAccountEmail = new cdk.CfnParameter(this, 'AuditAccountEmail', {
    type: 'String',
    description: 'The security audit account (also referred to as the audit account)',
    allowedPattern: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+',
    constraintDescription: 'Must be a valid email address matching "[^\\s@]+@[^\\s@]+\\.[^\\s@]+"',
  });

  private readonly controlTowerEnabled = new cdk.CfnParameter(this, 'ControlTowerEnabled', {
    type: 'String',
    description:
      'Select yes if deploying to a Control Tower environment.  Select no if using just Organizations. If no, you must first set up mandatory accounts.',
    allowedValues: ['Yes', 'No'],
    default: 'Yes',
  });

  private readonly acceleratorPrefix = new cdk.CfnParameter(this, 'AcceleratorPrefix', {
    type: 'String',
    description:
      'The prefix value for accelerator deployed resources. Leave the default value if using solution defined resource name prefix, the solution will use AWSAccelerator as resource name prefix. Note: Updating this value after initial installation will cause stack failure. Non-default value can not start with keyword "aws" or "ssm". Trailing dash (-) in non-default value will be ignored.',
    default: 'AWSAccelerator',
    allowedPattern: '[A-Za-z0-9-]+',
    maxLength: 15,
  });

  /**
   * Node.js runtime version parameter for SSM Document aws:executeScript
   * Used to specify the Node.js runtime version for script execution in SSM automation documents
   * @private
   */
  private readonly nodeRuntimeVersion = new cdk.CfnParameter(this, 'NodeRuntimeVersion', {
    type: 'Number',
    description:
      'The Node.js runtime version for SSM Document aws:executeScript actions. This value is used to construct the runtime string (e.g., nodejs22).',
    default: 22,
    allowedValues: ['20', '22', '24'],
  });

  /**
   * Accelerator Qualifier parameter
   * @private
   */
  private readonly acceleratorQualifier: cdk.CfnParameter | undefined;

  /**
   * Management Account ID Parameter
   * @private
   */
  private readonly managementAccountId: cdk.CfnParameter | undefined;

  /**
   * Management Account Role Name Parameter
   * @private
   */
  private readonly managementAccountRoleName: cdk.CfnParameter | undefined;

  /**
   * Permission boundary policy name parameter
   * Used to enforce IAM permission boundaries on all roles created by the accelerator
   * Only created when usePermissionBoundary prop is true
   * @private
   */
  private readonly acceleratorPermissionBoundary: cdk.CfnParameter | undefined;

  /**
   * Use existing configuration bucket name flag
   * @private
   */
  private readonly useExistingConfig = new cdk.CfnParameter(this, 'UseExistingConfig', {
    type: 'String',
    allowedValues: ['Yes', 'No'],
    default: 'No',
    description:
      'Select Yes if deploying the solution with an existing configuration. Leave the default value if using the solution-deployed bucket. If the AcceleratorPrefix parameter is set to the default value, the solution will deploy a bucket named "aws-accelerator-config-$account-$region." Otherwise, the solution-deployed bucket will be named "AcceleratorPrefix-config-$account-$region." Note: Updating this value after initial installation may cause adverse affects.',
  });
  /**
   * Existing LZ Accelerator configuration bucket name
   * @private
   */
  private readonly existingConfigBucketName = new cdk.CfnParameter(this, 'ExistingConfigBucketName', {
    type: 'String',
    description: 'The name of an existing LZA configuration bucket hosting the accelerator configuration.',
    default: '',
  });

  /**
   * Existing LZ Accelerator configuration bucket key
   * @private
   */
  private readonly existingConfigBucketKey = new cdk.CfnParameter(this, 'ExistingConfigBucketKey', {
    type: 'String',
    description:
      'Specify the branch name of the existing LZA configuration bucket key to pull the accelerator configuration from.',
    default: '',
  });

  /**
   * Use existing VPC flag
   * Allows customers to use their own VPC instead of creating a new one for the LZA installer
   * @private
   */
  private readonly useExistingVpc = new cdk.CfnParameter(this, 'UseExistingVpc', {
    type: 'String',
    allowedValues: ['Yes', 'No'],
    default: 'No',
    description: 'Select Yes to use an existing VPC. If Yes, provide existing subnet and security group IDs.',
  });

  /**
   * Existing VPC ID parameter
   * Required when UseExistingVpc is set to Yes
   * Used to validate that subnet and security group belong to this VPC
   * @private
   */
  private readonly existingVpcId = new cdk.CfnParameter(this, 'ExistingVpcId', {
    type: 'AWS::EC2::VPC::Id',
    description: 'The ID of an existing VPC (required when UseExistingVpc is Yes)',
    default: '',
  });

  /**
   * Existing subnet ID parameter
   * Required when UseExistingVpc is set to Yes
   * Must be in the same VPC as the security group
   * @private
   */
  private readonly existingSubnetId = new cdk.CfnParameter(this, 'ExistingSubnetId', {
    type: 'AWS::EC2::Subnet::Id',
    description: 'The ID of an existing subnet (required when UseExistingVpc is Yes)',
    default: '',
  });

  /**
   * Existing security group ID parameter
   * Required when UseExistingVpc is set to Yes
   * Must be in the same VPC as the subnet
   * @private
   */
  private readonly existingSecurityGroupId = new cdk.CfnParameter(this, 'ExistingSecurityGroupId', {
    type: 'AWS::EC2::SecurityGroup::Id',
    description: 'The ID of an existing security group (required when UseExistingVpc is Yes)',
    default: '',
  });

  private readonly vpcCidr = new cdk.CfnParameter(this, 'VpcCidr', {
    type: 'String',
    description: 'The CIDR block for the VPC (used when UseExistingVpc is No)',
    default: '10.0.0.0/16',
    allowedPattern:
      '^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\\/(1[6-9]|2[0-8]))$',
  });

  constructor(scope: Construct, id: string, props?: InstallerContainerStackProps) {
    super(scope, id, props);
    const parameterGroups: { Label: { default: string }; Parameters: string[] }[] = [
      {
        Label: { default: 'Source Configuration' },
        Parameters: [this.ecrUri.logicalId],
      },
      {
        Label: { default: 'Mandatory Accounts Configuration' },
        Parameters: [
          this.managementAccountEmail.logicalId,
          this.logArchiveAccountEmail.logicalId,
          this.auditAccountEmail.logicalId,
        ],
      },
      {
        Label: { default: 'Environment Configuration' },
        Parameters: [
          this.controlTowerEnabled.logicalId,
          this.acceleratorPrefix.logicalId,
          this.nodeRuntimeVersion.logicalId,
        ],
      },
      {
        Label: { default: 'Config Bucket Configuration' },
        Parameters: [
          this.useExistingConfig.logicalId,
          this.existingConfigBucketName.logicalId,
          this.existingConfigBucketKey.logicalId,
        ],
      },
      {
        Label: { default: 'Network Configuration' },
        Parameters: [
          this.vpcCidr.logicalId,
          this.useExistingVpc.logicalId,
          this.existingVpcId.logicalId,
          this.existingSubnetId.logicalId,
          this.existingSecurityGroupId.logicalId,
        ],
      },
    ];
    const repositoryParameterLabels: { [p: string]: { default: string } } = {
      [this.ecrUri.logicalId]: { default: 'ECR URI' },
      [this.managementAccountEmail.logicalId]: { default: 'Management Account Email' },
      [this.logArchiveAccountEmail.logicalId]: { default: 'Log Archive Account Email' },
      [this.auditAccountEmail.logicalId]: { default: 'Audit Account Email' },
      [this.controlTowerEnabled.logicalId]: { default: 'Control Tower Environment' },
      [this.acceleratorPrefix.logicalId]: { default: 'Accelerator Resource name prefix' },
      [this.nodeRuntimeVersion.logicalId]: { default: 'Node.js Runtime Version (for SSM aws:executeScript)' },
      [this.useExistingVpc.logicalId]: { default: 'Use Existing VPC' },
      [this.existingVpcId.logicalId]: { default: 'Existing VPC ID' },
      [this.existingSubnetId.logicalId]: { default: 'Existing Subnet ID' },
      [this.existingSecurityGroupId.logicalId]: { default: 'Existing Security Group ID' },
      [this.vpcCidr.logicalId]: { default: 'VPC CIDR Block' },
    };

    let targetAcceleratorParameterLabels: { [p: string]: { default: string } } = {};

    /**
     * Permission Boundary Configuration
     *
     * When usePermissionBoundary is enabled, this creates a CloudFormation parameter
     * that allows users to specify an IAM permission boundary policy name.
     *
     * The permission boundary is applied to all IAM roles created by the accelerator,
     * ensuring they cannot exceed the permissions defined in the boundary policy.
     * This is useful for organizations with strict security requirements.
     *
     * The parameter value is passed to the ECS task as an environment variable
     * (ACCELERATOR_PERMISSION_BOUNDARY) for use during deployment.
     */
    if (props?.usePermissionBoundary) {
      // Create CloudFormation parameter for permission boundary policy name
      this.acceleratorPermissionBoundary = new cdk.CfnParameter(this, 'AcceleratorPermissionBoundary', {
        type: 'String',
        description: 'Permission boundary Policy Name which is valid only for management account',
      });

      // Add parameter to its own group in CloudFormation UI
      parameterGroups.push({
        Label: { default: 'Permission Boundary Configuration' },
        Parameters: [this.acceleratorPermissionBoundary.logicalId],
      });

      // Add user-friendly label for CloudFormation UI
      repositoryParameterLabels[this.acceleratorPermissionBoundary.logicalId] = {
        default: 'Permission Boundary Policy Name',
      };

      // Override logical ID to match expected parameter name in CDK aspect
      this.acceleratorPermissionBoundary.overrideLogicalId('PermissionBoundaryPolicyName');
    }

    if (props?.useExternalPipelineAccount) {
      this.acceleratorQualifier = new cdk.CfnParameter(this, 'AcceleratorQualifier', {
        type: 'String',
        description:
          'Names the resources in the external deployment account. This must be unique for each LZA pipeline created in a single external deployment account, for example "env2" or "app1." Do not use "aws-accelerator" or a similar value that could be confused with the prefix."',
        allowedPattern: '^[a-z]+[a-z0-9-]{1,61}[a-z0-9]+$',
        constraintDescription:
          'Qualifier must include lowercase letters and numbers only and cannot be aws-accelerator',
      });

      this.managementAccountId = new cdk.CfnParameter(this, 'ManagementAccountId', {
        type: 'String',
        description: 'Target management account id',
      });

      this.managementAccountRoleName = new cdk.CfnParameter(this, 'ManagementAccountRoleName', {
        type: 'String',
        description: 'Target management account role name',
      });

      parameterGroups.push({
        Label: { default: 'Target Environment Configuration' },
        Parameters: [
          this.acceleratorQualifier.logicalId,
          this.managementAccountId.logicalId,
          this.managementAccountRoleName.logicalId,
        ],
      });

      targetAcceleratorParameterLabels = {
        [this.acceleratorQualifier.logicalId]: { default: 'Accelerator Qualifier' },
        [this.managementAccountId.logicalId]: { default: 'Management Account ID' },
        [this.managementAccountRoleName.logicalId]: { default: 'Management Account Role Name' },
      };
    }
    /**
     * `nodeVersion` configures the Node.js version for the accelerator.
     *
     * This code block determines and sets the Node.js version to be used throughout the accelerator solution.
     * It updates relevant CloudFormation parameters and environment variables based on the configuration.
     * The resulting `nodeVersion` will be used in the rest of the application for lambda function and codebuild nodejs.
     *
     */
    const nodeVersion = config.node.version.default.toString();
    const lambdaRuntime = LzaLambdaRuntime.getLambdaRuntime(nodeVersion);
    const resourceNamePrefixes = new ResourceNamePrefixes(this, 'ResourceNamePrefixes', {
      acceleratorPrefix: this.acceleratorPrefix.valueAsString,
      acceleratorQualifier: this.acceleratorQualifier?.valueAsString,
      lambdaRuntime,
    });

    // cfn-nag suppression
    const resourceNameFunctionResource = resourceNamePrefixes.node.findChild('ResourceNamePrefixesFunction').node
      .defaultChild as cdk.CfnResource;
    this.addLambdaNagMetadata(resourceNameFunctionResource);

    const oneWordPrefix = resourceNamePrefixes.oneWordPrefix.endsWith('-')
      ? resourceNamePrefixes.oneWordPrefix.slice(0, -1)
      : resourceNamePrefixes.oneWordPrefix;

    const lowerCasePrefix = resourceNamePrefixes.lowerCasePrefix.endsWith('-')
      ? resourceNamePrefixes.lowerCasePrefix.slice(0, -1)
      : resourceNamePrefixes.lowerCasePrefix;

    const acceleratorPrefix = resourceNamePrefixes.acceleratorPrefix.endsWith('-')
      ? resourceNamePrefixes.acceleratorPrefix.slice(0, -1)
      : resourceNamePrefixes.acceleratorPrefix;
    const stackIdSsmParameterName = `/${oneWordPrefix}/${cdk.Stack.of(this).stackName}/stack-id`;
    const acceleratorVersionSsmParameterName = `/${oneWordPrefix}/${cdk.Stack.of(this).stackName}/version`;
    const installerKeyAliasName = `alias/${oneWordPrefix}/installer/kms/key`;
    const acceleratorManagementKmsArnSsmParameterName = `/${oneWordPrefix}/installer/kms/key-arn`;
    const installerAccessLogsBucketName = `${lowerCasePrefix}-s3-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`;
    const installerAccessLogsBucketNameSsmParameterName = `/${oneWordPrefix}/installer-access-logs-bucket-name`;
    const configBucketName = `${lowerCasePrefix}-config-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`;

    const acceleratorPrincipalArn = `arn:${cdk.Stack.of(this).partition}:iam::${
      cdk.Stack.of(this).account
    }:role/${acceleratorPrefix}-*`;

    // Add assertions for customers using a pre-existing config repo
    const requiredParametersForExistingRepo = new cdk.CfnRule(this, 'RequiredParametersForExistingRepo', {
      ruleCondition: cdk.Fn.conditionEquals('Yes', this.useExistingConfig.valueAsString),
    });

    requiredParametersForExistingRepo.addAssertion(
      cdk.Fn.conditionNot(cdk.Fn.conditionEquals('', this.existingConfigBucketKey.valueAsString)),
      'existingConfigBucketKey parameter must be provided when useExistingConfig is set to Yes',
    );

    requiredParametersForExistingRepo.addAssertion(
      cdk.Fn.conditionNot(cdk.Fn.conditionEquals('', this.existingConfigBucketName.valueAsString)),
      'existingConfigBucketName parameter must be provided when useExistingRepository is set to Yes',
    );

    /**
     * CloudFormation rules to validate required parameters for existing VPC
     * Ensures that when UseExistingVpc is set to Yes, VPC ID, subnet ID, and security group ID are provided
     */
    const requiredParametersForExistingVpc = new cdk.CfnRule(this, 'RequiredParametersForExistingVpc', {
      ruleCondition: cdk.Fn.conditionEquals('Yes', this.useExistingVpc.valueAsString),
    });

    requiredParametersForExistingVpc.addAssertion(
      cdk.Fn.conditionNot(cdk.Fn.conditionEquals('', this.existingVpcId.valueAsString)),
      'ExistingVpcId parameter must be provided when UseExistingVpc is set to Yes',
    );

    requiredParametersForExistingVpc.addAssertion(
      cdk.Fn.conditionNot(cdk.Fn.conditionEquals('', this.existingSubnetId.valueAsString)),
      'ExistingSubnetId parameter must be provided when UseExistingVpc is set to Yes',
    );

    requiredParametersForExistingVpc.addAssertion(
      cdk.Fn.conditionNot(cdk.Fn.conditionEquals('', this.existingSecurityGroupId.valueAsString)),
      'ExistingSecurityGroupId parameter must be provided when UseExistingVpc is set to Yes',
    );

    /**
     * CloudFormation rules to validate that subnet and security group are in the specified VPC
     * Uses Fn::ValueOfAll to extract VpcId from the subnet and security group parameters
     * and compares them to the provided VPC ID
     */
    const subnetInVpcRule = new cdk.CfnRule(this, 'SubnetInVpcRule', {
      ruleCondition: cdk.Fn.conditionEquals('Yes', this.useExistingVpc.valueAsString),
    });

    subnetInVpcRule.addAssertion(
      cdk.Fn.conditionEachMemberEquals(
        cdk.Fn.valueOfAll('AWS::EC2::Subnet::Id', 'VpcId'),
        this.existingVpcId.valueAsString,
      ),
      'Subnet must be in the specified VPC',
    );

    const securityGroupInVpcRule = new cdk.CfnRule(this, 'SecurityGroupInVpcRule', {
      ruleCondition: cdk.Fn.conditionEquals('Yes', this.useExistingVpc.valueAsString),
    });

    securityGroupInVpcRule.addAssertion(
      cdk.Fn.conditionEachMemberEquals(
        cdk.Fn.valueOfAll('AWS::EC2::SecurityGroup::Id', 'VpcId'),
        this.existingVpcId.valueAsString,
      ),
      'Security Group must be in the specified VPC',
    );

    // Add assertions to ensure account emails are unique
    const uniqueAccountEmails = new cdk.CfnRule(this, 'UniqueAccountEmails', {});

    uniqueAccountEmails.addAssertion(
      cdk.Fn.conditionNot(
        cdk.Fn.conditionEquals(this.managementAccountEmail.valueAsString, this.logArchiveAccountEmail.valueAsString),
      ),
      'Management Account Email and Log Archive Account Email must be different',
    );

    uniqueAccountEmails.addAssertion(
      cdk.Fn.conditionNot(
        cdk.Fn.conditionEquals(this.managementAccountEmail.valueAsString, this.auditAccountEmail.valueAsString),
      ),
      'Management Account Email and Audit Account Email must be different',
    );

    uniqueAccountEmails.addAssertion(
      cdk.Fn.conditionNot(
        cdk.Fn.conditionEquals(this.logArchiveAccountEmail.valueAsString, this.auditAccountEmail.valueAsString),
      ),
      'Log Archive Account Email and Audit Account Email must be different',
    );
    // Parameter Metadata
    this.templateOptions.metadata = {
      'AWS::CloudFormation::Interface': {
        ParameterGroups: parameterGroups,
        ParameterLabels: { ...repositoryParameterLabels, ...targetAcceleratorParameterLabels },
      },
    };
    new cdk.aws_ssm.StringParameter(this, 'SsmParamStackId', {
      parameterName: stackIdSsmParameterName,
      stringValue: cdk.Stack.of(this).stackId,
      simpleName: false,
    });

    new cdk.aws_ssm.StringParameter(this, 'SsmParamAcceleratorVersion', {
      parameterName: acceleratorVersionSsmParameterName,
      stringValue: version,
      simpleName: false,
    });

    // Create Accelerator Installer KMS Key
    const installerKey = new cdk.aws_kms.Key(this, 'InstallerKey', {
      alias: installerKeyAliasName,
      description: 'KMS key for encrypting LZA installer S3 configuration bucket in the management account',
      enableKeyRotation: true,
      policy: undefined,
    });

    //
    // Add conditional policies to Key policy
    const cfnKey = installerKey.node.defaultChild as cdk.aws_kms.CfnKey;
    cfnKey.keyPolicy = {
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            AWS: `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:root`,
          },
          Action: 'kms:*',
          Resource: '*',
        },
        {
          Sid: 'Allow Accelerator Role to use the encryption key',
          Effect: 'Allow',
          Principal: {
            AWS: '*',
          },
          Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          Resource: '*',
          Condition: {
            ArnLike: {
              'aws:PrincipalARN': acceleratorPrincipalArn,
            },
          },
        },
        {
          Sid: 'Allow SNS service to use the encryption key',
          Effect: 'Allow',
          Principal: {
            Service: 'sns.amazonaws.com',
          },
          Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          Resource: '*',
        },
        {
          Sid: 'Allow Cloudwatch Logs service to use the encryption key',
          Effect: 'Allow',
          Principal: {
            Service: `logs.${cdk.Stack.of(this).region}.amazonaws.com`,
          },
          Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          Resource: '*',
          Condition: {
            ArnLike: {
              'kms:EncryptionContext:aws:logs:arn': `arn:${cdk.Stack.of(this).partition}:logs:${
                cdk.Stack.of(this).region
              }:${cdk.Stack.of(this).account}:log-group:*`,
            },
          },
        },
      ],
    };

    // cfn_nag suppressions
    const cfnInstallerKey = installerKey.node.defaultChild as cdk.aws_kms.CfnKey;
    cfnInstallerKey.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'F76',
            reason: 'KMS key using * principal with added arn condition',
          },
        ],
      },
    };

    // Create SSM parameter for installer key arn for future use
    new cdk.aws_ssm.StringParameter(this, 'AcceleratorManagementKmsArnParameter', {
      parameterName: acceleratorManagementKmsArnSsmParameterName,
      stringValue: installerKey.keyArn,
      simpleName: false,
    });

    const installerServerAccessLogsBucket = new Bucket(this, 'InstallerAccessLogsBucket', {
      encryptionType: BucketEncryptionType.SSE_S3, // Server access logging does not support SSE-KMS
      s3BucketName: installerAccessLogsBucketName,
    });

    // cfn_nag: Suppress warning related to high S3 Bucket should have access logging configured
    const cfnInstallerServerAccessLogsBucket = installerServerAccessLogsBucket.getS3Bucket().node
      .defaultChild as cdk.aws_s3.CfnBucket;
    cfnInstallerServerAccessLogsBucket.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W35',
            reason: 'This is an access logging bucket.',
          },
        ],
      },
    };

    // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/InstallerAccessLogsBucket/Resource/Resource`,
      [
        {
          id: 'AwsSolutions-S1',
          reason: 'AccessLogsBucket has server access logs disabled till the task for access logging completed.',
        },
      ],
    );

    new cdk.aws_ssm.StringParameter(this, 'InstallerAccessLogsBucketName', {
      parameterName: installerAccessLogsBucketNameSsmParameterName,
      stringValue: installerServerAccessLogsBucket.getS3Bucket().bucketName,
      simpleName: false,
    });

    // create config bucket only if useExistingConfig is set to No
    const createConfigBucketCondition = new cdk.CfnCondition(this, 'CreateConfigCondition', {
      expression: cdk.Fn.conditionEquals('No', this.useExistingConfig.valueAsString),
    });

    const configBucket = new cdk.aws_s3.CfnBucket(this, 'ConfigBucket', {
      bucketName: configBucketName,
      versioningConfiguration: {
        status: 'Enabled',
      },
      bucketEncryption: {
        serverSideEncryptionConfiguration: [
          {
            serverSideEncryptionByDefault: {
              sseAlgorithm: 'aws:kms',
              kmsMasterKeyId: installerKey.keyArn,
            },
          },
        ],
      },
      loggingConfiguration: {
        destinationBucketName: installerServerAccessLogsBucket.getS3Bucket().bucketName,
        logFilePrefix: `${configBucketName}/`,
      },
      publicAccessBlockConfiguration: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
      ownershipControls: {
        rules: [
          {
            objectOwnership: 'BucketOwnerPreferred',
          },
        ],
      },
      lifecycleConfiguration: {
        rules: [
          {
            id: `LifecycleRule${configBucketName}`,
            status: 'Enabled',
            expirationInDays: 1825,
            expiredObjectDeleteMarker: false,
            noncurrentVersionExpiration: {
              noncurrentDays: 1825,
            },
            noncurrentVersionTransitions: [
              {
                storageClass: 'DEEP_ARCHIVE',
                transitionInDays: 366,
              },
            ],
            transitions: [
              {
                storageClass: 'DEEP_ARCHIVE',
                transitionInDays: 365,
              },
            ],
            abortIncompleteMultipartUpload: {
              daysAfterInitiation: 1,
            },
          },
        ],
      },
    });
    configBucket.cfnOptions.condition = createConfigBucketCondition;
    configBucket.cfnOptions.deletionPolicy = cdk.CfnDeletionPolicy.RETAIN;
    configBucket.cfnOptions.updateReplacePolicy = cdk.CfnDeletionPolicy.RETAIN;

    // Add HTTPS-only bucket policy
    const configBucketPolicy = new cdk.aws_s3.CfnBucketPolicy(this, 'ConfigBucketPolicy', {
      bucket: configBucket.ref,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'deny-insecure-connections',
            Effect: 'Deny',
            Principal: { AWS: '*' },
            Action: 's3:*',
            Resource: [
              `arn:${cdk.Stack.of(this).partition}:s3:::${configBucketName}`,
              `arn:${cdk.Stack.of(this).partition}:s3:::${configBucketName}/*`,
            ],
            Condition: {
              Bool: {
                'aws:SecureTransport': 'false',
              },
            },
          },
        ],
      },
    });
    configBucketPolicy.cfnOptions.condition = createConfigBucketCondition;

    /**
     * VPC Creation Condition
     *
     * Controls whether to create a new VPC or use an existing one.
     * When UseExistingVpc = No, all VPC-related resources (VPC, subnets, NAT gateways, etc.) are created.
     * When UseExistingVpc = Yes, no VPC resources are created and existing resources are used instead.
     */
    const createVpcCondition = new cdk.CfnCondition(this, 'CreateVpcCondition', {
      expression: cdk.Fn.conditionEquals('No', this.useExistingVpc.valueAsString),
    });

    /**
     * VPC Resource
     * Only created when createVpcCondition is true (UseExistingVpc = No)
     * All subsequent VPC-related resources also have this condition applied
     */
    const vpc = new cdk.aws_ec2.CfnVPC(this, 'Vpc', {
      cidrBlock: this.vpcCidr.valueAsString,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      instanceTenancy: 'default',
    });
    vpc.cfnOptions.condition = createVpcCondition;

    /**
     * Subnet Creation
     * Creates public and private subnets across 2 availability zones
     * All subnets are conditionally created based on createVpcCondition
     */
    const privateSubnets: cdk.aws_ec2.CfnSubnet[] = [];
    const publicSubnets: cdk.aws_ec2.CfnSubnet[] = [];

    for (let i = 0; i < 2; i++) {
      // Public subnet for NAT gateway placement
      const publicSubnet = new cdk.aws_ec2.CfnSubnet(this, `PublicSubnet${i}`, {
        vpcId: vpc.ref,
        cidrBlock: `10.0.${i}.0/24`,
        availabilityZone: cdk.Fn.select(i, cdk.Fn.getAzs()),
      });
      publicSubnet.cfnOptions.condition = createVpcCondition;
      publicSubnets.push(publicSubnet);

      // Private subnet for ECS Fargate task placement
      const privateSubnet = new cdk.aws_ec2.CfnSubnet(this, `PrivateSubnet${i}`, {
        vpcId: vpc.ref,
        cidrBlock: `10.0.${i + 10}.0/24`,
        availabilityZone: cdk.Fn.select(i, cdk.Fn.getAzs()),
      });
      privateSubnet.cfnOptions.condition = createVpcCondition;
      privateSubnets.push(privateSubnet);

      // Elastic IP for NAT Gateway
      const eip = new cdk.aws_ec2.CfnEIP(this, `NatEip${i}`, {
        domain: 'vpc',
      });
      eip.cfnOptions.condition = createVpcCondition;

      // NAT Gateway for private subnet internet access
      const natGateway = new cdk.aws_ec2.CfnNatGateway(this, `NatGateway${i}`, {
        subnetId: publicSubnet.ref,
        allocationId: eip.attrAllocationId,
      });
      natGateway.cfnOptions.condition = createVpcCondition;

      // Private route table with route to NAT Gateway
      const privateRouteTable = new cdk.aws_ec2.CfnRouteTable(this, `PrivateRouteTable${i}`, {
        vpcId: vpc.ref,
      });
      privateRouteTable.cfnOptions.condition = createVpcCondition;

      // Route all internet traffic through NAT Gateway
      const privateRoute = new cdk.aws_ec2.CfnRoute(this, `PrivateRoute${i}`, {
        routeTableId: privateRouteTable.ref,
        destinationCidrBlock: '0.0.0.0/0',
        natGatewayId: natGateway.ref,
      });
      privateRoute.cfnOptions.condition = createVpcCondition;

      // Associate private subnet with private route table
      const privateSubnetAssoc = new cdk.aws_ec2.CfnSubnetRouteTableAssociation(
        this,
        `PrivateSubnetRouteTableAssociation${i}`,
        {
          subnetId: privateSubnet.ref,
          routeTableId: privateRouteTable.ref,
        },
      );
      privateSubnetAssoc.cfnOptions.condition = createVpcCondition;
    }

    // Use first private subnet for ECS task placement (when creating new VPC)
    const privateSubnet = privateSubnets[0];

    // Internet Gateway for public subnet internet access
    const igw = new cdk.aws_ec2.CfnInternetGateway(this, 'InternetGateway', {});
    igw.cfnOptions.condition = createVpcCondition;

    const vpcGatewayAttachment = new cdk.aws_ec2.CfnVPCGatewayAttachment(this, 'VpcGatewayAttachment', {
      vpcId: vpc.ref,
      internetGatewayId: igw.ref,
    });
    vpcGatewayAttachment.cfnOptions.condition = createVpcCondition;

    // Create public route table
    const publicRouteTable = new cdk.aws_ec2.CfnRouteTable(this, 'PublicRouteTable', {
      vpcId: vpc.ref,
    });
    publicRouteTable.cfnOptions.condition = createVpcCondition;

    const publicRoute = new cdk.aws_ec2.CfnRoute(this, 'PublicRoute', {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: igw.ref,
    });
    publicRoute.cfnOptions.condition = createVpcCondition;

    // Associate public subnets with public route table
    for (let i = 0; i < 2; i++) {
      const publicSubnetAssoc = new cdk.aws_ec2.CfnSubnetRouteTableAssociation(
        this,
        `PublicSubnetRouteTableAssociation${i}`,
        {
          subnetId: publicSubnets[i].ref,
          routeTableId: publicRouteTable.ref,
        },
      );
      publicSubnetAssoc.cfnOptions.condition = createVpcCondition;
    }

    /**
     * Security Group for ECS Tasks
     * Only created when using a new VPC (createVpcCondition = true)
     * When using existing VPC, customer provides their own security group
     */
    const securityGroup = new cdk.aws_ec2.CfnSecurityGroup(this, 'SecurityGroup', {
      vpcId: vpc.ref,
      groupDescription: 'Security group for VPC',
    });
    securityGroup.cfnOptions.condition = createVpcCondition;

    /**
     * VPC Flow Logs
     * Captures network traffic information for the created VPC
     * Only created when using a new VPC (createVpcCondition = true)
     */
    const vpcFlowLogGroup = new cdk.aws_logs.CfnLogGroup(this, 'VpcFlowLogGroup', {
      logGroupName: `/aws/vpc/flowlogs/${lowerCasePrefix}`,
      retentionInDays: 365,
    });
    vpcFlowLogGroup.cfnOptions.condition = createVpcCondition;

    // Create VPC Flow Log Role
    const vpcFlowLogRole = new cdk.aws_iam.CfnRole(this, 'VpcFlowLogRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'vpc-flow-logs.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      policies: [
        {
          policyName: 'CloudWatchLogPolicy',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                  'logs:DescribeLogGroups',
                  'logs:DescribeLogStreams',
                ],
                Resource: vpcFlowLogGroup.attrArn,
              },
            ],
          },
        },
      ],
    });
    vpcFlowLogRole.cfnOptions.condition = createVpcCondition;

    // Create VPC Flow Log
    const vpcFlowLog = new cdk.aws_ec2.CfnFlowLog(this, 'VpcFlowLog', {
      resourceType: 'VPC',
      resourceId: vpc.ref,
      trafficType: 'ALL',
      logDestinationType: 'cloud-watch-logs',
      logGroupName: vpcFlowLogGroup.ref,
      deliverLogsPermissionArn: vpcFlowLogRole.attrArn,
    });
    vpcFlowLog.cfnOptions.condition = createVpcCondition;

    // Create ECS Cluster
    const ecsCluster = new cdk.aws_ecs.CfnCluster(this, 'EcsCluster', {
      clusterName: `${lowerCasePrefix}-ecs-cluster`,
    });

    // AwsSolutions-ECS4: The ECS Cluster has CloudWatch Container Insights disabled.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/EcsCluster`, [
      {
        id: 'AwsSolutions-ECS4',
        reason: 'The ECS Cluster has CloudWatch Container Insights are not present in all partitions.',
      },
    ]);
    // AwsSolutions-ECS7: The ECS Task Definition does not have awslogs logging enabled at the minimum.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/EcsCluster`, [
      {
        id: 'AwsSolutions-ECS7',
        reason: 'The ECS task definition used has logging enabled to CloudWatch logs.',
      },
    ]);

    // Create ECS Task Role
    const taskRole = new cdk.aws_iam.CfnRole(this, 'EcsTaskRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'ecs-tasks.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      managedPolicyArns: [
        `arn:${cdk.Stack.of(this).partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy`,
      ],
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/EcsTaskRole`, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'The ECS task minimum permissions needed to run a task.',
      },
    ]);

    // Create ECS Execution Role
    const executionRole = new cdk.aws_iam.CfnRole(this, 'EcsExecutionRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'ecs-tasks.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      managedPolicyArns: [`arn:${cdk.Stack.of(this).partition}:iam::aws:policy/AdministratorAccess`],
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/EcsExecutionRole`, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'The ECS task needs admin access to orchestrate the engine.',
      },
    ]);

    // Create CloudWatch Log Group
    const logGroup = new cdk.aws_logs.CfnLogGroup(this, 'LogGroup', {
      logGroupName: `/ecs/${lowerCasePrefix}-lza-deployment`,
      retentionInDays: 365,
    });

    // Create ECS Task Definition
    const taskDefinition = new cdk.aws_ecs.CfnTaskDefinition(this, 'TaskDefinition', {
      family: `${lowerCasePrefix}-lza-deployment-task`,
      cpu: '8192',
      memory: '32768',
      networkMode: 'awsvpc',
      executionRoleArn: executionRole.attrArn,
      taskRoleArn: taskRole.attrArn,
      requiresCompatibilities: ['EC2', 'FARGATE'],
      containerDefinitions: [
        {
          name: 'lza-deployment-container',
          image: this.ecrUri.valueAsString,
          entryPoint: ['sh', '-c'],
          command: [
            `/landing-zone-accelerator-on-aws/scripts/run-pipeline.sh deploy aws-accelerator-config-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
          ],
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-region': cdk.Aws.REGION,
              'awslogs-group': logGroup.ref,
              'awslogs-stream-prefix': 'ecs',
            },
          },
          environment: [
            { name: 'ENABLE_DIAGNOSTICS_PACK', value: 'No' },
            { name: 'SkipPipelinePrerequisites', value: 'true' },
            { name: 'SkipAcceleratorPrerequisites', value: 'true' },
            ...(props?.useExternalPipelineAccount
              ? [
                  { name: 'MANAGEMENT_ACCOUNT_ID', value: this.managementAccountId!.valueAsString },
                  { name: 'MANAGEMENT_ACCOUNT_ROLE_NAME', value: this.managementAccountRoleName!.valueAsString },
                  { name: 'ACCELERATOR_QUALIFIER', value: this.acceleratorQualifier!.valueAsString },
                ]
              : []),
            ...(props?.enableSingleAccountMode
              ? [{ name: 'ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE', value: 'true' }]
              : []),
            // Pass permission boundary policy name to ECS task for IAM role creation
            ...(props?.usePermissionBoundary
              ? [{ name: 'ACCELERATOR_PERMISSION_BOUNDARY', value: this.acceleratorPermissionBoundary!.valueAsString }]
              : []),
          ],
        },
      ],
    });

    //AwsSolutions-ECS2: The ECS Task Definition includes a container definition that directly specifies environment variables.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/TaskDefinition`, [
      {
        id: 'AwsSolutions-ECS2',
        reason:
          'Environment variables are needed to turn off features made for services relying on CodePipeline and CodeBuild',
      },
    ]);

    // Create SSM Automation Role
    const ssmAutomationRole = new cdk.aws_iam.CfnRole(this, 'SsmAutomationRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'ssm.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      policies: [
        {
          policyName: 'EcsRunTaskPolicy',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: ['ecs:RunTask', 'ecs:DescribeTasks'],
                Resource: '*',
              },
              {
                Effect: 'Allow',
                Action: ['iam:PassRole'],
                Resource: [executionRole.attrArn, taskRole.attrArn],
              },
            ],
          },
        },
      ],
    });
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/SsmAutomationRole`, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Wild card permissions are needed on describe and run task calls.',
      },
    ]);

    // Create SSM Document
    new cdk.aws_ssm.CfnDocument(this, 'DeploySolutionDocument', {
      documentType: 'Automation',
      name: `${acceleratorPrefix}-RunEngine`,
      updateMethod: 'NewVersion',
      content: {
        schemaVersion: '0.3',
        description:
          'Automation document to deploy Landing Zone Accelerator on AWS (LZA) solution by running ECS Fargate tasks in a private subnet',
        assumeRole: '{{AutomationAssumeRole}}',
        parameters: {
          AutomationAssumeRole: {
            type: 'String',
            description: 'The ARN of the IAM role that allows Systems Manager Automation to perform actions',
            default: ssmAutomationRole.attrArn,
          },
          TaskDefinition: {
            type: 'String',
            description: 'The family and revision or full ARN of the task definition to run',
            default: taskDefinition.ref,
          },
          Cluster: {
            type: 'String',
            description: 'The short name or full ARN of the cluster to run your task on',
            default: ecsCluster.ref,
          },
          SubnetId: {
            type: 'String',
            description: 'The subnet where the ECS task will be placed',
            // Use created subnet if creating new VPC, otherwise use customer-provided subnet
            default: cdk.Fn.conditionIf(
              createVpcCondition.logicalId,
              privateSubnet.ref,
              this.existingSubnetId.valueAsString,
            ).toString(),
          },
          SecurityGroupId: {
            type: 'String',
            description: 'The security group used by the ECS task',
            // Use created security group if creating new VPC, otherwise use customer-provided security group
            default: cdk.Fn.conditionIf(
              createVpcCondition.logicalId,
              securityGroup.ref,
              this.existingSecurityGroupId.valueAsString,
            ).toString(),
          },
        },
        outputs: [
          'RunTask.TaskArn',
          'RunTask.ClusterName',
          'RunTask.LogGroupName',
          'RunTask.LogStreamName',
          'WaitForTaskCompletion.TaskStatus',
        ],
        mainSteps: [
          {
            name: 'RunTask',
            action: 'aws:executeScript',
            description: 'Starts a new ECS task and returns task details with CloudWatch log URL',
            timeoutSeconds: 600,
            inputs: {
              Runtime: `nodejs${this.nodeRuntimeVersion.valueAsString}`,
              Handler: 'handler',
              InputPayload: {
                TaskDefinition: '{{TaskDefinition}}',
                Cluster: '{{Cluster}}',
                SubnetId: '{{SubnetId}}',
                SecurityGroupId: '{{SecurityGroupId}}',
                LogGroupName: logGroup.ref,
                Region: cdk.Aws.REGION,
              },
              Script: `const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');

function extractValue(eventValue) {
  if (!eventValue) {
    return null;
  }
  if (typeof eventValue === 'string') {
    return eventValue.trim();
  }
  return eventValue;
}

async function handler(event, context) {
  const client = new ECSClient({ region: event.Region });
  
  const command = new RunTaskCommand({
    taskDefinition: extractValue(event.TaskDefinition),
    cluster: extractValue(event.Cluster),
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: [extractValue(event.SubnetId)],
        securityGroups: [extractValue(event.SecurityGroupId)],
        assignPublicIp: 'DISABLED'
      }
    }
  });
  
  const response = await client.send(command);
  
  const taskArn = response.tasks[0].taskArn;
  const taskId = taskArn.split('/').pop();
  const logGroup = extractValue(event.LogGroupName);
  const logStream = \`ecs/lza-deployment-container/\${taskId}\`;
  
  const results = {
    TaskArn: taskArn,
    ClusterName: extractValue(event.Cluster),
    LogGroupName: logGroup,
    LogStreamName: logStream,
    RunTaskResponse: JSON.stringify(response, null, 4)
  };
  
  return results;
}

exports.handler = handler;`,
            },
            outputs: [
              { Name: 'ClusterName', Selector: '$.Payload.ClusterName', Type: 'String' },
              { Name: 'TaskArn', Selector: '$.Payload.TaskArn', Type: 'String' },
              { Name: 'LogGroupName', Selector: '$.Payload.LogGroupName', Type: 'String' },
              { Name: 'LogStreamName', Selector: '$.Payload.LogStreamName', Type: 'String' },
            ],
          },
          {
            name: 'WaitForTaskCompletion',
            action: 'aws:waitForAwsResourceProperty',
            description: 'Wait for ECS task to complete',
            timeoutSeconds: 43200,
            inputs: {
              Service: 'ecs',
              Api: 'DescribeTasks',
              cluster: '{{RunTask.ClusterName}}',
              tasks: ['{{RunTask.TaskArn}}'],
              PropertySelector: '$.tasks[0].lastStatus',
              DesiredValues: ['STOPPED'],
            },
            outputs: [{ Name: 'TaskStatus', Selector: '$.tasks[0].lastStatus', Type: 'String' }],
          },
        ],
      },
    });
  }
  /**
   * Adds required metadata to Lambda functions for AWS Solutions security scans
   * @param resource
   */
  private addLambdaNagMetadata(resource: cdk.CfnResource): void {
    resource.addMetadata('cfn_nag', {
      rules_to_suppress: [
        {
          id: 'W58',
          reason: `CloudWatch Logs are enabled in AWSLambdaBasicExecutionRole`,
        },
        {
          id: 'W89',
          reason: `This function supports infrastructure deployment and is not deployed inside a VPC.`,
        },
        {
          id: 'W92',
          reason: `This function supports infrastructure deployment and does not require setting ReservedConcurrentExecutions.`,
        },
      ],
    });

    // AwsSolutions-L1: The non-container Lambda function is not configured to use the latest runtime version.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/${resource.node.id}`, [
      {
        id: 'AwsSolutions-L1',
        reason: 'Lambda runtime version is managed by LzaLambdaRuntime configuration.',
      },
    ]);
  }
}
