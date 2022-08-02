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

import { version } from '../../../../../package.json';
import * as pipeline from '../pipeline';

export interface PipelineStackProps extends cdk.StackProps {
  readonly sourceRepository: string;
  readonly sourceRepositoryOwner: string;
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

    const toolkitRole = new cdk.aws_iam.Role(this, 'AdminCdkToolkitRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    new pipeline.AcceleratorPipeline(this, 'Pipeline', {
      toolkitRole,
      ...props,
    });

    // cdk-nag suppressions
    const iam4SuppressionPaths = ['AdminCdkToolkitRole/Resource'];

    const iam5SuppressionPaths = [
      'Pipeline/PipelineRole/DefaultPolicy/Resource',
      'Pipeline/Resource/Source/Source/CodePipelineActionRole/DefaultPolicy/Resource',
      'Pipeline/Resource/Source/Configuration/CodePipelineActionRole/DefaultPolicy/Resource',
      'Pipeline/BuildRole/DefaultPolicy/Resource',
      'AdminCdkToolkitRole/DefaultPolicy/Resource',
    ];

    const cb3SuppressionPaths = ['Pipeline/ToolkitProject/Resource', 'Pipeline/BuildProject/Resource'];

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    for (const path of iam4SuppressionPaths) {
      NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/${path}`, [
        { id: 'AwsSolutions-IAM4', reason: 'Managed policies required for IAM role.' },
      ]);
    }

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
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
