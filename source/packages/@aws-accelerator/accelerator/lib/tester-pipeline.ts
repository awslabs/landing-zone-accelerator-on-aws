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
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';
import fs from 'fs';
import * as yaml from 'js-yaml';
import os from 'os';
import path from 'path';

import { Bucket, BucketEncryptionType } from '@aws-accelerator/constructs';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';

/**
 * TesterPipelineProps
 */
export interface TesterPipelineProps {
  readonly sourceRepositoryName: string;
  readonly sourceBranchName: string;
  readonly managementCrossAccountRoleName: string;
  readonly qualifier?: string;
  readonly managementAccountId?: string;
  readonly managementAccountRoleName?: string;
  /**
   * Accelerator resource name prefixes
   */
  readonly prefixes: {
    /**
     * Use this prefix value to name resources like -
     AWS IAM Role names, AWS Lambda Function names, AWS Cloudwatch log groups names, AWS CloudFormation stack names, AWS CodePipeline names, AWS CodeBuild project names
     *
     */
    readonly accelerator: string;
    /**
     * Use this prefix value to name AWS CodeCommit repository
     */
    readonly repoName: string;
    /**
     * Use this prefix value to name AWS S3 bucket
     */
    readonly bucketName: string;
    /**
     * Use this prefix value to name AWS SSM parameter
     */
    readonly ssmParamName: string;
    /**
     * Use this prefix value to name AWS KMS alias
     */
    readonly kmsAlias: string;
  };
}

/**
 * AWS Accelerator Functional Test Pipeline Class, which creates the pipeline for Accelerator test
 */
export class TesterPipeline extends Construct {
  private readonly pipelineRole: iam.Role;
  private readonly deployOutput: codepipeline.Artifact;
  private readonly acceleratorRepoArtifact: codepipeline.Artifact;
  private readonly configRepoArtifact: codepipeline.Artifact;

  constructor(scope: Construct, id: string, props: TesterPipelineProps) {
    super(scope, id);

    let targetAcceleratorEnvVariables: { [p: string]: codebuild.BuildEnvironmentVariable } | undefined;

    const tempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'test-config-assets-'));
    fs.writeFileSync(path.join(tempDirPath, 'config.yaml'), yaml.dump({ tests: [] }), 'utf8');

    const configurationDefaultAssets = new s3_assets.Asset(this, 'ConfigurationDefaultAssets', {
      path: tempDirPath,
    });

    const configRepository = new cdk_extensions.Repository(this, 'ConfigRepository', {
      repositoryName: `${props.qualifier ?? props.prefixes.repoName}-test-config`,
      repositoryBranchName: 'main',
      s3BucketName: configurationDefaultAssets.bucket.bucketName,
      s3key: configurationDefaultAssets.s3ObjectKey,
      description: 'AWS Accelerator functional test configuration repository',
    });

    const cfnRepository = configRepository.node.defaultChild as codecommit.CfnRepository;
    cfnRepository.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN, { applyToUpdateReplacePolicy: true });

    if (props.managementAccountId && props.managementAccountRoleName) {
      targetAcceleratorEnvVariables = {
        MANAGEMENT_ACCOUNT_ID: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.managementAccountId,
        },
        MANAGEMENT_ACCOUNT_ROLE_NAME: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: props.managementAccountRoleName,
        },
      };
    }

    // Get installer key
    const installerKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        props.qualifier
          ? `${props.prefixes.ssmParamName}/${props.qualifier}/installer/kms/key-arn`
          : `${props.prefixes.ssmParamName}/installer/kms/key-arn`,
      ),
    ) as cdk.aws_kms.Key;

    const bucket = new Bucket(this, 'SecureBucket', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: `${props.qualifier ?? props.prefixes.bucketName}-tester-${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }`,
      kmsKey: installerKey,
      serverAccessLogsBucketName: cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        props.qualifier
          ? `${props.prefixes.ssmParamName}/${props.qualifier}/installer-access-logs-bucket-name`
          : `${props.prefixes.ssmParamName}/installer-access-logs-bucket-name`,
      ),
    });

    /**
     * Functional test pipeline role
     */
    this.pipelineRole = new iam.Role(this, 'PipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    /**
     * Functional test pipeline
     */
    const pipeline = new codepipeline.Pipeline(this, 'Resource', {
      pipelineName: props.qualifier
        ? `${props.qualifier}-tester-pipeline`
        : `${props.prefixes.accelerator}-TesterPipeline`,
      artifactBucket: bucket.getS3Bucket(),
      role: this.pipelineRole,
    });

    this.configRepoArtifact = new codepipeline.Artifact('Config');
    this.acceleratorRepoArtifact = new codepipeline.Artifact('Source');

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeCommitSourceAction({
          actionName: 'Source',
          repository: codecommit.Repository.fromRepositoryName(this, 'SourceRepo', props.sourceRepositoryName),
          branch: props.sourceBranchName,
          output: this.acceleratorRepoArtifact,
          trigger: codepipeline_actions.CodeCommitTrigger.NONE,
        }),
        new codepipeline_actions.CodeCommitSourceAction({
          actionName: 'Configuration',
          repository: configRepository,
          branch: 'main',
          output: this.configRepoArtifact,
          trigger: codepipeline_actions.CodeCommitTrigger.EVENTS,
        }),
      ],
    });

    /**
     * Deploy Stage
     */
    const deployRole = new iam.Role(this, 'DeployAdminRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    const testerProject = new codebuild.PipelineProject(this, 'TesterProject', {
      projectName: props.qualifier
        ? `${props.qualifier}-tester-project`
        : `${props.prefixes.accelerator}-TesterProject`,
      encryptionKey: installerKey,
      role: deployRole,
      buildSpec: codebuild.BuildSpec.fromObjectToYaml({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 16,
            },
          },
          build: {
            commands: [
              'cd source',
              'yarn install',
              'yarn lerna link',
              'yarn build',
              'cd packages/@aws-accelerator/tester',
              'env',
              `if [ ! -z "$MANAGEMENT_ACCOUNT_ID" ] && [ ! -z "$MANAGEMENT_ACCOUNT_ROLE_NAME" ]; then yarn run cdk deploy --require-approval never --context acceleratorPrefix=${props.prefixes.accelerator} --context account=${cdk.Aws.ACCOUNT_ID} --context region=${cdk.Aws.REGION} --context management-cross-account-role-name=${props.managementCrossAccountRoleName} --context qualifier=${props.qualifier} --context config-dir=$CODEBUILD_SRC_DIR_Config --context management-account-id=${props.managementAccountId} --context management-account-role-name=${props.managementAccountRoleName}; else yarn run cdk deploy --require-approval never --context acceleratorPrefix=${props.prefixes.accelerator} --context account=${cdk.Aws.ACCOUNT_ID} --context region=${cdk.Aws.REGION} --context management-cross-account-role-name=${props.managementCrossAccountRoleName} --context config-dir=$CODEBUILD_SRC_DIR_Config; fi`,
            ],
          },
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_6_0,
        privileged: true, // Allow access to the Docker daemon
        computeType: codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          NODE_OPTIONS: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '--max_old_space_size=4096',
          },
          ACCELERATOR_REPOSITORY_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.sourceRepositoryName,
          },
          ACCELERATOR_REPOSITORY_BRANCH_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.sourceBranchName,
          },
          ACCELERATOR_PREFIX: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.prefixes.accelerator,
          },
          ACCELERATOR_REPO_NAME_PREFIX: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.prefixes.repoName,
          },
          ACCELERATOR_BUCKET_NAME_PREFIX: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.prefixes.bucketName,
          },
          ACCELERATOR_KMS_ALIAS_PREFIX: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.prefixes.kmsAlias,
          },
          ACCELERATOR_SSM_PARAM_NAME_PREFIX: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.prefixes.ssmParamName,
          },
          ...targetAcceleratorEnvVariables,
        },
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
    });

    this.deployOutput = new codepipeline.Artifact('DeployOutput');

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Deploy',
          project: testerProject,
          input: this.acceleratorRepoArtifact,
          extraInputs: [this.configRepoArtifact],
          outputs: [this.deployOutput],
          role: this.pipelineRole,
        }),
      ],
    });
  }
}
