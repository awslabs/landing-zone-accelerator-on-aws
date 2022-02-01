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
import * as pipeline from '../pipeline';
import { Construct } from 'constructs';

export interface PipelineStackProps extends cdk.StackProps {
  readonly sourceRepositoryName: string;
  readonly sourceBranchName: string;
  readonly qualifier: string;
  readonly managementAccountId?: string;
  readonly managementAccountRoleName?: string;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // TODO: Add event to launch the Pipeline for new account events
    new pipeline.AcceleratorPipeline(this, 'Pipeline', {
      sourceRepositoryName: props.sourceRepositoryName,
      sourceBranchName: props.sourceBranchName,
      qualifier: props.qualifier,
      managementAccountId: props.managementAccountId,
      managementAccountRoleName: props.managementAccountRoleName,
    });
  }
}
