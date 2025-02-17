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
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_LAMBDA_RUNTIME } from '../../utils/lib/lambda';

export interface ValidateProps {
  readonly configRepositoryLocation: string;
  readonly acceleratorPipelineName?: string;
}

export class Validate extends Construct {
  constructor(scope: Construct, id: string, props: ValidateProps) {
    super(scope, id);

    const readCodePipelinePolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'ReadCodePipeline',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['codepipeline:GetPipeline'],
      resources: [
        `arn:${cdk.Stack.of(this).partition}:codepipeline:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${
          props.acceleratorPipelineName
        }`,
      ],
    });

    const fileContents = fs.readFileSync(path.join(__dirname, '..', 'lib', 'lambdas/validate/index.js'));

    const lambdaFunction = new cdk.aws_lambda.Function(this, 'ValidationFunction', {
      runtime: DEFAULT_LAMBDA_RUNTIME,
      handler: 'index.handler',
      description: 'This function validates installer parameters',
      initialPolicy: [readCodePipelinePolicy],
      code: new cdk.aws_lambda.InlineCode(fileContents.toString()),
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
        acceleratorPipelineName: props.acceleratorPipelineName,
        configRepositoryLocation: props.configRepositoryLocation,
        resourceType: 'Custom::ValidateInstallerStack',
      },
    });
  }
}
