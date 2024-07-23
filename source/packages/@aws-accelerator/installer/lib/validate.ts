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

export interface ValidateProps {
  readonly useExistingConfigRepo: string;
  readonly configRepositoryLocation: string;
  readonly existingConfigRepositoryName?: string;
  readonly existingConfigRepositoryBranchName?: string;
  readonly acceleratorPipelineName?: string;
}

export class Validate extends Construct {
  public readonly configRepoName: string = '';
  public readonly configRepoBranchName: string = '';

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

    const lambdaFunction = new cdk.aws_lambda.Function(this, 'ValidationFunction', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      description: 'This function validates installer parameters',
      initialPolicy: [readCodePipelinePolicy],
      code: cdk.aws_lambda.Code.fromInline(`
          const response = require('cfn-response'); 
          const { CodePipelineClient, GetPipelineCommand } = require("@aws-sdk/client-codepipeline");
          exports.handler = async function (event, context) { 
          console.log(JSON.stringify(event, null, 4)); 

          const useExistingConfigRepo=event.ResourceProperties.useExistingConfigRepo;
          const configRepositoryLocation=event.ResourceProperties.configRepositoryLocation;
          const existingConfigRepositoryName=event.ResourceProperties.existingConfigRepositoryName;
          const existingConfigRepositoryBranchName=event.ResourceProperties.existingConfigRepositoryBranchName;

          if (event.RequestType === 'Delete') {
            await response.send(event, context, response.SUCCESS, {}, event.PhysicalResourceId);
            return;
          }

          if (useExistingConfigRepo === 'Yes') {
            if (existingConfigRepositoryName === '' || existingConfigRepositoryBranchName === ''){
                await response.send(event, context, response.FAILED, {'FailureReason': 'UseExistingConfigRepo parameter set to Yes, but ExistingConfigRepositoryName or ExistingConfigRepositoryBranchName parameter value missing!!!'}, event.PhysicalResourceId);
                return;
            }
          }

          if (configRepositoryLocation === 's3') {
            if (useExistingConfigRepo === 'Yes' || existingConfigRepositoryName !== '' || existingConfigRepositoryBranchName !== ''){
                await response.send(event, context, response.FAILED, {'FailureReason': 'ConfigRepositoryLocation parameter set to s3, but existing configuration repository parameters are populated. Existing repositories can not be used with an S3 configuration repository.'}, event.PhysicalResourceId);
                return;
            }

            try {
                const pipelineName = event.ResourceProperties.acceleratorPipelineName;
                const client = new CodePipelineClient();
                const input = { name: pipelineName };
                const command = new GetPipelineCommand(input);
                const pipelineResponse = await client.send(command);
                const sourceStage = pipelineResponse.pipeline.stages.find(stage => stage.name === 'Source');
                const configAction = sourceStage?.actions.find(action => action.name === 'Configuration');
                if (configAction.actionTypeId.provider === 'CodeCommit') {
                    await response.send(event, context, response.FAILED, {'FailureReason': 'ConfigRepositoryLocation parameter set to s3, but existing deployment using CodeCommit was detected. This value cannot be changed for existing deployments. Please set ConfigRepositoryLocation to CodeCommit and try again.'}, event.PhysicalResourceId);
                    return;
                }
            } catch (err) {
                console.log('Encountered error finding existing pipeline, continuing')
                console.log(err);
                await response.send(event, context, response.SUCCESS, {}, event.PhysicalResourceId); 
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
        acceleratorPipelineName: props.acceleratorPipelineName,
        configRepositoryLocation: props.configRepositoryLocation,
        existingConfigRepositoryName: props.existingConfigRepositoryName,
        existingConfigRepositoryBranchName: props.existingConfigRepositoryBranchName,
        resourceType: 'Custom::ValidateInstallerStack',
      },
    });
  }
}
