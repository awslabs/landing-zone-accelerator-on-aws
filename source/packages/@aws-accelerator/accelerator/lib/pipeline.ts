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
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import { Bucket, BucketEncryptionType } from '@aws-accelerator/constructs';

import { AcceleratorStage } from './accelerator-stage';
import * as config_repository from './config-repository';
import { AcceleratorToolkitCommand } from './toolkit';

/**
 *
 */
export interface AcceleratorPipelineProps {
  readonly sourceRepositoryName: string;
  readonly sourceBranchName: string;
  readonly enableApprovalStage: boolean;
  readonly qualifier?: string;
  readonly managementAccountId?: string;
  readonly managementAccountRoleName?: string;
  readonly managementAccountEmail: string;
  readonly logArchiveAccountEmail: string;
  readonly auditAccountEmail: string;
  /**
   * List of email addresses to be notified when pipeline is waiting for manual approval stage.
   * If pipeline do not have approval stage enabled, this value will have no impact.
   */
  readonly approvalStageNotifyEmailList?: string;
  readonly partition: string;
}

/**
 * AWS Accelerator Pipeline Class, which creates the pipeline for AWS Landing zone
 */
export class AcceleratorPipeline extends Construct {
  private readonly pipelineRole: iam.Role;
  private readonly toolkitRole: iam.Role;
  private readonly toolkitProject: codebuild.PipelineProject;
  private readonly buildOutput: codepipeline.Artifact;
  private readonly acceleratorRepoArtifact: codepipeline.Artifact;
  private readonly configRepoArtifact: codepipeline.Artifact;

  constructor(scope: Construct, id: string, props: AcceleratorPipelineProps) {
    super(scope, id);

    let pipelineAccountEnvVariables: { [p: string]: codebuild.BuildEnvironmentVariable } | undefined;

    if (props.managementAccountId && props.managementAccountRoleName) {
      pipelineAccountEnvVariables = {
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
          ? `/accelerator/${props.qualifier}/installer/kms/key-arn`
          : '/accelerator/installer/kms/key-arn',
      ),
    ) as cdk.aws_kms.Key;

    const bucket = new Bucket(this, 'SecureBucket', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: `${props.qualifier ?? 'aws-accelerator'}-pipeline-${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }`,
      kmsKey: installerKey,
      serverAccessLogsBucketName: cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        props.qualifier
          ? `/accelerator/${props.qualifier}/installer-access-logs-bucket-name`
          : '/accelerator/installer-access-logs-bucket-name',
      ),
    });

    const configRepository = new config_repository.ConfigRepository(this, 'ConfigRepository', {
      repositoryName: `${props.qualifier ?? 'aws-accelerator'}-config`,
      repositoryBranchName: 'main',
      description:
        'AWS Accelerator configuration repository, created and initialized with default config file by pipeline',
      managementAccountEmail: props.managementAccountEmail,
      logArchiveAccountEmail: props.logArchiveAccountEmail,
      auditAccountEmail: props.auditAccountEmail,
    });

    /**
     * Pipeline
     */
    this.pipelineRole = new iam.Role(this, 'PipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    const pipeline = new codepipeline.Pipeline(this, 'Resource', {
      pipelineName: props.qualifier ? `${props.qualifier}-pipeline` : 'AWSAccelerator-Pipeline',
      artifactBucket: bucket.getS3Bucket(),
      role: this.pipelineRole,
    });

    this.acceleratorRepoArtifact = new codepipeline.Artifact('Source');
    this.configRepoArtifact = new codepipeline.Artifact('Config');

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
          repository: configRepository.getRepository(),
          branch: 'main',
          output: this.configRepoArtifact,
          trigger: codepipeline_actions.CodeCommitTrigger.NONE,
        }),
      ],
    });

    /**
     * Build Stage
     */
    const buildRole = new iam.Role(this, 'BuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: props.qualifier ? `${props.qualifier}-build-project` : 'AWSAccelerator-BuildProject',
      encryptionKey: installerKey,
      role: buildRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 14,
            },
          },
          build: {
            commands: ['env', 'cd source', 'yarn install', 'yarn lerna link', 'yarn build'],
          },
        },
        artifacts: {
          files: ['**/*'],
          'enable-symlinks': 'yes',
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Allow access to the Docker daemon
        computeType: codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          NODE_OPTIONS: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '--max_old_space_size=4096',
          },
        },
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
    });

    this.buildOutput = new codepipeline.Artifact('Build');

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build',
          project: buildProject,
          input: this.acceleratorRepoArtifact,
          extraInputs: [this.configRepoArtifact],
          outputs: [this.buildOutput],
          role: this.pipelineRole,
        }),
      ],
    });

    /**
     * Deploy Stage
     */
    this.toolkitRole = new iam.Role(this, 'ToolkitRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    this.toolkitProject = new codebuild.PipelineProject(this, 'ToolkitProject', {
      projectName: props.qualifier ? `${props.qualifier}-toolkit-project` : 'AWSAccelerator-ToolkitProject',
      encryptionKey: installerKey,
      role: this.toolkitRole,
      timeout: cdk.Duration.hours(5),
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
              'env',
              'cd source',
              'cd packages/@aws-accelerator/accelerator',
              `if [ -z "\${ACCELERATOR_STAGE}" ]; then yarn run ts-node --transpile-only cdk.ts synth --require-approval never --config-dir $CODEBUILD_SRC_DIR_Config --partition ${cdk.Aws.PARTITION}; fi`,
              `if [ ! -z "\${ACCELERATOR_STAGE}" ]; then yarn run ts-node --transpile-only cdk.ts synth --stage $ACCELERATOR_STAGE --require-approval never --config-dir $CODEBUILD_SRC_DIR_Config --partition ${cdk.Aws.PARTITION}; fi`,
              `yarn run ts-node --transpile-only cdk.ts --require-approval never $CDK_OPTIONS --config-dir $CODEBUILD_SRC_DIR_Config --partition ${cdk.Aws.PARTITION} --app cdk.out`,
            ],
          },
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Allow access to the Docker daemon
        computeType: codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          NODE_OPTIONS: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '--max_old_space_size=4096',
          },
          CDK_NEW_BOOTSTRAP: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '1',
          },
          ...pipelineAccountEnvVariables,
        },
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
    });

    // /**
    //  * The Prepare stage is used to verify that all prerequisites have been made and that the
    //  * Accelerator can be deployed into the environment
    //  * Creates the accounts
    //  * Creates the ou's if control tower is not enabled
    //  */
    pipeline.addStage({
      stageName: 'Prepare',
      actions: [this.createToolkitStage({ actionName: 'Prepare', command: 'deploy', stage: AcceleratorStage.PREPARE })],
    });

    pipeline.addStage({
      stageName: 'Accounts',
      actions: [
        this.createToolkitStage({ actionName: 'Accounts', command: 'deploy', stage: AcceleratorStage.ACCOUNTS }),
      ],
    });

    pipeline.addStage({
      stageName: 'Bootstrap',
      actions: [this.createToolkitStage({ actionName: 'Bootstrap', command: `bootstrap` })],
    });

    if (props.enableApprovalStage) {
      const notifyEmails = props.approvalStageNotifyEmailList
        ? props.approvalStageNotifyEmailList.split(',')
        : undefined;

      let notificationTopic: cdk.aws_sns.Topic | undefined;

      if (props.partition === 'aws') {
        notificationTopic = new cdk.aws_sns.Topic(this, 'ManualApprovalActionTopic', {
          topicName: (props.qualifier ? props.qualifier : 'aws-accelerator') + '-pipeline-review-topic',
          displayName: (props.qualifier ? props.qualifier : 'aws-accelerator') + '-pipeline-review-topic',
          masterKey: installerKey,
        });
      }

      pipeline.addStage({
        stageName: 'Review',
        actions: [
          this.createToolkitStage({ actionName: 'Diff', command: 'diff', runOrder: 1 }),
          new codepipeline_actions.ManualApprovalAction({
            actionName: 'Approve',
            runOrder: 2,
            additionalInformation: 'See previous stage (Diff) for changes.',
            notificationTopic,
            notifyEmails,
          }),
        ],
      });
    }

    /**
     * The Logging stack establishes all the logging assets that are needed in
     * all the accounts and will configure:
     *
     * - An S3 Access Logs bucket for every region in every account
     * - The Central Logs bucket in the log-archive account
     *
     */
    pipeline.addStage({
      stageName: 'Logging',
      actions: [
        this.createToolkitStage({ actionName: 'Key', command: 'deploy', stage: AcceleratorStage.KEY, runOrder: 1 }),
        this.createToolkitStage({
          actionName: 'Logging',
          command: 'deploy',
          stage: AcceleratorStage.LOGGING,
          runOrder: 2,
        }),
      ],
    });

    pipeline.addStage({
      stageName: 'Organization',
      actions: [
        this.createToolkitStage({
          actionName: 'Organizations',
          command: 'deploy',
          stage: AcceleratorStage.ORGANIZATIONS,
        }),
      ],
    });

    pipeline.addStage({
      stageName: 'SecurityAudit',
      actions: [
        this.createToolkitStage({
          actionName: 'SecurityAudit',
          command: 'deploy',
          stage: AcceleratorStage.SECURITY_AUDIT,
        }),
      ],
    });

    // pipeline.addStage({
    //   stageName: 'Dependencies',
    //   actions: [this.createToolkitStage('Dependencies', `deploy --stage ${AcceleratorStage.DEPENDENCIES}`)],
    // });

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        this.createToolkitStage({
          actionName: 'Network_Prepare',
          command: 'deploy',
          stage: AcceleratorStage.NETWORK_PREP,
          runOrder: 1,
        }),
        this.createToolkitStage({
          actionName: 'Security',
          command: 'deploy',
          stage: AcceleratorStage.SECURITY,
          runOrder: 1,
        }),
        this.createToolkitStage({
          actionName: 'Operations',
          command: 'deploy',
          stage: AcceleratorStage.OPERATIONS,
          runOrder: 1,
        }),
        this.createToolkitStage({
          actionName: 'Network_VPCs',
          command: 'deploy',
          stage: AcceleratorStage.NETWORK_VPC,
          runOrder: 2,
        }),
        this.createToolkitStage({
          actionName: 'Security_Resources',
          command: 'deploy',
          stage: AcceleratorStage.SECURITY_RESOURCES,
          runOrder: 2,
        }),
        this.createToolkitStage({
          actionName: 'Network_Associations',
          command: 'deploy',
          stage: AcceleratorStage.NETWORK_ASSOCIATIONS,
          runOrder: 3,
        }),
        this.createToolkitStage({
          actionName: 'Finalize',
          command: 'deploy',
          stage: AcceleratorStage.FINALIZE,
          runOrder: 4,
        }),
      ],
    });

    // Enable Pipeline notification
    if (props.partition === 'aws') {
      const codeStarNotificationsRole = new cdk.aws_iam.CfnServiceLinkedRole(
        this,
        'AWSServiceRoleForCodeStarNotifications',
        {
          awsServiceName: 'codestar-notifications.amazonaws.com',
          description: 'Allows AWS CodeStar Notifications to access Amazon CloudWatch Events on your behalf',
        },
      );
      pipeline.node.addDependency(codeStarNotificationsRole);

      const acceleratorStatusTopic = new cdk.aws_sns.Topic(this, 'AcceleratorStatusTopic', {
        topicName: (props.qualifier ? props.qualifier : 'aws-accelerator') + '-pipeline-status-topic',
        displayName: (props.qualifier ? props.qualifier : 'aws-accelerator') + '-pipeline-status-topic',
        masterKey: installerKey,
      });

      acceleratorStatusTopic.grantPublish(pipeline.role);

      pipeline.notifyOn('AcceleratorPipelineStatusNotification', acceleratorStatusTopic, {
        events: [
          cdk.aws_codepipeline.PipelineNotificationEvents.MANUAL_APPROVAL_FAILED,
          cdk.aws_codepipeline.PipelineNotificationEvents.MANUAL_APPROVAL_NEEDED,
          cdk.aws_codepipeline.PipelineNotificationEvents.MANUAL_APPROVAL_SUCCEEDED,
          cdk.aws_codepipeline.PipelineNotificationEvents.PIPELINE_EXECUTION_CANCELED,
          cdk.aws_codepipeline.PipelineNotificationEvents.PIPELINE_EXECUTION_FAILED,
          cdk.aws_codepipeline.PipelineNotificationEvents.PIPELINE_EXECUTION_RESUMED,
          cdk.aws_codepipeline.PipelineNotificationEvents.PIPELINE_EXECUTION_STARTED,
          cdk.aws_codepipeline.PipelineNotificationEvents.PIPELINE_EXECUTION_SUCCEEDED,
          cdk.aws_codepipeline.PipelineNotificationEvents.PIPELINE_EXECUTION_SUPERSEDED,
        ],
      });

      // Pipeline failure status topic and alarm
      const acceleratorFailedStatusTopic = new cdk.aws_sns.Topic(this, 'AcceleratorFailedStatusTopic', {
        topicName: (props.qualifier ? props.qualifier : 'aws-accelerator') + '-pipeline-failed-status-topic',
        displayName: (props.qualifier ? props.qualifier : 'aws-accelerator') + '-pipeline-failed-status-topic',
        masterKey: installerKey,
      });

      acceleratorFailedStatusTopic.grantPublish(pipeline.role);

      pipeline.notifyOn('AcceleratorPipelineFailureNotification', acceleratorFailedStatusTopic, {
        events: [cdk.aws_codepipeline.PipelineNotificationEvents.PIPELINE_EXECUTION_FAILED],
      });

      acceleratorFailedStatusTopic
        .metricNumberOfMessagesPublished()
        .createAlarm(this, 'AcceleratorPipelineFailureAlarm', {
          threshold: 1,
          evaluationPeriods: 1,
          datapointsToAlarm: 1,
          treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
          alarmName: props.qualifier ? props.qualifier + '-pipeline-failed-alarm' : 'AwsAcceleratorFailedAlarm',
          alarmDescription: 'AWS Accelerator pipeline failure alarm, created by accelerator',
        });
    }
  }

  private createToolkitStage(props: {
    actionName: string;
    command: string;
    stage?: string;
    runOrder?: number;
  }): codepipeline_actions.CodeBuildAction {
    let cdkOptions;
    if (
      props.command === AcceleratorToolkitCommand.BOOTSTRAP.toString() ||
      props.command === AcceleratorToolkitCommand.DIFF.toString()
    ) {
      cdkOptions = props.command;
    } else {
      cdkOptions = `${props.command} --stage ${props.stage}`;
    }

    const environmentVariables: {
      [name: string]: cdk.aws_codebuild.BuildEnvironmentVariable;
    } = {
      CDK_OPTIONS: {
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        value: cdkOptions,
      },
    };

    if (props.stage) {
      environmentVariables['ACCELERATOR_STAGE'] = {
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        value: props.stage ?? '',
      };
    }

    return new codepipeline_actions.CodeBuildAction({
      actionName: props.actionName,
      runOrder: props.runOrder,
      project: this.toolkitProject,
      input: this.buildOutput,
      extraInputs: [this.configRepoArtifact],
      role: this.pipelineRole,
      environmentVariables,
    });
  }
}
