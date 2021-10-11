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

import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as ssm from '@aws-cdk/aws-ssm';
import * as cdk from '@aws-cdk/core';
import * as compliant_constructs from '@aws-compliant-constructs/compliant-constructs';

export enum RepositorySources {
  GITHUB = 'github',
  CODECOMMIT = 'codecommit',
}

export class InstallerStack extends cdk.Stack {
  /**
   * SSM Parameter path (output): Accelerator source repository name
   */
  static readonly REPOSITORY_NAME = '/accelerator/source/repository-name';

  /**
   * SSM Parameter path (output): Accelerator source repository branch. This represents a version of
   * the Accelerator.
   */
  static readonly REPOSITORY_BRANCH_NAME = '/accelerator/source/repository-branch-name';

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

  // private readonly notificationEmail = new cdk.CfnParameter(this, 'NotificationEmail', {
  //   type: 'String',
  //   description: 'The notification email that will get Accelerator State Machine execution notifications.',
  // });

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Parameter Metadata
    this.templateOptions.metadata = {
      'AWS::CloudFormation::Interface': {
        ParameterGroups: [
          {
            Label: { default: 'Git Repository Configuration' },
            Parameters: [
              this.repositorySource.logicalId,
              this.repositoryName.logicalId,
              this.repositoryBranchName.logicalId,
            ],
          },
          // {
          //   Label: { default: 'Accelerator Configuration' },
          //   Parameters: [this.notificationEmail.logicalId],
          // },
        ],
        ParameterLabels: {
          [this.repositorySource.logicalId]: { default: 'Source' },
          [this.repositoryName.logicalId]: { default: 'Repository Name' },
          [this.repositoryBranchName.logicalId]: { default: 'Branch Name' },
          // [this.notificationEmail.logicalId]: { default: 'Notification Email' },
        },
      },
    };

    const bucket = new compliant_constructs.SecureS3Bucket(this, 'SecureBucket', {
      s3BucketName: `aws-accelerator-installer-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      kmsAliasName: 'alias/accelerator/installer/s3',
      kmsDescription: 'AWS Accelerator Installer Bucket CMK',
    });

    // cfn_nag: Suppress warning related to the pipeline artifacts S3 bucket
    const cfnBucket = bucket.node.defaultChild?.node.defaultChild as s3.CfnBucket;
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
    const pipelineRole = new iam.Role(this, 'PipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'AWS-Accelerator-Installer',
      artifactBucket: bucket.getS3Bucket(),
      role: pipelineRole,
    });

    // cfn_nag: Suppress warning related to high SPCM score
    const cfnPipelinePolicy = pipeline.role.node.findChild('DefaultPolicy').node.defaultChild as iam.CfnPolicy;
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

    const acceleratorRepoArtifact = new codepipeline.Artifact('Source');

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeCommitSourceAction({
          actionName: 'Source',
          repository: codecommit.Repository.fromRepositoryName(this, 'SourceRepo', this.repositoryName.valueAsString),
          branch: this.repositoryBranchName.valueAsString,
          output: acceleratorRepoArtifact,
          trigger: codepipeline_actions.CodeCommitTrigger.NONE,
        }),
      ],
    });

    /**
     * Install Stage
     */
    const installerRole = new iam.Role(this, 'InstallerRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      // TODO: Lock this down to just the pipeline and cloudformation actions needed
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    const installerProject = new codebuild.PipelineProject(this, 'InstallerProject', {
      projectName: 'AWS-Accelerator-InstallerProject',
      role: installerRole,
      buildSpec: codebuild.BuildSpec.fromObject({
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
              'cd packages/@aws-accelerator/accelerator',
              `npx ts-node --transpile-only cdk.ts deploy --require-approval never --stage pipeline --account ${cdk.Aws.ACCOUNT_ID} --region ${cdk.Aws.REGION}`,
            ],
          },
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Allow access to the Docker daemon
        computeType: codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          CDK_NEW_BOOTSTRAP: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '1',
          },
        },
      },
    });

    pipeline.addStage({
      stageName: 'Install',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Install',
          project: installerProject,
          input: acceleratorRepoArtifact,
          role: pipelineRole,
        }),
      ],
    });

    new ssm.StringParameter(this, 'RepositoryNameParameter', {
      parameterName: InstallerStack.REPOSITORY_NAME,
      stringValue: this.repositoryName.valueAsString,
    });

    new ssm.StringParameter(this, 'RepositoryBranchNameParameter', {
      parameterName: InstallerStack.REPOSITORY_BRANCH_NAME,
      stringValue: this.repositoryBranchName.valueAsString,
    });
  }
}
