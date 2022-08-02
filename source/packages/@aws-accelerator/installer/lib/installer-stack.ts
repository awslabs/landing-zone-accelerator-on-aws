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

import { Bucket, BucketEncryptionType } from '@aws-accelerator/constructs';

import { version } from '../../../../package.json';
import { SolutionHelper } from './solutions-helper';

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
    ];

    const repositoryParameterLabels: { [p: string]: { default: string } } = {
      [this.repositorySource.logicalId]: { default: 'Source' },
      [this.repositoryOwner.logicalId]: { default: 'Repository Owner' },
      [this.repositoryName.logicalId]: { default: 'Repository Name' },
      [this.repositoryBranchName.logicalId]: { default: 'Branch Name' },
      [this.enableApprovalStage.logicalId]: { default: 'Enable Approval Stage' },
      [this.approvalStageNotifyEmailList.logicalId]: { default: 'Manual Approval Stage notification email list' },
      [this.managementAccountEmail.logicalId]: { default: 'Management Account Email' },
      [this.logArchiveAccountEmail.logicalId]: { default: 'Log Archive Account Email' },
      [this.auditAccountEmail.logicalId]: { default: 'Audit Account Email' },
    };

    let targetAcceleratorParameterLabels: { [p: string]: { default: string } } = {};
    let targetAcceleratorEnvVariables: { [p: string]: cdk.aws_codebuild.BuildEnvironmentVariable } | undefined;

    //
    // Variables to be changed based on qualifier parameter
    let stackIdSsmParameterName = `/accelerator/${cdk.Stack.of(this).stackName}/stack-id`;
    let acceleratorVersionSsmParameterName = `/accelerator/${cdk.Stack.of(this).stackName}/version`;
    let installerKeySsmParameterName = 'alias/accelerator/installer/kms/key';
    let acceleratorManagementKmsArnSsmParameterName = '/accelerator/installer/kms/key-arn';
    let installerAccessLogsBucketName = `aws-accelerator-s3-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`;
    let installerAccessLogsBucketNameSsmParameterName = `/accelerator/installer-access-logs-bucket-name`;
    let secureBucketName = `aws-accelerator-installer-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`;
    let acceleratorPipelineName = 'AWSAccelerator-Pipeline';
    let installerProjectName = 'AWSAccelerator-InstallerProject';
    let installerPipelineName = 'AWSAccelerator-Installer';

    let acceleratorPrincipalArn = `arn:${cdk.Stack.of(this).partition}:iam::${
      cdk.Stack.of(this).account
    }:role/AWSAccelerator-*`;

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

      //
      // Change the variable to use qualifier
      stackIdSsmParameterName = `/accelerator/${this.acceleratorQualifier.valueAsString}/${
        cdk.Stack.of(this).stackName
      }/stack-id`;
      acceleratorVersionSsmParameterName = `/accelerator/${this.acceleratorQualifier.valueAsString}/${
        cdk.Stack.of(this).stackName
      }/version`;
      installerKeySsmParameterName = `alias/accelerator/${this.acceleratorQualifier.valueAsString}/installer/kms/key`;
      acceleratorManagementKmsArnSsmParameterName = `/accelerator/${this.acceleratorQualifier.valueAsString}/installer/kms/key-arn`;
      installerAccessLogsBucketName = `${this.acceleratorQualifier.valueAsString}-s3-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`;
      installerAccessLogsBucketNameSsmParameterName = `/accelerator/${this.acceleratorQualifier.valueAsString}/installer-access-logs-bucket-name`;
      secureBucketName = `${this.acceleratorQualifier.valueAsString}-installer-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`;
      acceleratorPipelineName = `${this.acceleratorQualifier.valueAsString}-pipeline`;
      installerProjectName = `${this.acceleratorQualifier.valueAsString}-installer-project`;
      installerPipelineName = `${this.acceleratorQualifier.valueAsString}-installer`;
      acceleratorPrincipalArn = `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/${
        this.acceleratorQualifier.valueAsString
      }-*`;
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
      alias: installerKeySsmParameterName,
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
              nodejs: 14,
            },
          },
          pre_build: {
            commands: [
              'ENABLE_EXTERNAL_PIPELINE_ACCOUNT="no"',
              'if [ ! -z "$MANAGEMENT_ACCOUNT_ID" ] && [ ! -z "$MANAGEMENT_ACCOUNT_ROLE_NAME" ]; then ' +
                'ENABLE_EXTERNAL_PIPELINE_ACCOUNT="yes"; ' +
                'fi',
            ],
          },
          build: {
            commands: [
              'cd source',
              'yarn install',
              'yarn lerna link',
              'yarn build',
              'cd packages/@aws-accelerator/installer',
              `yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://${cdk.Aws.ACCOUNT_ID}/${cdk.Aws.REGION} --qualifier accel`,
              `yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://${cdk.Aws.ACCOUNT_ID}/${globalRegion} --qualifier accel`,
              `if [ $ENABLE_EXTERNAL_PIPELINE_ACCOUNT = "yes" ]; then
                  export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" $(aws sts assume-role --role-arn arn:${
                    cdk.Stack.of(this).partition
                  }:iam::"$MANAGEMENT_ACCOUNT_ID":role/"$MANAGEMENT_ACCOUNT_ROLE_NAME" --role-session-name acceleratorAssumeRoleSession --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text));
                  yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/${
                    cdk.Aws.REGION
                  } --qualifier accel;
                  yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/${globalRegion} --qualifier accel;
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
            commands: [`aws codepipeline start-pipeline-execution --name ${acceleratorPipelineName}`],
          },
        },
      }),
      environment: {
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Allow access to the Docker daemon
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

    //
    // cdk-nag suppressions
    //
    const iam4SuppressionPaths = ['InstallerAdminRole/Resource', 'InstallerAdminRole/DefaultPolicy/Resource'];

    const iam5SuppressionPaths = [
      'InstallerAdminRole/DefaultPolicy/Resource',
      'CodeCommitPipelineRole/DefaultPolicy/Resource',
      'CodeCommitPipeline/Source/Source/CodePipelineActionRole/DefaultPolicy/Resource',
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
}
