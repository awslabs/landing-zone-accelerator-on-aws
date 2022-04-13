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
import { version } from '../../../../../package.json';
import * as pipeline from '../pipeline';

export interface PipelineStackProps extends cdk.StackProps {
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
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    new cdk.aws_ssm.StringParameter(this, 'SsmParamStackId', {
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/stack-id`,
      stringValue: cdk.Stack.of(this).stackId,
    });

    new cdk.aws_ssm.StringParameter(this, 'SsmParamAcceleratorVersion', {
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/version`,
      stringValue: version,
    });

    // TODO: Add event to launch the Pipeline for new account events
    new pipeline.AcceleratorPipeline(this, 'Pipeline', {
      ...props,
    });

    // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/Pipeline/SecureBucket/Resource/Resource`, [
      {
        id: 'AwsSolutions-S1',
        reason: 'SecureBucket has server access logs disabled till the task for access logging completed.',
      },
    ]);

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/Pipeline/PipelineRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'PipelineRole DefaultPolicy is built by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/Pipeline/Resource/Source/Source/CodePipelineActionRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Source code pipeline action DefaultPolicy is built by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/Pipeline/Resource/Source/Configuration/CodePipelineActionRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Configuration source pipeline action DefaultPolicy is built by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/Pipeline/BuildRole/DefaultPolicy/Resource`, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Pipeline code build role is built by cdk.',
      },
    ]);

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/Pipeline/ToolkitRole/Resource`, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Pipeline toolkit project role is built by cdk.',
      },
    ]);

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/Pipeline/ToolkitRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Pipeline toolkit project role DefaultPolicy is built by cdk.',
        },
      ],
    );

    // AwsSolutions-CB3: The CodeBuild project has privileged mode enabled.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/Pipeline/ToolkitProject/Resource`, [
      {
        id: 'AwsSolutions-CB3',
        reason: 'Pipeline toolkit project allow access to the Docker daemon.',
      },
    ]);

    // AwsSolutions-CB3: The CodeBuild project has privileged mode enabled.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/Pipeline/BuildProject/Resource`, [
      {
        id: 'AwsSolutions-CB3',
        reason: 'Pipeline build project allow access to the Docker daemon.',
      },
    ]);
  }
}
