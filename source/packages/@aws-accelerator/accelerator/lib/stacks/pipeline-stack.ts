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

import * as cdk from '@aws-cdk/core';
import * as pipeline from '../constructs/accelerator-pipeline';
import { InstallerStack } from '@aws-accelerator/installer';

export interface PipelineStackProps extends cdk.StackProps {
  stage: string;
}

export class PipelineStack extends cdk.Stack {
  private readonly repositoryName = new cdk.CfnParameter(this, 'RepositoryName', {
    type: 'AWS::SSM::Parameter::Value<String>',
    default: InstallerStack.REPOSITORY_NAME,
  });

  private readonly repositoryBranchName = new cdk.CfnParameter(this, 'RepositoryBranchName', {
    type: 'AWS::SSM::Parameter::Value<String>',
    default: InstallerStack.REPOSITORY_BRANCH_NAME,
  });

  constructor(scope: cdk.Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    new pipeline.AcceleratorPipeline(this, 'Pipeline', {
      sourceRepositoryName: this.repositoryName.valueAsString,
      sourceBranchName: this.repositoryBranchName.valueAsString,
    });
  }
}
