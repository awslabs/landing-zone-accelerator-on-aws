/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import { Bucket, BucketEncryptionType, ServiceLinkedRole } from '@aws-accelerator/constructs';
import { AcceleratorStage } from './accelerator-stage';
import * as config_repository from './config-repository';
import { AcceleratorToolkitCommand } from './toolkit';
import { Repository } from '@aws-cdk-extensions/cdk-extensions';
import { CONTROL_TOWER_LANDING_ZONE_VERSION } from '@aws-accelerator/utils/lib/control-tower';
import { ControlTowerLandingZoneConfig } from '@aws-accelerator/config';

export interface AcceleratorPipelineProps {
  readonly toolkitRole: cdk.aws_iam.Role;
  readonly awsCodeStarSupportedRegions: string[];
  readonly sourceRepository: string;
  readonly sourceRepositoryOwner: string;
  readonly sourceRepositoryName: string;
  readonly sourceBranchName: string;
  readonly sourceBucketName: string;
  readonly sourceBucketObject: string;
  readonly sourceBucketKmsKeyArn?: string;
  readonly enableApprovalStage: boolean;
  readonly qualifier?: string;
  readonly managementAccountId?: string;
  readonly managementAccountRoleName?: string;
  readonly managementAccountEmail: string;
  readonly logArchiveAccountEmail: string;
  readonly auditAccountEmail: string;
  readonly controlTowerEnabled: string;
  /**
   * List of email addresses to be notified when pipeline is waiting for manual approval stage.
   * If pipeline do not have approval stage enabled, this value will have no impact.
   */
  readonly approvalStageNotifyEmailList?: string;
  readonly partition: string;
  /**
   * Indicates location of the LZA configuration files
   */
  readonly configRepositoryLocation: string;
  /**
   * Optional CodeConnection ARN to specify a 3rd-party configuration repository
   */
  readonly codeconnectionArn: string;
  /**
   * Flag indicating installer using existing CodeCommit repository
   */
  readonly useExistingConfigRepo: boolean;
  /**
   * User defined pre-existing config repository name
   */
  readonly configRepositoryName: string;
  /**
   * User defined pre-existing config repository branch name
   */
  readonly configRepositoryBranchName: string;
  /**
   * Accelerator configuration repository owner (CodeConnection only)
   */
  readonly configRepositoryOwner: string;
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
    /**
     * Use this prefix value to name AWS SNS topic
     */
    readonly snsTopicName: string;
    /**
     * Use this prefix value to name AWS Secrets
     */
    readonly secretName: string;
    /**
     * Use this prefix value to name AWS CloudTrail CloudWatch log group
     */
    readonly trailLogName: string;
    /**
     * Use this prefix value to name AWS Glue database
     */
    readonly databaseName: string;
  };
  /**
   * Boolean for single account mode (i.e. AWS Jam or Workshop)
   */
  readonly enableSingleAccountMode: boolean;
  /**
   * Accelerator pipeline account id, for external deployment it will be pipeline account otherwise management account
   */
  pipelineAccountId: string;
  /**
   * Flag indicating existing role
   */
  readonly useExistingRoles: boolean;
  /**
   * AWS Control Tower Landing Zone identifier
   */
  readonly landingZoneIdentifier?: string;
  /**
   * Accelerator region by region deploy order
   */
  readonly regionByRegionDeploymentOrder?: string;
}

enum BuildLogLevel {
  ERROR = 'error',
  INFO = 'info',
}

/**
 *  Dictionary of all Action names in one place
 *  in case we want to change the action name it should be done here
 */

const coreActions: [AcceleratorStage, string][] = [
  [AcceleratorStage.BOOTSTRAP, 'Bootstrap'],
  [AcceleratorStage.KEY, 'Key'],
  [AcceleratorStage.LOGGING, 'Logging'],
  [AcceleratorStage.ORGANIZATIONS, 'Organizations'],
  [AcceleratorStage.SECURITY_AUDIT, 'Security_Audit'],
  [AcceleratorStage.NETWORK_PREP, 'Network_Prepare'],
  [AcceleratorStage.SECURITY, 'Security'],
  [AcceleratorStage.OPERATIONS, 'Operations'],
  [AcceleratorStage.NETWORK_VPC, 'Network_VPCs'],
  [AcceleratorStage.SECURITY_RESOURCES, 'Security_Resources'],
  [AcceleratorStage.IDENTITY_CENTER, 'Identity_Center'],
  [AcceleratorStage.NETWORK_ASSOCIATIONS, 'Network_Associations'],
  [AcceleratorStage.CUSTOMIZATIONS, 'Customizations'],
  [AcceleratorStage.FINALIZE, 'Finalize'],
];

const otherActions: [AcceleratorStage, string][] = [
  [AcceleratorStage.PREPARE, 'Prepare'],
  [AcceleratorStage.ACCOUNTS, 'Accounts'],
  [AcceleratorStage.IMPORT_ASEA_RESOURCES, 'ImportAseaResources'],
  [AcceleratorStage.POST_IMPORT_ASEA_RESOURCES, 'PostImportAseaResources'],
];

const actionNames = Object.fromEntries([...coreActions, ...otherActions]);

/**
 *  AWS Accelerator Pipeline Class, which creates the pipeline for AWS Landing zone
 */
export class AcceleratorPipeline extends Construct {
  private readonly pipelineRole: iam.Role;
  private readonly toolkitProject: codebuild.PipelineProject;
  private readonly buildOutput: codepipeline.Artifact;
  private readonly acceleratorRepoArtifact: codepipeline.Artifact;
  private readonly configRepoArtifact: codepipeline.Artifact;
  private readonly pipelineArtifacts: codepipeline.Artifact[];

  private readonly pipeline: codepipeline.Pipeline;
  private readonly props: AcceleratorPipelineProps;
  private readonly installerKey: cdk.aws_kms.Key;
  private readonly configBucketName: string;
  private readonly serverAccessLogsBucketNameSsmParam: string;
  private readonly controlTowerLandingZoneConfig?: ControlTowerLandingZoneConfig;
  private readonly diffS3Uri: string;

  constructor(scope: Construct, id: string, props: AcceleratorPipelineProps) {
    super(scope, id);

    this.props = props;

    //
    // Get default AWS Control Tower Landing Zone configuration
    //
    this.controlTowerLandingZoneConfig = this.getControlTowerLandingZoneConfiguration();

    //
    // Fields can be changed based on qualifier property
    let acceleratorKeyArnSsmParameterName = `${props.prefixes.ssmParamName}/installer/kms/key-arn`;
    let secureBucketName = `${props.prefixes.bucketName}-pipeline-${cdk.Stack.of(this).account}-${
      cdk.Stack.of(this).region
    }`;
    this.configBucketName = `${props.prefixes.bucketName}-config-${cdk.Stack.of(this).account}-${
      cdk.Stack.of(this).region
    }`;
    this.serverAccessLogsBucketNameSsmParam = `${props.prefixes.ssmParamName}/installer-access-logs-bucket-name`;
    let pipelineName = `${props.prefixes.accelerator}-Pipeline`;
    let buildProjectName = `${props.prefixes.accelerator}-BuildProject`;
    let toolkitProjectName = `${props.prefixes.accelerator}-ToolkitProject`;

    //
    // Change the fields when qualifier is present
    if (this.props.qualifier) {
      acceleratorKeyArnSsmParameterName = `${props.prefixes.ssmParamName}/${this.props.qualifier}/installer/kms/key-arn`;
      secureBucketName = `${this.props.qualifier}-pipeline-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`;
      this.configBucketName = `${this.props.qualifier}-config-${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }`;
      this.serverAccessLogsBucketNameSsmParam = `${props.prefixes.ssmParamName}/${this.props.qualifier}/installer-access-logs-bucket-name`;
      pipelineName = `${this.props.qualifier}-pipeline`;
      buildProjectName = `${this.props.qualifier}-build-project`;
      toolkitProjectName = `${this.props.qualifier}-toolkit-project`;
    }

    let pipelineAccountEnvVariables: { [p: string]: codebuild.BuildEnvironmentVariable } | undefined;

    if (this.props.managementAccountId && this.props.managementAccountRoleName) {
      pipelineAccountEnvVariables = {
        MANAGEMENT_ACCOUNT_ID: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: this.props.managementAccountId,
        },
        MANAGEMENT_ACCOUNT_ROLE_NAME: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: this.props.managementAccountRoleName,
        },
      };
    }

    let enableSingleAccountModeEnvVariables: { [p: string]: codebuild.BuildEnvironmentVariable } | undefined;
    if (props.enableSingleAccountMode) {
      enableSingleAccountModeEnvVariables = {
        ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: true,
        },
      };
    }

    const enableAseaMigration = process.env['ENABLE_ASEA_MIGRATION']?.toLowerCase?.() === 'true';

    let aseaMigrationModeEnvVariables: { [p: string]: codebuild.BuildEnvironmentVariable } | undefined;
    if (enableAseaMigration) {
      aseaMigrationModeEnvVariables = {
        ENABLE_ASEA_MIGRATION: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: 'true',
        },
        ASEA_MAPPING_BUCKET: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: `${props.prefixes.accelerator}-lza-resource-mapping-${cdk.Stack.of(this).account}`.toLowerCase(),
        },
        ASEA_MAPPING_FILE: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: 'aseaResources.json',
        },
      };
    }

    // Get installer key
    this.installerKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(this, acceleratorKeyArnSsmParameterName),
    ) as cdk.aws_kms.Key;

    const bucket = new Bucket(this, 'SecureBucket', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: secureBucketName,
      kmsKey: this.installerKey,
      serverAccessLogsBucketName: cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.serverAccessLogsBucketNameSsmParam,
      ),
    });

    /**
     * Pipeline
     */
    this.pipelineRole = new iam.Role(this, 'PipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    /**
     * Optional context flag "s3-source-kms-key-arn" for encrypted S3 buckets containing LZA source code
     * requires pipeline roles to have additional KMS key access permissions
     */
    if (this.props.sourceBucketKmsKeyArn) {
      this.pipelineRole.addToPolicy(
        new cdk.aws_iam.PolicyStatement({
          actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
          resources: [this.props.sourceBucketKmsKeyArn],
        }),
      );
    }

    this.pipeline = new codepipeline.Pipeline(this, 'Resource', {
      pipelineName: pipelineName,
      artifactBucket: bucket.getS3Bucket(),
      role: this.pipelineRole,
    });

    this.acceleratorRepoArtifact = new codepipeline.Artifact('Source');
    this.configRepoArtifact = new codepipeline.Artifact('Config');

    /**
     * Formatting Artifact name from network-vpc to Network_Vpc
     * strapes are not allowed
     */
    const formatArtifactName = (stage: AcceleratorStage): string => {
      return stage
        .split('-')
        .map(name => name.charAt(0).toUpperCase() + name.slice(1))
        .join('_');
    };

    this.pipelineArtifacts = coreActions.map(([stage]) => new codepipeline.Artifact(formatArtifactName(stage)));

    let sourceAction:
      | cdk.aws_codepipeline_actions.CodeCommitSourceAction
      | cdk.aws_codepipeline_actions.S3SourceAction
      | cdk.aws_codepipeline_actions.GitHubSourceAction;

    if (this.props.sourceRepository === 'codecommit') {
      sourceAction = new codepipeline_actions.CodeCommitSourceAction({
        actionName: 'Source',
        repository: codecommit.Repository.fromRepositoryName(this, 'SourceRepo', this.props.sourceRepositoryName),
        branch: this.props.sourceBranchName,
        output: this.acceleratorRepoArtifact,
        trigger: codepipeline_actions.CodeCommitTrigger.NONE,
        role: this.pipelineRole,
      });
    } else if (this.props.sourceBucketName && this.props.sourceBucketName.length > 0) {
      // hidden parameter to use S3 for source code via cdk context
      const bucket = cdk.aws_s3.Bucket.fromBucketAttributes(this, 'ExistingBucket', {
        bucketName: this.props.sourceBucketName,
        ...(this.props.sourceBucketKmsKeyArn && {
          encryptionKey: cdk.aws_kms.Key.fromKeyArn(this, 'S3SourceKmsKey', this.props.sourceBucketKmsKeyArn),
        }),
      });

      sourceAction = new codepipeline_actions.S3SourceAction({
        actionName: 'Source',
        bucket: bucket,
        bucketKey: this.props.sourceBucketObject,
        output: this.acceleratorRepoArtifact,
        trigger: codepipeline_actions.S3Trigger.NONE,
        role: this.pipelineRole,
      });
    } else {
      sourceAction = new cdk.aws_codepipeline_actions.GitHubSourceAction({
        actionName: 'Source',
        owner: this.props.sourceRepositoryOwner,
        repo: this.props.sourceRepositoryName,
        branch: this.props.sourceBranchName,
        oauthToken: cdk.SecretValue.secretsManager('accelerator/github-token'),
        output: this.acceleratorRepoArtifact,
        trigger: cdk.aws_codepipeline_actions.GitHubTrigger.NONE,
      });
    }

    if (this.props.configRepositoryLocation === 's3') {
      const s3ConfigRepository = this.getS3ConfigRepository();
      this.pipeline.addStage({
        stageName: 'Source',
        actions: [
          sourceAction,
          new codepipeline_actions.S3SourceAction({
            actionName: 'Configuration',
            bucket: s3ConfigRepository,
            bucketKey: 'zipped/aws-accelerator-config.zip',
            output: this.configRepoArtifact,
            trigger: codepipeline_actions.S3Trigger.NONE,
            variablesNamespace: 'Config-Vars',
          }),
        ],
      });
    } else if (this.props.configRepositoryLocation === 'codeconnection' && this.props.codeconnectionArn !== '') {
      this.pipeline.addStage({
        stageName: 'Source',
        actions: [
          sourceAction,
          new codepipeline_actions.CodeStarConnectionsSourceAction({
            actionName: 'Configuration',
            branch: this.props.configRepositoryBranchName,
            connectionArn: this.props.codeconnectionArn,
            owner: this.props.configRepositoryOwner,
            repo: this.props.configRepositoryName,
            output: this.configRepoArtifact,
            variablesNamespace: 'Config-Vars',
          }),
        ],
      });
    } else {
      const configRepositoryBranchName = this.props.useExistingConfigRepo
        ? this.props.configRepositoryBranchName ?? 'main'
        : 'main';
      const codecommitConfigRepository = this.getCodeCommitConfigRepository(configRepositoryBranchName);
      this.pipeline.addStage({
        stageName: 'Source',
        actions: [
          sourceAction,
          new codepipeline_actions.CodeCommitSourceAction({
            actionName: 'Configuration',
            repository: codecommitConfigRepository,
            branch: configRepositoryBranchName,
            output: this.configRepoArtifact,
            trigger: codepipeline_actions.CodeCommitTrigger.NONE,
            variablesNamespace: 'Config-Vars',
            role: this.pipelineRole,
          }),
        ],
      });
    }

    /**
     * Build Stage
     */
    const buildRole = new iam.Role(this, 'BuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    const validateConfigPolicyDocument = new cdk.aws_iam.PolicyDocument({
      statements: [
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['organizations:ListAccounts', 'ssm:GetParameter'],
          resources: ['*'],
        }),
      ],
    });

    const validateConfigPolicy = new cdk.aws_iam.ManagedPolicy(this, 'ValidateConfigPolicyDocument', {
      document: validateConfigPolicyDocument,
    });
    buildRole.addManagedPolicy(validateConfigPolicy);

    if (this.props.managementAccountId && this.props.managementAccountRoleName) {
      const assumeExternalDeploymentRolePolicyDocument = new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['sts:AssumeRole'],
            resources: [
              `arn:${this.props.partition}:iam::${this.props.managementAccountId}:role/${this.props.managementAccountRoleName}`,
            ],
          }),
        ],
      });

      /**
       * Create an IAM Policy for the build role to be able to lookup replacement parameters in the external deployment
       * target account
       */
      const assumeExternalDeploymentRolePolicy = new cdk.aws_iam.ManagedPolicy(this, 'AssumeExternalDeploymentPolicy', {
        document: assumeExternalDeploymentRolePolicyDocument,
      });
      buildRole.addManagedPolicy(assumeExternalDeploymentRolePolicy);
    }

    // Pipeline/BuildRole/Resource AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
    NagSuppressions.addResourceSuppressionsByPath(
      cdk.Stack.of(this),
      `${cdk.Stack.of(this).stackName}/Pipeline/BuildRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Managed policy for External Pipeline Deployment Lookups attached.',
        },
      ],
    );

    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: buildProjectName,
      encryptionKey: this.installerKey,
      role: buildRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 18,
            },
          },
          pre_build: {
            commands: [
              `export PACKAGE_VERSION=$(cat source/package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[:space:]')`,
              `if [ "$ACCELERATOR_CHECK_VERSION" = "yes" ]; then
                if [ "$PACKAGE_VERSION" != "$ACCELERATOR_PIPELINE_VERSION" ]; then
                  echo "ERROR: Accelerator package version in Source does not match currently installed LZA version. Please ensure that the Installer stack has been updated prior to updating the Source code in CodePipeline."
                  exit 1
                fi
              fi`,
            ],
          },
          build: {
            commands: [
              'env',
              'cd source',
              `if [ "${cdk.Stack.of(this).partition}" = "aws-cn" ]; then
                  sed -i "s#registry.yarnpkg.com#registry.npmmirror.com#g" yarn.lock;
                  yarn config set registry https://registry.npmmirror.com
               fi`,
              'if [ -f .yarnrc ]; then yarn install --use-yarnrc .yarnrc; else yarn install; fi',
              'yarn build',
              'yarn validate-config $CODEBUILD_SRC_DIR_Config',
            ],
          },
        },
        artifacts: {
          files: ['**/*'],
          'enable-symlinks': 'yes',
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: false,
        computeType: codebuild.ComputeType.LARGE,
        environmentVariables: {
          NODE_OPTIONS: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '--max_old_space_size=12288 --no-warnings',
          },
          PARTITION: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: cdk.Stack.of(this).partition,
          },
          ACCELERATOR_PIPELINE_VERSION: {
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
            value: `${props.prefixes.ssmParamName}/${cdk.Stack.of(this).stackName}/version`,
          },
          ACCELERATOR_CHECK_VERSION: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: 'yes',
          },
          ...enableSingleAccountModeEnvVariables,
          ...pipelineAccountEnvVariables,
        },
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
    });

    /**
     * Toolkit CodeBuild poroject is used to run all Accelerator stages, including diff
     * First it executes synth of all Pipeline stages and then diff within the same container.
     * CloudFormation templates are then reused for all further stages
     * Diff files are uploaded to pipeline S3 bucket
     */
    this.diffS3Uri = `s3://${this.props.prefixes.bucketName}-pipeline-${cdk.Stack.of(this).account}-${
      cdk.Stack.of(this).region
    }/AWSAccelerator-Pipel/Diffs`;

    this.toolkitProject = new codebuild.PipelineProject(this, 'ToolkitProject', {
      projectName: toolkitProjectName,
      encryptionKey: this.installerKey,
      role: this.props.toolkitRole,
      timeout: cdk.Duration.hours(8),
      buildSpec: codebuild.BuildSpec.fromObjectToYaml({
        version: 0.2,
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 18,
            },
          },
          pre_build: {
            commands: [
              `export WORK_DIR=source/packages/@aws-accelerator/accelerator
               export ARCHIVE_NAME="\${ACCELERATOR_STAGE}.tgz"
               export DIFFS_DIR="${this.diffS3Uri}"
               export STAGE_ARTIFACT=$(echo "$ACCELERATOR_STAGE" | sed 's/-/ /g' | awk '{for (i=1; i<=NF; ++i) $i=toupper(substr($i,1,1))tolower(substr($i,2))}1' | sed 's/ /_/g')
              `,
            ],
          },
          build: {
            commands: [
              'env',
              'cd $WORK_DIR',
              `if [ "prepare" = "\${ACCELERATOR_STAGE}" ]; then set -e && LOG_LEVEL=${
                BuildLogLevel.INFO
              } yarn run ts-node ../lza-modules/bin/runner.ts --module control-tower --partition ${
                cdk.Aws.PARTITION
              } --use-existing-role ${
                this.props.useExistingRoles ? 'Yes' : 'No'
              } --config-dir $CODEBUILD_SRC_DIR_Config; fi`,
              `if [ "prepare" = "\${ACCELERATOR_STAGE}" ] && [ -z "\${ACCELERATOR_NO_ORG_MODULE}" ]; then set -e && LOG_LEVEL=info && yarn run ts-node ../lza-modules/bin/runner.ts --module aws-organizations --partition  ${
                cdk.Aws.PARTITION
              } --use-existing-role ${
                this.props.useExistingRoles ? 'Yes' : 'No'
              } --config-dir $CODEBUILD_SRC_DIR_Config; else echo "Module aws-organizations execution skipped by environment settings."; fi`,
              `if [ "prepare" = "\${ACCELERATOR_STAGE}" ]; then set -e && LOG_LEVEL=info && yarn run ts-node ../lza-modules/bin/runner.ts --module account-alias --partition  ${
                cdk.Aws.PARTITION
              } --use-existing-role ${
                this.props.useExistingRoles ? 'Yes' : 'No'
              } --config-dir $CODEBUILD_SRC_DIR_Config; fi`,
              `if [ "prepare" = "\${ACCELERATOR_STAGE}" ]; then set -e && yarn run ts-node  ./lib/prerequisites.ts --config-dir $CODEBUILD_SRC_DIR_Config --partition ${cdk.Aws.PARTITION} --minimal; fi`,
              'export FULL_SYNTH="true"',
              'if [ $ASEA_MAPPING_BUCKET ]; then aws s3api head-object --bucket $ASEA_MAPPING_BUCKET --key $ASEA_MAPPING_FILE >/dev/null 2>&1 || export FULL_SYNTH="false"; fi;',
              `if [ "\${CDK_OPTIONS}" = "bootstrap" ]; then
                  if [ $FULL_SYNTH = "true" ]; then 
                    set -e && yarn run ts-node --transpile-only cdk.ts synth --stage $ACCELERATOR_STAGE --require-approval never --config-dir $CODEBUILD_SRC_DIR_Config --partition ${cdk.Aws.PARTITION};
                  fi
                  if [ "\${ACCELERATOR_STAGE}" = "bootstrap" ]; then
                    yarn run ts-node --transpile-only cdk.ts synth --stage $ACCELERATOR_STAGE --require-approval never --config-dir $CODEBUILD_SRC_DIR_Config --partition ${cdk.Aws.PARTITION};
                    yarn run ts-node --transpile-only cdk.ts $CDK_OPTIONS --require-approval never --config-dir $CODEBUILD_SRC_DIR_Config --partition ${cdk.Aws.PARTITION} --app cdk.out;
                  fi
                  if [ $FULL_SYNTH = "true" ]; then
                    set -e && tar -czf cf_$ARCHIVE_NAME -C cdk.out .;
                  else
                    touch full-synth-false.txt;
                  fi
                  if [ "\${ACCELERATOR_ENABLE_APPROVAL_STAGE}" = "Yes" ] && [ "$ACCELERATOR_STAGE" != "bootstrap" ]; then
                    set -e && yarn run ts-node --transpile-only cdk.ts diff --stage $ACCELERATOR_STAGE --require-approval never --config-dir $CODEBUILD_SRC_DIR_Config --partition ${cdk.Aws.PARTITION} --app cdk.out;
                    tar -czf diff_cdk_out_$ARCHIVE_NAME -C cdk.out .
                    find cdk.out -type f -name "*.diff" -print0 | tar --transform='s|.*/||' -czf diff_$ARCHIVE_NAME --null -T -
                    aws s3 cp diff_$ARCHIVE_NAME $DIFFS_DIR/$CODEPIPELINE_EXECUTION_ID/
                  fi
               else
                eval ARTIFACTS='$'CODEBUILD_SRC_DIR_$STAGE_ARTIFACT
                if [ -f "\${ARTIFACTS}/cf_\${ARCHIVE_NAME}" ]; then
                     mkdir -p cdk.out
                     tar -xzf $ARTIFACTS/cf_$ARCHIVE_NAME -C cdk.out;
                 else
                    set -e && yarn run ts-node --transpile-only cdk.ts synth --stage $ACCELERATOR_STAGE --require-approval never --config-dir $CODEBUILD_SRC_DIR_Config --partition ${cdk.Aws.PARTITION};
                 fi
                 set -e && yarn run ts-node --transpile-only cdk.ts $CDK_OPTIONS --require-approval never --config-dir $CODEBUILD_SRC_DIR_Config --partition ${cdk.Aws.PARTITION} --app cdk.out;
               fi`,
              `if [ "prepare" = "\${ACCELERATOR_STAGE}" ]; then set -e && yarn run ts-node  ./lib/prerequisites.ts --config-dir $CODEBUILD_SRC_DIR_Config --partition ${cdk.Aws.PARTITION}; fi`,
            ],
          },
        },
        artifacts: {
          'base-directory': '$WORK_DIR',
          files: ['cf_$ARCHIVE_NAME', 'diff_cdk_out_$ARCHIVE_NAME', 'full-synth-false.txt'],
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: false, // Allow access to the Docker daemon
        computeType: codebuild.ComputeType.LARGE,
        environmentVariables: {
          LOG_LEVEL: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: BuildLogLevel.ERROR,
          },
          NODE_OPTIONS: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '--max_old_space_size=12288 --no-warnings',
          },
          CDK_METHOD: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: 'direct',
          },
          CDK_NEW_BOOTSTRAP: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '1',
          },
          ACCELERATOR_QUALIFIER: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.props.qualifier ? this.props.qualifier : 'aws-accelerator',
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
          ACCELERATOR_SNS_TOPIC_NAME_PREFIX: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.prefixes.snsTopicName,
          },
          ACCELERATOR_SECRET_NAME_PREFIX: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.prefixes.secretName,
          },
          ACCELERATOR_TRAIL_LOG_NAME_PREFIX: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.prefixes.trailLogName,
          },
          ACCELERATOR_DATABASE_NAME_PREFIX: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.prefixes.databaseName,
          },
          PIPELINE_ACCOUNT_ID: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.pipelineAccountId,
          },
          ENABLE_DIAGNOSTICS_PACK: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: process.env['ENABLE_DIAGNOSTICS_PACK'] ?? 'Yes',
          },
          INSTALLER_STACK_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: process.env['INSTALLER_STACK_NAME'] ?? '',
          },
          ACCELERATOR_PERMISSION_BOUNDARY: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: process.env['ACCELERATOR_PERMISSION_BOUNDARY'] ?? '',
          },
          CONFIG_REPOSITORY_LOCATION: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: process.env['CONFIG_REPOSITORY_LOCATION'] ?? 'codecommit',
          },
          ACCELERATOR_SKIP_PREREQUISITES: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: 'true',
          },
          ACCELERATOR_ENABLE_APPROVAL_STAGE: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.enableApprovalStage ? 'Yes' : 'No',
          },
          USE_EXISTING_CONFIG_REPO: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.props.useExistingConfigRepo,
          },
          EXISTING_CONFIG_REPOSITORY_NAME: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.props.configRepositoryName,
          },
          EXISTING_CONFIG_REPOSITORY_BRANCH_NAME: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.props.configRepositoryBranchName,
          },
          ...enableSingleAccountModeEnvVariables,
          ...pipelineAccountEnvVariables,
          ...aseaMigrationModeEnvVariables,
        },
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
    });

    this.buildOutput = new codepipeline.Artifact('Build');

    this.pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build',
          project: buildProject,
          input: this.acceleratorRepoArtifact,
          extraInputs: [this.configRepoArtifact],
          outputs: [this.buildOutput],
          role: this.pipelineRole,
          environmentVariables: {
            REGION_BY_REGION_DEPLOYMENT_ORDER: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: this.props.regionByRegionDeploymentOrder ?? '',
            },
          },
        }),
      ],
    });

    /**
     * The Prepare stage is used to verify that all prerequisites have been made and that the
     * Accelerator can be deployed into the environment
     * Creates the accounts
     * Creates the ou's if control tower is not enabled
     */
    this.pipeline.addStage({
      stageName: 'Prepare',
      actions: [
        this.createToolkitStage({
          actionName: actionNames[AcceleratorStage.PREPARE],
          command: 'deploy',
          stage: AcceleratorStage.PREPARE,
        }),
      ],
    });

    this.pipeline.addStage({
      stageName: 'Accounts',
      actions: [
        this.createToolkitStage({
          actionName: actionNames[AcceleratorStage.ACCOUNTS],
          command: 'deploy',
          stage: AcceleratorStage.ACCOUNTS,
        }),
      ],
    });

    this.pipeline.addStage({
      stageName: 'Bootstrap',
      actions: [
        ...coreActions.map(([stage, actionName]) =>
          this.createToolkitStage({
            actionName: actionName,
            command: 'bootstrap',
            stage: stage,
            runOrder: 1,
          }),
        ),
      ],
    });

    //
    // Add review stage based on parameter
    const notificationTopic = this.addReviewStage();

    /**
     * The Logging stack establishes all the logging assets that are needed in
     * all the accounts and will configure:
     *
     * - An S3 Access Logs bucket for every region in every account
     * - The Central Logs bucket in the log-archive account
     *
     */
    this.pipeline.addStage({
      stageName: 'Logging',
      actions: [
        this.createToolkitStage({
          actionName: actionNames[AcceleratorStage.KEY],
          command: 'deploy',
          stage: AcceleratorStage.KEY,
          runOrder: 1,
        }),
        this.createToolkitStage({
          actionName: actionNames[AcceleratorStage.LOGGING],
          command: 'deploy',
          stage: AcceleratorStage.LOGGING,
          runOrder: 2,
        }),
      ],
    });

    // Adds ASEA Import Resources stage
    if (enableAseaMigration) {
      this.pipeline.addStage({
        stageName: 'ImportAseaResources',
        actions: [
          this.createToolkitStage({
            actionName: actionNames[AcceleratorStage.IMPORT_ASEA_RESOURCES],
            command: `deploy`,
            stage: AcceleratorStage.IMPORT_ASEA_RESOURCES,
          }),
        ],
      });
    }

    this.pipeline.addStage({
      stageName: 'Organization',
      actions: [
        this.createToolkitStage({
          actionName: actionNames[AcceleratorStage.ORGANIZATIONS],
          command: 'deploy',
          stage: AcceleratorStage.ORGANIZATIONS,
        }),
      ],
    });

    this.pipeline.addStage({
      stageName: 'SecurityAudit',
      actions: [
        this.createToolkitStage({
          actionName: actionNames[AcceleratorStage.SECURITY_AUDIT],
          command: 'deploy',
          stage: AcceleratorStage.SECURITY_AUDIT,
        }),
      ],
    });

    if (this.props.regionByRegionDeploymentOrder) {
      const regions = this.props.regionByRegionDeploymentOrder.split(',').map(r => r.trim());

      for (const region of regions) {
        this.addDeployStage(region, notificationTopic);
      }

      this.pipeline.addStage({
        stageName: 'Finalize',
        actions: [
          this.createToolkitStage({
            actionName: 'Finalize',
            command: 'deploy',
            stage: AcceleratorStage.FINALIZE,
          }),
        ],
      });
    } else {
      this.addDeployStage();
    }

    // Add ASEA Import Resources
    if (enableAseaMigration) {
      this.pipeline.addStage({
        stageName: 'PostImportAseaResources',
        actions: [
          this.createToolkitStage({
            actionName: actionNames[AcceleratorStage.POST_IMPORT_ASEA_RESOURCES],
            command: `deploy`,
            stage: AcceleratorStage.POST_IMPORT_ASEA_RESOURCES,
          }),
        ],
      });
    }

    // Enable pipeline notification for commercial partition
    this.enablePipelineNotification();
  }

  private getBuildProps(stageName: string, command: string) {
    const commonProps = {
      input: this.buildOutput,
      extraInputs: [this.configRepoArtifact],
    };
    const excludedArtifacts = ['Source', 'Build', 'Prepare', 'Accounts', 'Bootstrap'];
    const matchingArtifact = this.pipelineArtifacts.filter(
      artifact => artifact.artifactName?.toLowerCase().replace('_', '-') === stageName.toLowerCase(),
    );
    return {
      ...commonProps,
      project: this.toolkitProject,
      extraInputs: [
        ...commonProps.extraInputs,
        ...(command === 'deploy' && stageName && !excludedArtifacts.includes(stageName) ? matchingArtifact : []),
      ],
      outputs: command === 'bootstrap' ? matchingArtifact : [],
    };
  }

  /**
   * Add review stage based on parameter
   */
  private addReviewStage(): cdk.aws_sns.Topic | undefined {
    if (this.props.enableApprovalStage) {
      const notificationTopic = new cdk.aws_sns.Topic(this, 'ManualApprovalActionTopic', {
        topicName:
          (this.props.qualifier ? this.props.qualifier : this.props.prefixes.snsTopicName) + '-pipeline-review-topic',
        displayName:
          (this.props.qualifier ? this.props.qualifier : this.props.prefixes.snsTopicName) + '-pipeline-review-topic',
        masterKey: this.installerKey,
      });

      let notifyEmails: string[] | undefined = undefined;

      if (notificationTopic) {
        if (this.props.approvalStageNotifyEmailList) {
          notifyEmails = this.props.approvalStageNotifyEmailList.split(',');
        }
      }

      /**
       * Review link relies on this.props.partition, might not work in all partitions.
       * This is why we add additional information to Approve action
       */
      const reviewLink = `https://${cdk.Stack.of(this).region}.console.${this.getConsoleUrlSuffixForPartition(
        this.props.partition,
      )}/s3/buckets/${this.props.prefixes.bucketName}-pipeline-${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }?prefix=AWSAccelerator-Pipel/Diffs/#{codepipeline.PipelineExecutionId}/&region=${
        cdk.Stack.of(this).region
      }&bucketType=general`;

      this.pipeline.addStage({
        stageName: 'Review',
        actions: [
          new codepipeline_actions.ManualApprovalAction({
            actionName: 'Approve',
            runOrder: 2,
            additionalInformation: `
              Changes for this execution can be found in accelerator pipeline S3 bucket under Diffs/#{codepipeline.PipelineExecutionId}. 
              Use cli command for download: "aws s3 sync ${this.diffS3Uri}/#{codepipeline.PipelineExecutionId} diffs" or follow the link below.`,
            notificationTopic,
            externalEntityLink: reviewLink,
            notifyEmails,
            role: this.pipelineRole,
          }),
        ],
      });

      return notificationTopic;
    }

    return undefined;
  }

  private addDeployStage(region?: string, notificationTopic?: cdk.aws_sns.Topic) {
    const actions: codepipeline.IAction[] = [
      this.createToolkitStage({
        actionName: actionNames[AcceleratorStage.NETWORK_PREP],
        command: 'deploy',
        stage: AcceleratorStage.NETWORK_PREP,
        runOrder: 1,
        region,
      }),
      this.createToolkitStage({
        actionName: actionNames[AcceleratorStage.SECURITY],
        command: 'deploy',
        stage: AcceleratorStage.SECURITY,
        runOrder: 1,
        region,
      }),
      this.createToolkitStage({
        actionName: actionNames[AcceleratorStage.OPERATIONS],
        command: 'deploy',
        stage: AcceleratorStage.OPERATIONS,
        runOrder: 1,
        region,
      }),
      this.createToolkitStage({
        actionName: actionNames[AcceleratorStage.NETWORK_VPC],
        command: 'deploy',
        stage: AcceleratorStage.NETWORK_VPC,
        runOrder: 2,
        region,
      }),
      this.createToolkitStage({
        actionName: actionNames[AcceleratorStage.SECURITY_RESOURCES],
        command: 'deploy',
        stage: AcceleratorStage.SECURITY_RESOURCES,
        runOrder: 2,
        region,
      }),
      this.createToolkitStage({
        actionName: actionNames[AcceleratorStage.IDENTITY_CENTER],
        command: 'deploy',
        stage: AcceleratorStage.IDENTITY_CENTER,
        runOrder: 2,
        region,
      }),
      this.createToolkitStage({
        actionName: actionNames[AcceleratorStage.NETWORK_ASSOCIATIONS],
        command: 'deploy',
        stage: AcceleratorStage.NETWORK_ASSOCIATIONS,
        runOrder: 3,
        region,
      }),
      this.createToolkitStage({
        actionName: actionNames[AcceleratorStage.CUSTOMIZATIONS],
        command: 'deploy',
        stage: AcceleratorStage.CUSTOMIZATIONS,
        runOrder: 4,
        region,
      }),
    ];

    if (!region) {
      actions.push(
        this.createToolkitStage({
          actionName: actionNames[AcceleratorStage.FINALIZE],
          command: 'deploy',
          stage: AcceleratorStage.FINALIZE,
          runOrder: 5,
        }),
      );
    } else {
      actions.push(
        new codepipeline_actions.ManualApprovalAction({
          actionName: 'Approve',
          runOrder: 5,
          notificationTopic,
        }),
      );
    }

    this.pipeline.addStage({
      stageName: region ? `Deploy-${region}` : 'Deploy',
      actions,
    });
  }

  private createToolkitStage(stageProps: {
    actionName: string;
    command: string;
    stage?: string;
    runOrder?: number;
    region?: string;
  }): codepipeline_actions.CodeBuildAction {
    const cdkOptionsParts = [stageProps.command];
    if (
      stageProps.command !== AcceleratorToolkitCommand.BOOTSTRAP.toString() &&
      stageProps.command !== AcceleratorToolkitCommand.DIFF.toString()
    ) {
      cdkOptionsParts.push(`--stage ${stageProps.stage}`);
    }
    if (stageProps.region?.trim()) {
      cdkOptionsParts.push(`--region ${stageProps.region}`);
    }
    const cdkOptions = cdkOptionsParts.join(' ');

    const environmentVariables: {
      [name: string]: cdk.aws_codebuild.BuildEnvironmentVariable;
    } = {
      CDK_OPTIONS: {
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        value: cdkOptions,
      },
      CONFIG_COMMIT_ID: {
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        value: this.props.configRepositoryLocation === 's3' ? '#{Config-Vars.VersionId}' : '#{Config-Vars.CommitId}',
      },
      CODEPIPELINE_EXECUTION_ID: {
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        value: '#{codepipeline.PipelineExecutionId}',
      },
    };

    if (stageProps.stage) {
      environmentVariables['ACCELERATOR_STAGE'] = {
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        value: stageProps.stage ?? '',
      };
    }

    return new codepipeline_actions.CodeBuildAction({
      actionName: stageProps.actionName,
      runOrder: stageProps.runOrder,
      role: this.pipelineRole,
      environmentVariables,
      ...this.getBuildProps(stageProps.stage!, stageProps.command),
    });
  }

  /**
   * Enable pipeline notification for commercial partition and supported regions
   */
  private enablePipelineNotification() {
    if (this.props.enableSingleAccountMode) {
      return;
    }

    // We can Enable pipeline notification only for regions with AWS CodeStar being available
    if (this.props.awsCodeStarSupportedRegions.includes(cdk.Stack.of(this).region)) {
      const codeStarNotificationsRole = new ServiceLinkedRole(this, 'AWSServiceRoleForCodeStarNotifications', {
        environmentEncryptionKmsKey: this.installerKey,
        cloudWatchLogKmsKey: this.installerKey,
        // specifying this as it will be overwritten with global retention in logging stack
        cloudWatchLogRetentionInDays: 7,
        awsServiceName: 'codestar-notifications.amazonaws.com',
        description: 'Allows AWS CodeStar Notifications to access Amazon CloudWatch Events on your behalf',
        roleName: 'AWSServiceRoleForCodeStarNotifications',
      });

      this.pipeline.node.addDependency(codeStarNotificationsRole);

      const acceleratorStatusTopic = new cdk.aws_sns.Topic(this, 'AcceleratorStatusTopic', {
        topicName:
          (this.props.qualifier ? this.props.qualifier : this.props.prefixes.snsTopicName) + '-pipeline-status-topic',
        displayName:
          (this.props.qualifier ? this.props.qualifier : this.props.prefixes.snsTopicName) + '-pipeline-status-topic',
        masterKey: this.installerKey,
      });

      acceleratorStatusTopic.grantPublish(this.pipeline.role);

      this.pipeline.notifyOn('AcceleratorPipelineStatusNotification', acceleratorStatusTopic, {
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
        topicName:
          (this.props.qualifier ? this.props.qualifier : this.props.prefixes.snsTopicName) +
          '-pipeline-failed-status-topic',
        displayName:
          (this.props.qualifier ? this.props.qualifier : this.props.prefixes.snsTopicName) +
          '-pipeline-failed-status-topic',
        masterKey: this.installerKey,
      });

      acceleratorFailedStatusTopic.grantPublish(this.pipeline.role);

      this.pipeline.notifyOn('AcceleratorPipelineFailureNotification', acceleratorFailedStatusTopic, {
        events: [cdk.aws_codepipeline.PipelineNotificationEvents.PIPELINE_EXECUTION_FAILED],
      });

      acceleratorFailedStatusTopic
        .metricNumberOfMessagesPublished()
        .createAlarm(this, 'AcceleratorPipelineFailureAlarm', {
          threshold: 1,
          evaluationPeriods: 1,
          datapointsToAlarm: 1,
          treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
          alarmName: this.props.qualifier
            ? this.props.qualifier + '-pipeline-failed-alarm'
            : `${this.props.prefixes.accelerator}FailedAlarm`,
          alarmDescription: 'AWS Accelerator pipeline failure alarm, created by accelerator',
        });
    }
  }

  /**
   * Returns a codecommit configuration repository
   */
  private getCodeCommitConfigRepository(branchName: string) {
    let configRepository: cdk.aws_codecommit.IRepository | Repository;

    if (this.props.useExistingConfigRepo) {
      configRepository = cdk.aws_codecommit.Repository.fromRepositoryName(
        this,
        'ConfigRepository',
        this.props.configRepositoryName,
      );
    } else {
      configRepository = new config_repository.CodeCommitConfigRepository(this, 'ConfigRepository', {
        repositoryName: this.props.configRepositoryName,
        repositoryBranchName: branchName,
        description:
          'AWS Accelerator configuration repository, created and initialized with default config file by pipeline',
        managementAccountEmail: this.props.managementAccountEmail,
        logArchiveAccountEmail: this.props.logArchiveAccountEmail,
        auditAccountEmail: this.props.auditAccountEmail,
        controlTowerEnabled: this.props.controlTowerEnabled,
        controlTowerLandingZoneConfig: this.controlTowerLandingZoneConfig,
        enableSingleAccountMode: this.props.enableSingleAccountMode,
      }).getRepository();

      const cfnRepository = configRepository.node.defaultChild as codecommit.CfnRepository;
      cfnRepository.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN, { applyToUpdateReplacePolicy: true });
    }
    return configRepository;
  }
  /**
   * Returns an S3 configuration repository
   */
  private getS3ConfigRepository() {
    const configRepository = new config_repository.S3ConfigRepository(this, 'ConfigRepository', {
      configBucketName: this.configBucketName,
      description:
        'AWS Accelerator configuration repository bucket, created and initialized with default config file by pipeline',
      managementAccountEmail: this.props.managementAccountEmail,
      logArchiveAccountEmail: this.props.logArchiveAccountEmail,
      auditAccountEmail: this.props.auditAccountEmail,
      controlTowerEnabled: this.props.controlTowerEnabled,
      controlTowerLandingZoneConfig: this.controlTowerLandingZoneConfig,
      enableSingleAccountMode: this.props.enableSingleAccountMode,
      installerKey: this.installerKey,
      serverAccessLogsBucketName: cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.serverAccessLogsBucketNameSsmParam,
      ),
    }).getRepository();
    return configRepository;
  }

  /**
   * Function to construct default AWS Control Tower Landing Zone configuration
   * @returns controlTowerLandingZoneConfig {@link ControlTowerLandingZoneConfig} | undefined
   */
  private getControlTowerLandingZoneConfiguration(): ControlTowerLandingZoneConfig | undefined {
    const controlTowerEnabled = this.props.controlTowerEnabled.toLocaleLowerCase() === 'yes';

    if (!controlTowerEnabled && this.props.landingZoneIdentifier) {
      throw new Error(
        `It is not possible to deploy Accelerator when there is an existing AWS Control Tower and the ControlTowerEnabled parameter of the Accelerator installer stack is set to "No".`,
      );
    }

    if (!controlTowerEnabled) {
      return undefined;
    }

    // The CT configuration object should not be set if CT is already configured - this prevents overwriting the existing CT LZ configuration
    if (this.props.landingZoneIdentifier) {
      return undefined;
    }

    return {
      version: CONTROL_TOWER_LANDING_ZONE_VERSION,
      logging: {
        loggingBucketRetentionDays: 365,
        accessLoggingBucketRetentionDays: 3650,
        organizationTrail: true,
      },
      security: { enableIdentityCenterAccess: true },
    };
  }
  private getConsoleUrlSuffixForPartition(partition: string): string {
    const partitions: { [key: string]: string } = {
      aws: 'aws.amazon.com',
      'aws-cn': 'amazonaws.com.cn',
      'aws-iso': 'c2s.ic.gov',
      'aws-iso-b': 'sc2s.sgov.gov',
      'aws-iso-e': 'cloud.adc-e.uk',
      'aws-iso-f': 'csp.hci.ic.gov',
      'aws-us-gov': 'amazonaws-us-gov.com',
    };
    return partitions[partition] || 'amazonaws.com';
  }
}
