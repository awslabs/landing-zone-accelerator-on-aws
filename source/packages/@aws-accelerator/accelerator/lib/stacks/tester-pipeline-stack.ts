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
import { Construct } from 'constructs';
import { TesterPipeline } from '../tester-pipeline';

/**
 * TesterPipelineStackProps
 */
export interface TesterPipelineStackProps extends cdk.StackProps {
  readonly sourceRepositoryName: string;
  readonly sourceBranchName: string;
  readonly managementCrossAccountRoleName: string;
  readonly qualifier?: string;
  readonly managementAccountId?: string;
  readonly managementAccountRoleName?: string;
}

/**
 * TesterPipelineStack class
 */
export class TesterPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TesterPipelineStackProps) {
    super(scope, id, props);

    new TesterPipeline(this, 'TesterPipeline', {
      sourceRepositoryName: props.sourceRepositoryName,
      sourceBranchName: props.sourceBranchName,
      managementCrossAccountRoleName: props.managementCrossAccountRoleName,
      qualifier: props.qualifier,
      managementAccountId: props.managementAccountId,
      managementAccountRoleName: props.managementAccountRoleName,
    });
  }
}
