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
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface ValidateProps {
  readonly useExistingConfigRepo: string;
  readonly existingConfigRepositoryName?: string;
  readonly existingConfigRepositoryBranchName?: string;
}

export class Validate extends Construct {
  public readonly configRepoName: string = '';
  public readonly configRepoBranchName: string = '';

  constructor(scope: Construct, id: string, props: ValidateProps) {
    super(scope, id);

    const lambdaFunction = new cdk.aws_lambda.Function(this, 'ValidationFunction', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      description: 'This function validates installer parameters',
      code: cdk.aws_lambda.Code.fromInline(`
          const response = require('cfn-response'); 
          exports.handler = async function (event, context) { 
          console.log(JSON.stringify(event, null, 4)); 

          const useExistingConfigRepo=event.ResourceProperties.useExistingConfigRepo;
          const existingConfigRepositoryName=event.ResourceProperties.existingConfigRepositoryName;
          const existingConfigRepositoryBranchName=event.ResourceProperties.existingConfigRepositoryBranchName;

          if (useExistingConfigRepo === 'Yes') {
            if (existingConfigRepositoryName === '' || existingConfigRepositoryBranchName === ''){
                await response.send(event, context, response.FAILED, {'FailureReason': 'UseExistingConfigRepo parameter set to Yes, but ExistingConfigRepositoryName or ExistingConfigRepositoryBranchName parameter value missing!!!'}, event.PhysicalResourceId);
                return;
            }
          }

          // End of Validation
          await response.send(event, context, response.SUCCESS, {}, event.PhysicalResourceId);
          return;
      }`),
    });

    NagSuppressions.addResourceSuppressions(
      lambdaFunction,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Needed to write to CWL group',
        },
      ],
      true,
    );

    new cdk.CustomResource(this, 'ValidateResource', {
      serviceToken: lambdaFunction.functionArn,
      properties: {
        useExistingConfigRepo: props.useExistingConfigRepo,
        existingConfigRepositoryName: props.existingConfigRepositoryName,
        existingConfigRepositoryBranchName: props.existingConfigRepositoryBranchName,
        resourceType: 'Custom::ValidateInstallerStack',
      },
    });
  }
}
