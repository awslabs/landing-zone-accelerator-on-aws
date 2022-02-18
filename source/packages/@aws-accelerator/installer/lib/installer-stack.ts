/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
  // TODO: Add allowedPattern for all CfnParameter uses
  private readonly repositorySource = new cdk.CfnParameter(this, 'RepositorySource', {
    type: 'String',
    description: 'Specify the git host',
    allowedValues: [RepositorySources.GITHUB, RepositorySources.CODECOMMIT],
    default: RepositorySources.GITHUB,
  });

  private readonly repositoryName = new cdk.CfnParameter(this, 'RepositoryName', {
    type: 'String',
    description: 'The name of the git repository hosting the accelerator code',
  });

  private readonly repositoryBranchName = new cdk.CfnParameter(this, 'RepositoryBranchName', {
    type: 'String',
    description: 'The name of the git branch to use for installation',
  });

  private readonly enableApprovalStage = new cdk.CfnParameter(this, 'EnableApprovalStage', {
    type: 'String',
    description: 'Select yes to add a Manual Approval stage to accelerator pipeline',
    allowedValues: ['Yes', 'No'],
    default: 'Yes',
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

    const parameterGroups: { Label: { default: string }; Parameters: string[] }[] = [
      {
        Label: { default: 'Git Repository Configuration' },
        Parameters: [
          this.repositorySource.logicalId,
          this.repositoryName.logicalId,
          this.repositoryBranchName.logicalId,
        ],
      },
      {
        Label: { default: 'Pipeline Configuration' },
        Parameters: [this.enableApprovalStage.logicalId],
      },
    ];

    const repositoryParameterLabels: { [p: string]: { default: string } } = {
      [this.repositorySource.logicalId]: { default: 'Source' },
      [this.repositoryName.logicalId]: { default: 'Repository Name' },
      [this.repositoryBranchName.logicalId]: { default: 'Branch Name' },
      [this.enableApprovalStage.logicalId]: { default: 'Enable Approval Stage' },
    };

    let lowerCaseQualifier = 'aws-accelerator';
    let pascalCaseQualifier = 'aws-accelerator';

    let targetAcceleratorParameterLabels: { [p: string]: { default: string } } = {};
    let targetAcceleratorEnvVariables: { [p: string]: cdk.aws_codebuild.BuildEnvironmentVariable } | undefined;

    if (props.useExternalPipelineAccount) {
      this.acceleratorQualifier = new cdk.CfnParameter(this, 'AcceleratorQualifier', {
        type: 'String',
        description: 'Accelerator assets arn qualifier',
        allowedPattern: '^[a-z]+[a-z0-9-]{1,61}[a-z0-9]+$',
        // allowedPattern: '^[A-Za-z]+[A-Za-z0-9-]{1,61}[A-Za-z0-9]+$',
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

      lowerCaseQualifier = pascalCaseQualifier = this.acceleratorQualifier.valueAsString;
    } else {
      pascalCaseQualifier = 'AWSAccelerator';
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
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/stack-id`,
      stringValue: cdk.Stack.of(this).stackId,
    });

    new cdk.aws_ssm.StringParameter(this, 'SsmParamAcceleratorVersion', {
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/version`,
      stringValue: version,
    });

    const bucket = new Bucket(this, 'SecureBucket', {
      // s3BucketName: `accelerator-installer-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`, //TO DO change the bucket name
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: `${lowerCaseQualifier}-installer-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`, //TO DO change the bucket name
      kmsAliasName: `alias/${lowerCaseQualifier}/installer/s3`,
      kmsDescription: 'AWS Accelerator Installer Bucket CMK',
    });

    // cfn_nag suppressions
    const cfnBucket = bucket.node.defaultChild?.node.defaultChild as cdk.aws_s3.CfnBucket;
    cfnBucket.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W35',
            reason: 'S3 Bucket access logging is not enabled for the pipeline artifacts bucket.',
          },
        ],
      },
    };

    /**
     * Pipeline
     */
    const pipelineRole = new cdk.aws_iam.Role(this, 'PipelineRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    const pipeline = new cdk.aws_codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `${pascalCaseQualifier}-Installer`,
      artifactBucket: bucket.getS3Bucket(),
      restartExecutionOnUpdate: true,
      role: pipelineRole,
    });

    // cfn_nag: Suppress warning related to high SPCM score
    const cfnPipelinePolicy = pipeline.role.node.findChild('DefaultPolicy').node.defaultChild as cdk.aws_iam.CfnPolicy;
    cfnPipelinePolicy.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W76',
            reason: 'This policy is generated by CDK which can cause a high SPCM score.',
          },
        ],
      },
    };

    const acceleratorRepoArtifact = new cdk.aws_codepipeline.Artifact('Source');

    pipeline.addStage({
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

    /**
     * Install Stage
     */
    const installerRole = new cdk.aws_iam.Role(this, 'InstallerRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('codebuild.amazonaws.com'),
      // TODO: Lock this down to just the pipeline and cloudformation actions needed
      managedPolicies: [cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    const installerProject = new cdk.aws_codebuild.PipelineProject(this, 'InstallerProject', {
      projectName: `${pascalCaseQualifier}-InstallerProject`,
      role: installerRole,
      buildSpec: cdk.aws_codebuild.BuildSpec.fromObjectToYaml({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 14,
            },
          },
          build: {
            commands: [
              'cd source',
              'yarn install',
              'yarn lerna link',
              'yarn build',
              'cd packages/@aws-accelerator/installer',
              `yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://${cdk.Aws.ACCOUNT_ID}/${cdk.Aws.REGION} --qualifier accel`,
              'cd ../accelerator',
              `yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage pipeline --account ${cdk.Aws.ACCOUNT_ID} --region ${cdk.Aws.REGION}`,
              `if [ "$ENABLE_TESTER" = "true" ]; then yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage tester-pipeline --account ${cdk.Aws.ACCOUNT_ID} --region ${cdk.Aws.REGION}; fi`,
            ],
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
          ...targetAcceleratorEnvVariables,
          ...targetAcceleratorTestEnvVariables,
        },
      },
    });

    pipeline.addStage({
      stageName: 'Install',
      actions: [
        new cdk.aws_codepipeline_actions.CodeBuildAction({
          actionName: 'Install',
          project: installerProject,
          input: acceleratorRepoArtifact,
          role: pipelineRole,
        }),
      ],
    });

    //
    // cdk-nag suppressions
    //

    // [Error at /AWSAccelerator-InstallerStack/SecureBucket/Resource/Resource]
    // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      'AWSAccelerator-InstallerStack/SecureBucket/Resource/Resource',
      [
        {
          id: 'AwsSolutions-S1',
          reason: 'S3 Bucket access logging is not enabled for the pipeline artifacts bucket.',
        },
      ],
    );

    // [Error at /AWSAccelerator-InstallerStack/PipelineRole/DefaultPolicy/Resource]
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag
    // rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      'AWSAccelerator-InstallerStack/PipelineRole/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'PipelineRole DefaultPolicy is built by cdk',
        },
      ],
    );

    // [Error at /AWSAccelerator-InstallerStack/Pipeline/Source/Source/CodePipelineActionRole/DefaultPolicy/Resource]
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag
    // rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      '/AWSAccelerator-InstallerStack/Pipeline/Source/Source/CodePipelineActionRole/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Source CodePipelineActionRole DefaultPolicy is built by cdk',
        },
      ],
    );

    // [Error at /AWSAccelerator-InstallerStack/InstallerRole/Resource]
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
    NagSuppressions.addResourceSuppressionsByPath(this, '/AWSAccelerator-InstallerStack/InstallerRole/Resource', [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Using AdministratorAccessRole to deploy accelerator pipeline',
      },
    ]);

    // [Error at /AWSAccelerator-InstallerStack/InstallerRole/DefaultPolicy/Resource]
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag
    // rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      '/AWSAccelerator-InstallerStack/InstallerRole/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'InstallerRole DefaultPolicy is built by cdk',
        },
      ],
    );
  }
}
