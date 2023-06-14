/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

import { Bucket, BucketEncryptionType } from '@aws-accelerator/constructs';

import { version } from '../../../../package.json';
import { SolutionHelper } from './solutions-helper';
import { ResourceNamePrefixes } from './resource-name-prefixes';
import { Validate } from './validate';

export enum RepositorySources {
  GITHUB = 'github',
  CODECOMMIT = 'codecommit',
}

export interface InstallerStackProps extends cdk.StackProps {
  /**
   * External Pipeline Account usage flag
   */
  readonly useExternalPipelineAccount: boolean;
  /**
   * Enable tester flag
   */
  readonly enableTester: boolean;

  /**
   * Management Cross account role name
   */
  readonly managementCrossAccountRoleName?: string;
  /**
   * Single account deployment enable flag
   */
  readonly enableSingleAccountMode: boolean;
}

export class InstallerStack extends cdk.Stack {
  private readonly repositorySource = new cdk.CfnParameter(this, 'RepositorySource', {
    type: 'String',
    description: 'Specify the git host',
    allowedValues: [RepositorySources.GITHUB, RepositorySources.CODECOMMIT],
    default: RepositorySources.GITHUB,
  });

  private readonly repositoryOwner = new cdk.CfnParameter(this, 'RepositoryOwner', {
    type: 'String',
    description: 'The owner of the repository containing the accelerator code. (GitHub Only)',
    default: 'awslabs',
  });

  private readonly repositoryName = new cdk.CfnParameter(this, 'RepositoryName', {
    type: 'String',
    description: 'The name of the git repository hosting the accelerator code',
    default: 'landing-zone-accelerator-on-aws',
  });

  private readonly repositoryBranchName = new cdk.CfnParameter(this, 'RepositoryBranchName', {
    type: 'String',
    description:
      'The name of the git branch to use for installation. To determine the branch name, navigate to the Landing Zone Accelerator GitHub branches page and choose the release branch you would like to deploy. Release branch names will align with the semantic versioning of our GitHub releases. New release branches will be available as the open source project is updated with new features.',
    default: `release/v${version}`,
    allowedPattern: '.+',
    constraintDescription: 'The repository branch name must not be empty',
  });

  private readonly enableApprovalStage = new cdk.CfnParameter(this, 'EnableApprovalStage', {
    type: 'String',
    description: 'Select yes to add a Manual Approval stage to accelerator pipeline',
    allowedValues: ['Yes', 'No'],
    default: 'Yes',
  });

  private readonly approvalStageNotifyEmailList = new cdk.CfnParameter(this, 'ApprovalStageNotifyEmailList', {
    type: 'CommaDelimitedList',
    description: 'Provide comma(,) separated list of email ids to receive manual approval stage notification email',
  });

  private readonly managementAccountEmail = new cdk.CfnParameter(this, 'ManagementAccountEmail', {
    type: 'String',
    description: 'The management (primary) account email',
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
    description: 'Select yes if you deploying to a Control Tower environment.  Select no if using just Organizations',
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
   * Use existing configuration repository name flag
   * @private
   */
  private readonly useExistingConfigRepo = new cdk.CfnParameter(this, 'UseExistingConfigRepo', {
    type: 'String',
    allowedValues: ['Yes', 'No'],
    default: 'No',
    description:
      'Select Yes if deploying the solution with an existing CodeCommit configuration repository. Leave the default value if using the solution-deployed repository. If the AcceleratorPrefix parameter is set to the default value, the solution will deploy a repository named "aws-accelerator-config." Otherwise, the solution-deployed repository will be named "AcceleratorPrefix-config." Note: Updating this value after initial installation may cause adverse affects.',
  });

  /**
   * Existing LZ Accelerator configuration repository name
   * @private
   */
  private readonly existingConfigRepositoryName = new cdk.CfnParameter(this, 'ExistingConfigRepositoryName', {
    type: 'String',
    description: 'The name of an existing CodeCommit repository hosting the accelerator configuration.',
    default: '',
  });

  /**
   * Existing LZ Accelerator configuration repository branch name
   * @private
   */
  private readonly existingConfigRepositoryBranchName = new cdk.CfnParameter(
    this,
    'ExistingConfigRepositoryBranchName',
    {
      type: 'String',
      description:
        'Specify the branch name of existing CodeCommit repository to pull the accelerator configuration from.',
      default: '',
    },
  );

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
   * Accelerator Qualifier parameter
   * @private
   */
  private readonly acceleratorQualifier: cdk.CfnParameter | undefined;

  constructor(scope: Construct, id: string, props: InstallerStackProps) {
    super(scope, id, props);

    const isCommercialCondition = new cdk.CfnCondition(this, 'IsCommercialCondition', {
      expression: cdk.Fn.conditionEquals(cdk.Stack.of(this).partition, 'aws'),
    });

    const globalRegionMap = new cdk.CfnMapping(this, 'GlobalRegionMap', {
      mapping: {
        aws: {
          regionName: 'us-east-1',
        },
        'aws-us-gov': {
          regionName: 'us-gov-west-1',
        },
        'aws-iso-b': {
          regionName: 'us-isob-east-1',
        },
        'aws-iso': {
          regionName: 'us-iso-east-1',
        },
        'aws-cn': {
          regionName: 'cn-northwest-1',
        },
      },
    });

    const parameterGroups: { Label: { default: string }; Parameters: string[] }[] = [
      {
        Label: { default: 'Git Repository Configuration' },
        Parameters: [
          this.repositorySource.logicalId,
          this.repositoryOwner.logicalId,
          this.repositoryName.logicalId,
          this.repositoryBranchName.logicalId,
        ],
      },
      {
        Label: { default: 'Pipeline Configuration' },
        Parameters: [this.enableApprovalStage.logicalId, this.approvalStageNotifyEmailList.logicalId],
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
          this.useExistingConfigRepo.logicalId,
          this.existingConfigRepositoryName.logicalId,
          this.existingConfigRepositoryBranchName.logicalId,
        ],
      },
    ];

    const repositoryParameterLabels: { [p: string]: { default: string } } = {
      [this.repositorySource.logicalId]: { default: 'Source' },
      [this.repositoryOwner.logicalId]: { default: 'Repository Owner' },
      [this.repositoryName.logicalId]: { default: 'Repository Name' },
      [this.repositoryBranchName.logicalId]: { default: 'Branch Name' },
      [this.useExistingConfigRepo.logicalId]: { default: 'Use Existing Config Repository' },
      [this.existingConfigRepositoryName.logicalId]: { default: 'Existing Config Repository Name' },
      [this.existingConfigRepositoryBranchName.logicalId]: { default: 'Existing Config Repository Branch Name' },
      [this.enableApprovalStage.logicalId]: { default: 'Enable Approval Stage' },
      [this.approvalStageNotifyEmailList.logicalId]: { default: 'Manual Approval Stage notification email list' },
      [this.managementAccountEmail.logicalId]: { default: 'Management Account Email' },
      [this.logArchiveAccountEmail.logicalId]: { default: 'Log Archive Account Email' },
      [this.auditAccountEmail.logicalId]: { default: 'Audit Account Email' },
      [this.controlTowerEnabled.logicalId]: { default: 'Control Tower Environment' },
      [this.acceleratorPrefix.logicalId]: { default: 'Accelerator Resource name prefix' },
    };

    let targetAcceleratorParameterLabels: { [p: string]: { default: string } } = {};
    let targetAcceleratorEnvVariables: { [p: string]: cdk.aws_codebuild.BuildEnvironmentVariable } = {};

    if (props.useExternalPipelineAccount) {
      this.acceleratorQualifier = new cdk.CfnParameter(this, 'AcceleratorQualifier', {
        type: 'String',
        description: 'Accelerator assets arn qualifier',
        allowedPattern: '^[a-z]+[a-z0-9-]{1,61}[a-z0-9]+$',
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

      targetAcceleratorEnvVariables = {
        MANAGEMENT_ACCOUNT_ID: {
          type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: this.managementAccountId.valueAsString,
        },
        MANAGEMENT_ACCOUNT_ROLE_NAME: {
          type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: this.managementAccountRoleName.valueAsString,
        },
        ACCELERATOR_QUALIFIER: {
          type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: this.acceleratorQualifier.valueAsString,
        },
      };
    }

    // Validate Installer Parameters

    const validatorFunction = new Validate(this, 'ValidateInstaller', {
      useExistingConfigRepo: this.useExistingConfigRepo.valueAsString,
      existingConfigRepositoryName: this.existingConfigRepositoryName.valueAsString,
      existingConfigRepositoryBranchName: this.existingConfigRepositoryBranchName.valueAsString,
    });
    // cfn-nag suppression
    const validatorFunctionResource = validatorFunction.node.findChild('ValidationFunction').node
      .defaultChild as cdk.CfnResource;
    this.addLambdaNagMetadata(validatorFunctionResource);

    const resourceNamePrefixes = new ResourceNamePrefixes(this, 'ResourceNamePrefixes', {
      acceleratorPrefix: this.acceleratorPrefix.valueAsString,
      acceleratorQualifier: this.acceleratorQualifier?.valueAsString,
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

    let stackIdSsmParameterName = `/${oneWordPrefix}/${cdk.Stack.of(this).stackName}/stack-id`;
    let acceleratorVersionSsmParameterName = `/${oneWordPrefix}/${cdk.Stack.of(this).stackName}/version`;
    let installerKeyAliasName = `alias/${oneWordPrefix}/installer/kms/key`;
    let acceleratorManagementKmsArnSsmParameterName = `/${oneWordPrefix}/installer/kms/key-arn`;
    let installerAccessLogsBucketName = `${lowerCasePrefix}-s3-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`;
    let installerAccessLogsBucketNameSsmParameterName = `/${oneWordPrefix}/installer-access-logs-bucket-name`;
    let secureBucketName = `${lowerCasePrefix}-installer-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`;
    let acceleratorPipelineName = `${acceleratorPrefix}-Pipeline`;
    let installerProjectName = `${acceleratorPrefix}-InstallerProject`;
    let installerPipelineName = `${acceleratorPrefix}-Installer`;

    let acceleratorPrincipalArn = `arn:${cdk.Stack.of(this).partition}:iam::${
      cdk.Stack.of(this).account
    }:role/${acceleratorPrefix}-*`;

    if (props.useExternalPipelineAccount) {
      //
      // Change the variable to use qualifier
      stackIdSsmParameterName = `/accelerator/${this.acceleratorQualifier!.valueAsString}/${
        cdk.Stack.of(this).stackName
      }/stack-id`;
      acceleratorVersionSsmParameterName = `/accelerator/${this.acceleratorQualifier!.valueAsString}/${
        cdk.Stack.of(this).stackName
      }/version`;
      installerKeyAliasName = `alias/accelerator/${this.acceleratorQualifier!.valueAsString}/installer/kms/key`;
      acceleratorManagementKmsArnSsmParameterName = `/accelerator/${
        this.acceleratorQualifier!.valueAsString
      }/installer/kms/key-arn`;
      installerAccessLogsBucketName = `${this.acceleratorQualifier!.valueAsString}-s3-logs-${cdk.Aws.ACCOUNT_ID}-${
        cdk.Aws.REGION
      }`;
      installerAccessLogsBucketNameSsmParameterName = `/accelerator/${
        this.acceleratorQualifier!.valueAsString
      }/installer-access-logs-bucket-name`;
      secureBucketName = `${this.acceleratorQualifier!.valueAsString}-installer-${cdk.Aws.ACCOUNT_ID}-${
        cdk.Aws.REGION
      }`;
      acceleratorPipelineName = `${this.acceleratorQualifier!.valueAsString}-pipeline`;
      installerProjectName = `${this.acceleratorQualifier!.valueAsString}-installer-project`;
      installerPipelineName = `${this.acceleratorQualifier!.valueAsString}-installer`;
      acceleratorPrincipalArn = `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/${
        this.acceleratorQualifier!.valueAsString
      }-*`;
    }

    if (props.enableSingleAccountMode) {
      targetAcceleratorEnvVariables['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] = {
        type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        value: true,
      };
    }

    let targetAcceleratorTestEnvVariables: { [p: string]: cdk.aws_codebuild.BuildEnvironmentVariable } | undefined;
    if (props.enableTester) {
      targetAcceleratorTestEnvVariables = {
        ENABLE_TESTER: {
          type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.enableTester,
        },
        MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME: {
          type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.managementCrossAccountRoleName,
        },
      };
    }

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

    /**
     * Solutions Metrics
     * We use this data to better understand how customers use this
     * solution and related services and products
     */
    new SolutionHelper(this, 'SolutionHelper', {
      solutionId: 'SO0199',
      repositorySource: this.repositorySource,
      repositoryOwner: this.repositoryOwner,
      repositoryBranchName: this.repositoryBranchName,
      repositoryName: this.repositoryName,
    });

    // Create Accelerator Installer KMS Key
    const installerKey = new cdk.aws_kms.Key(this, 'InstallerKey', {
      alias: installerKeyAliasName,
      description: 'AWS Accelerator Management Account Kms Key',
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
            Service: `logs.${cdk.Stack.of(this).region}.${cdk.Stack.of(this).urlSuffix}`,
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
        cdk.Fn.conditionIf(
          isCommercialCondition.logicalId,
          {
            Sid: 'KMS key access to codestar-notifications',
            Effect: 'Allow',
            Principal: {
              Service: 'codestar-notifications.amazonaws.com',
            },
            Action: ['kms:GenerateDataKey*', 'kms:Decrypt'],
            Resource: '*',
            Condition: {
              StringEquals: {
                'kms:ViaService': `sns.${cdk.Stack.of(this).region}.amazonaws.com`,
              },
            },
          },
          cdk.Aws.NO_VALUE,
        ),
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

    const bucket = new Bucket(this, 'SecureBucket', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: secureBucketName,
      kmsKey: installerKey,
      serverAccessLogsBucket: installerServerAccessLogsBucket.getS3Bucket(),
    });

    const installerRole = new cdk.aws_iam.Role(this, 'InstallerAdminRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    const globalRegion = globalRegionMap.findInMap(cdk.Aws.PARTITION, 'regionName');

    const installerProject = new cdk.aws_codebuild.PipelineProject(this, 'InstallerProject', {
      projectName: installerProjectName,
      encryptionKey: installerKey,
      role: installerRole,
      buildSpec: cdk.aws_codebuild.BuildSpec.fromObjectToYaml({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 16,
            },
          },
          pre_build: {
            commands: [
              'ENABLE_EXTERNAL_PIPELINE_ACCOUNT="no"',
              'if [ ! -z "$MANAGEMENT_ACCOUNT_ID" ] && [ ! -z "$MANAGEMENT_ACCOUNT_ROLE_NAME" ]; then ' +
                'ENABLE_EXTERNAL_PIPELINE_ACCOUNT="yes"; ' +
                'fi',
              `if ! aws cloudformation describe-stacks --stack-name ${acceleratorPrefix}-CDKToolkit --region ${cdk.Aws.REGION}; then ` +
                'BOOTSTRAPPED_HOME="no"; ' +
                'fi',
              `if ! aws cloudformation describe-stacks --stack-name ${acceleratorPrefix}-CDKToolkit --region ${globalRegion}; then ` +
                'BOOTSTRAPPED_GLOBAL="no"; ' +
                'fi',
            ],
          },
          build: {
            commands: [
              'cd source',
              `if [ "${cdk.Stack.of(this).partition}" = "aws-cn" ]; then
                  sed -i "s#registry.yarnpkg.com#registry.npmmirror.com#g" yarn.lock;
                  yarn config set registry https://registry.npmmirror.com
               fi`,
              'yarn install',
              'yarn lerna link',
              'yarn build',
              'cd packages/@aws-accelerator/installer',
              `if [ "$BOOTSTRAPPED_HOME" = "no" ]; then yarn run cdk bootstrap --toolkitStackName ${acceleratorPrefix}-CDKToolkit aws://${cdk.Aws.ACCOUNT_ID}/${cdk.Aws.REGION} --qualifier accel; fi`,
              `if [ "$BOOTSTRAPPED_GLOBAL" = "no" ]; then yarn run cdk bootstrap --toolkitStackName ${acceleratorPrefix}-CDKToolkit aws://${cdk.Aws.ACCOUNT_ID}/${globalRegion} --qualifier accel; fi`,
              `if [ $ENABLE_EXTERNAL_PIPELINE_ACCOUNT = "yes" ]; then
                  export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" $(aws sts assume-role --role-arn arn:${
                    cdk.Stack.of(this).partition
                  }:iam::"$MANAGEMENT_ACCOUNT_ID":role/"$MANAGEMENT_ACCOUNT_ROLE_NAME" --role-session-name acceleratorAssumeRoleSession --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text));
                  if ! aws cloudformation describe-stacks --stack-name ${acceleratorPrefix}-CDKToolkit --region ${
                cdk.Aws.REGION
              }; then MGMT_BOOTSTRAPPED_HOME="no"; fi;
                  if ! aws cloudformation describe-stacks --stack-name ${acceleratorPrefix}-CDKToolkit --region ${globalRegion}; then MGMT_BOOTSTRAPPED_GLOBAL="no"; fi;
                  if [ "$MGMT_BOOTSTRAPPED_HOME" = "no" ]; then yarn run cdk bootstrap --toolkitStackName ${acceleratorPrefix}-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/${
                cdk.Aws.REGION
              } --qualifier accel; fi;
                  if [ "$MGMT_BOOTSTRAPPED_GLOBAL" = "no" ]; then yarn run cdk bootstrap --toolkitStackName ${acceleratorPrefix}-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/${globalRegion} --qualifier accel; fi;
                  unset AWS_ACCESS_KEY_ID;
                  unset AWS_SECRET_ACCESS_KEY;
                  unset AWS_SESSION_TOKEN;
               fi`,
              'cd ../accelerator',
              `yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage pipeline --account ${cdk.Aws.ACCOUNT_ID} --region ${cdk.Aws.REGION} --partition ${cdk.Aws.PARTITION}`,
              `if [ "$ENABLE_TESTER" = "true" ]; then yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage tester-pipeline --account ${cdk.Aws.ACCOUNT_ID} --region ${cdk.Aws.REGION}; fi`,
            ],
          },
          post_build: {
            commands: [
              `inprogress_status_count=$(aws codepipeline get-pipeline-state --name "${acceleratorPipelineName}" | grep '"status": "InProgress"' | grep -v grep | wc -l)`,
              `if [ $inprogress_status_count -eq 0 ]; then
                aws codepipeline start-pipeline-execution --name "${acceleratorPipelineName}";
                fi`,
            ],
          },
        },
      }),
      environment: {
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_6_0,
        privileged: false, // Allow access to the Docker daemon
        computeType: cdk.aws_codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          NODE_OPTIONS: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '--max_old_space_size=4096',
          },
          CDK_NEW_BOOTSTRAP: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '1',
          },
          ACCELERATOR_REPOSITORY_SOURCE: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.repositorySource.valueAsString,
          },
          ACCELERATOR_REPOSITORY_OWNER: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.repositoryOwner.valueAsString,
          },
          ACCELERATOR_REPOSITORY_NAME: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.repositoryName.valueAsString,
          },
          ACCELERATOR_REPOSITORY_BRANCH_NAME: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.repositoryBranchName.valueAsString,
          },
          USE_EXISTING_CONFIG_REPO: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.useExistingConfigRepo.valueAsString,
          },
          EXISTING_CONFIG_REPOSITORY_NAME: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.existingConfigRepositoryName.valueAsString,
          },
          EXISTING_CONFIG_REPOSITORY_BRANCH_NAME: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.existingConfigRepositoryBranchName.valueAsString,
          },
          ACCELERATOR_ENABLE_APPROVAL_STAGE: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.enableApprovalStage.valueAsString,
          },
          APPROVAL_STAGE_NOTIFY_EMAIL_LIST: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: cdk.Fn.join(',', this.approvalStageNotifyEmailList.valueAsList),
          },
          MANAGEMENT_ACCOUNT_EMAIL: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.managementAccountEmail.valueAsString,
          },
          LOG_ARCHIVE_ACCOUNT_EMAIL: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.logArchiveAccountEmail.valueAsString,
          },
          AUDIT_ACCOUNT_EMAIL: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.auditAccountEmail.valueAsString,
          },
          CONTROL_TOWER_ENABLED: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.controlTowerEnabled.valueAsString,
          },
          ACCELERATOR_PREFIX: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: acceleratorPrefix,
          },
          ...targetAcceleratorEnvVariables,
          ...targetAcceleratorTestEnvVariables,
        },
      },
    });

    /**
     * Pipeline
     */
    const acceleratorRepoArtifact = new cdk.aws_codepipeline.Artifact('Source');

    /**
     * CodeCommit Pipeline
     */

    const codeCommitPipelineRole = new cdk.aws_iam.Role(this, 'CodeCommitPipelineRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    const codeCommitPipeline = new cdk.aws_codepipeline.Pipeline(this, 'CodeCommitPipeline', {
      pipelineName: installerPipelineName,
      artifactBucket: bucket.getS3Bucket(),
      restartExecutionOnUpdate: true,
      role: codeCommitPipelineRole,
    });

    codeCommitPipeline.addStage({
      stageName: 'Source',
      actions: [
        new cdk.aws_codepipeline_actions.CodeCommitSourceAction({
          actionName: 'Source',
          repository: cdk.aws_codecommit.Repository.fromRepositoryName(
            this,
            'SourceRepo',
            this.repositoryName.valueAsString,
          ),
          branch: this.repositoryBranchName.valueAsString,
          output: acceleratorRepoArtifact,
          trigger: cdk.aws_codepipeline_actions.CodeCommitTrigger.NONE,
        }),
      ],
    });

    codeCommitPipeline.addStage({
      stageName: 'Install',
      actions: [
        new cdk.aws_codepipeline_actions.CodeBuildAction({
          actionName: 'Install',
          project: installerProject,
          input: acceleratorRepoArtifact,
          role: codeCommitPipelineRole,
        }),
      ],
    });

    const useCodeCommitCondition = new cdk.CfnCondition(this, 'UseCodeCommitCondition', {
      expression: cdk.Fn.conditionEquals(this.repositorySource.valueAsString, RepositorySources.CODECOMMIT),
    });

    const cfnCodeCommitPipelinePolicy = codeCommitPipelineRole.node.findChild('DefaultPolicy').node
      .defaultChild as cdk.aws_iam.CfnPolicy;
    cfnCodeCommitPipelinePolicy.cfnOptions.condition = useCodeCommitCondition;

    const cfnCodeCommitPipelineRole = codeCommitPipelineRole.node.defaultChild as cdk.aws_iam.CfnRole;
    cfnCodeCommitPipelineRole.cfnOptions.condition = useCodeCommitCondition;

    const cfnCodeCommitPipeline = codeCommitPipeline.node.defaultChild as cdk.aws_codepipeline.CfnPipeline;
    cfnCodeCommitPipeline.cfnOptions.condition = useCodeCommitCondition;

    const cfnCodeCommitPipelineSource = codeCommitPipeline.node
      .findChild('Source')
      .node.findChild('Source')
      .node.findChild('CodePipelineActionRole').node;
    (cfnCodeCommitPipelineSource.defaultChild as cdk.CfnResource).cfnOptions.condition = useCodeCommitCondition;
    (cfnCodeCommitPipelineSource.findChild('DefaultPolicy').node.defaultChild as cdk.CfnResource).cfnOptions.condition =
      useCodeCommitCondition;

    /**
     * GitHub Pipeline
     */
    const gitHubPipelineRole = new cdk.aws_iam.Role(this, 'GitHubPipelineRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    const gitHubPipeline = new cdk.aws_codepipeline.Pipeline(this, 'GitHubPipeline', {
      pipelineName: installerPipelineName,
      artifactBucket: bucket.getS3Bucket(),
      restartExecutionOnUpdate: true,
      role: gitHubPipelineRole,
    });

    gitHubPipeline.addStage({
      stageName: 'Source',
      actions: [
        new cdk.aws_codepipeline_actions.GitHubSourceAction({
          actionName: 'Source',
          owner: this.repositoryOwner.valueAsString,
          repo: this.repositoryName.valueAsString,
          branch: this.repositoryBranchName.valueAsString,
          oauthToken: cdk.SecretValue.secretsManager('accelerator/github-token'),
          output: acceleratorRepoArtifact,
          trigger: cdk.aws_codepipeline_actions.GitHubTrigger.NONE,
        }),
      ],
    });

    gitHubPipeline.addStage({
      stageName: 'Install',
      actions: [
        new cdk.aws_codepipeline_actions.CodeBuildAction({
          actionName: 'Install',
          project: installerProject,
          input: acceleratorRepoArtifact,
          role: gitHubPipelineRole,
        }),
      ],
    });

    const useGitHubCondition = new cdk.CfnCondition(this, 'UseGitHubCondition', {
      expression: cdk.Fn.conditionEquals(this.repositorySource.valueAsString, RepositorySources.GITHUB),
    });

    const cfnGitHubPipelinePolicy = gitHubPipelineRole.node.findChild('DefaultPolicy').node
      .defaultChild as cdk.aws_iam.CfnPolicy;
    cfnGitHubPipelinePolicy.cfnOptions.condition = useGitHubCondition;

    const cfnGitHubPipelineRole = gitHubPipelineRole.node.defaultChild as cdk.aws_iam.CfnRole;
    cfnGitHubPipelineRole.cfnOptions.condition = useGitHubCondition;

    const cfnGitHubPipeline = gitHubPipeline.node.defaultChild as cdk.aws_codepipeline.CfnPipeline;
    cfnGitHubPipeline.cfnOptions.condition = useGitHubCondition;

    /**
     * Update GitHub Token for Github Pipeline
     */

    const fileContents = fs.readFileSync(
      path.join(__dirname, '..', 'lib', 'lambdas/update-pipeline-github-token/index.js'),
    );

    const updatePipelineLambdaRole = new cdk.aws_iam.Role(this, 'UpdatePipelineLambdaRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    const secretIdPrefix = `arn:${this.partition}:secretsmanager:${this.region}:${this.account}:secret:accelerator/github-token`;
    const installerPipelineArn = `arn:${this.partition}:codepipeline:${this.region}:${this.account}:${installerPipelineName}`;
    const acceleratorPipelineArn = `arn:${this.partition}:codepipeline:${this.region}:${this.account}:${acceleratorPipelineName}`;

    const updatePipelineLambdaPolicy = new cdk.aws_iam.Policy(this, 'UpdatePipelineLambdaPolicy', {
      statements: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['codepipeline:GetPipeline', 'codepipeline:UpdatePipeline'],
          resources: [`${installerPipelineArn}*`, `${acceleratorPipelineArn}*`],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: [
            'secretsmanager:GetResourcePolicy',
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
            'secretsmanager:ListSecretVersionIds',
          ],
          resources: [`${secretIdPrefix}*`],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ['kms:Decrypt'],
          resources: ['*'],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*'],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [acceleratorPrincipalArn, gitHubPipelineRole.roleArn],
        }),
      ],
    });

    updatePipelineLambdaRole.attachInlinePolicy(updatePipelineLambdaPolicy);

    const updatePipelineGithubTokenFunction = new cdk.aws_lambda.Function(this, 'UpdatePipelineGithubTokenFunction', {
      code: new cdk.aws_lambda.InlineCode(fileContents.toString()),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      description: 'Lambda function to update CodePipeline OAuth Token',
      timeout: cdk.Duration.minutes(1),
      environment: {
        ACCELERATOR_PIPELINE_NAME: acceleratorPipelineName,
        INSTALLER_PIPELINE_NAME: installerPipelineName,
      },
      environmentEncryption: installerKey,
      role: updatePipelineLambdaRole,
    });

    const eventTargetLambdaType = new cdk.aws_events_targets.LambdaFunction(updatePipelineGithubTokenFunction, {
      maxEventAge: cdk.Duration.hours(4),
      retryAttempts: 2,
    });

    const updatePipelineGithubTokenRule = new cdk.aws_events.Rule(this, 'UpdatePipelineGithubTokenRule', {
      eventPattern: {
        detailType: ['AWS API Call via CloudTrail'],
        detail: {
          eventSource: ['secretsmanager.amazonaws.com'],
          eventName: ['UpdateSecret', 'PutSecretValue'],
          requestParameters: {
            secretId: [
              {
                prefix: secretIdPrefix,
              },
            ],
          },
        },
      },
      description: 'Rule to trigger Lambda Function when the Github Accelerator Token has been updated.',
      targets: [eventTargetLambdaType],
    });

    const updatePipelineGithubTokenLogGroup = new cdk.aws_logs.LogGroup(
      this,
      `${updatePipelineGithubTokenFunction.node.id}LogGroup`,
      {
        logGroupName: `/aws/lambda/${updatePipelineGithubTokenFunction.functionName}`,

        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
    );

    /**
     * Only create GitHub Pipeline Update Resources if it is a GitHub Sourced Pipeline.
     * Constructs must be cast down to L1 constructs in order to use conditions.
     */
    for (const x of updatePipelineGithubTokenRule.node.findAll()) {
      if (x.node.id.includes('UpdatePipelineGithubTokenFunction')) {
        const cfnGithubTokenPermission = updatePipelineGithubTokenRule.node.findChild(
          x.node.id,
        ) as cdk.aws_lambda.CfnPermission;
        cfnGithubTokenPermission.cfnOptions.condition = useGitHubCondition;
      }
    }

    const cfnUpdatePipelineLambdaRole = updatePipelineLambdaRole.node.defaultChild as cdk.aws_iam.CfnRole;
    cfnUpdatePipelineLambdaRole.cfnOptions.condition = useGitHubCondition;

    const cfnUpdatePipelineGithubTokenRule = updatePipelineGithubTokenRule.node.defaultChild as cdk.aws_events.CfnRule;
    cfnUpdatePipelineGithubTokenRule.cfnOptions.condition = useGitHubCondition;

    const cfnUpdatePipelineGithubTokenLogGroup = updatePipelineGithubTokenLogGroup.node
      .defaultChild as cdk.aws_logs.CfnLogGroup;
    cfnUpdatePipelineGithubTokenLogGroup.cfnOptions.condition = useGitHubCondition;

    // Suppressing due to missing field in aws-us-gov CFN spec
    cfnUpdatePipelineGithubTokenLogGroup.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W84',
            reason: 'CloudWatchLogs LogGroup should specify a KMS Key Id to encrypt the log data',
          },
        ],
      },
    };

    //
    // cfn-nag suppressions
    //
    // W12 IAM Policy allows * on KMS decrypt because Secrets Manager key can be encrypted with user selected key.
    const cfnLambdaFunctionPolicy = updatePipelineLambdaPolicy.node.defaultChild as cdk.aws_iam.CfnPolicy;
    cfnLambdaFunctionPolicy.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W12',
            reason: 'IAM policy should not allow * resource.',
          },
        ],
      },
    };
    cfnLambdaFunctionPolicy.cfnOptions.condition = useGitHubCondition;

    const cfnLambdaFunction = updatePipelineGithubTokenFunction.node.defaultChild as cdk.CfnResource;
    this.addLambdaNagMetadata(cfnLambdaFunction);

    cfnLambdaFunction.cfnOptions.condition = useGitHubCondition;

    //
    // cdk-nag suppressions
    //
    const iam4SuppressionPaths = [
      'InstallerAdminRole/Resource',
      'InstallerAdminRole/DefaultPolicy/Resource',
      'UpdatePipelineLambdaRole/Resource',
    ];

    const iam5SuppressionPaths = [
      'InstallerAdminRole/DefaultPolicy/Resource',
      'CodeCommitPipelineRole/DefaultPolicy/Resource',
      'CodeCommitPipeline/Source/Source/CodePipelineActionRole/DefaultPolicy/Resource',
      'UpdatePipelineLambdaPolicy/Resource',
      'GitHubPipelineRole/DefaultPolicy/Resource',
    ];

    const cb3SuppressionPaths = ['InstallerProject/Resource'];

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
    for (const path of iam4SuppressionPaths) {
      NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/${path}`, [
        { id: 'AwsSolutions-IAM4', reason: 'Managed policies required for IAM role.' },
      ]);
    }

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk-nag rule suppression with evidence for those permission.
    for (const path of iam5SuppressionPaths) {
      NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/${path}`, [
        { id: 'AwsSolutions-IAM5', reason: 'IAM role requires wildcard permissions.' },
      ]);
    }

    // AwsSolutions-CB3: The CodeBuild project has privileged mode enabled.
    for (const path of cb3SuppressionPaths) {
      NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/${path}`, [
        {
          id: 'AwsSolutions-CB3',
          reason: 'Project requires access to the Docker daemon.',
        },
      ]);
    }
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
  }
}
