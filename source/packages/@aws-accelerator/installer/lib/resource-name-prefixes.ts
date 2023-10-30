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

export interface ResourceNamePrefixesProps {
  readonly acceleratorPrefix: string;
  readonly acceleratorQualifier?: string;
}

export class ResourceNamePrefixes extends Construct {
  public readonly acceleratorPrefix: string = '';
  public readonly lowerCasePrefix: string = '';
  public readonly oneWordPrefix: string = '';

  constructor(scope: Construct, id: string, props: ResourceNamePrefixesProps) {
    super(scope, id);

    const pipelineStackVersionSsmParamName = props.acceleratorQualifier
      ? `/accelerator/${props.acceleratorQualifier}-pipeline-stack-${cdk.Stack.of(this).account}-${
          cdk.Stack.of(this).region
        }/version`
      : `/accelerator/AWSAccelerator-PipelineStack-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}/version`;

    const lambdaFunction = new cdk.aws_lambda.Function(this, 'ResourceNamePrefixesFunction', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      description:
        'This function converts accelerator prefix parameter to lower case to name s3 buckets in installer stack',
      code: cdk.aws_lambda.Code.fromInline(`
          const response = require('cfn-response'); 
          const AWS = require('aws-sdk');
          exports.handler = async function (event, context) { 
          console.log(JSON.stringify(event, null, 4)); 
          const prefix=event.ResourceProperties.prefix;
          const pipelineStackVersionSsmParamName=event.ResourceProperties.pipelineStackVersionSsmParamName;
          const lowerCasePrefix=prefix.toLowerCase();
          
          const ssm = new AWS.SSM({});
          
          let data = {};
          
          let paramName = event.ResourceProperties.prefixParameterName;
          
          if (lowerCasePrefix === 'awsaccelerator') {
              data['acceleratorPrefix'] = 'AWSAccelerator';
              data['lowerCasePrefix'] = 'aws-accelerator'; 
              data['oneWordPrefix'] = 'accelerator';               
          } else {
              data['acceleratorPrefix'] = prefix;
              data['lowerCasePrefix'] = lowerCasePrefix; 
              data['oneWordPrefix'] = prefix; 
          }
                  

          if (event.RequestType === 'Update'){

              var params = {
                Name: paramName,
              };
              try {
                  const ssmResponse = await ssm.getParameter(params).promise();
                  // Fail stack if prefix was changed during update
                  if (ssmResponse.Parameter.Value !== prefix) {
                      await response.send(event, context, response.FAILED, {'FailureReason': 'LZA does not allow changing AcceleratorPrefix parameter value after initial deploy !!! Existing prefix: ' + event.OldResourceProperties.prefix + ' New prefix: ' + prefix + '.' }, event.PhysicalResourceId);
                      return;
                  }
                  await response.send(event, context, response.SUCCESS, data, event.PhysicalResourceId);
              } catch (error) {
                  console.log(error);
                  if (error.code === 'ParameterNotFound'){
                      await response.send(event, context, response.FAILED, {'FailureReason': 'LZA prefix ssm parameter ' + paramName + ' not found!!! Recreate the parameter with existing AcceleratorPrefix parameter value to fix the issue'}, event.PhysicalResourceId);
                      return;
                  }
                  else {
                      await response.send(event, context, response.FAILED, {'FailureReason': error.code + ' error occurred while accessing LZA prefix ssm parameter ' + paramName }, event.PhysicalResourceId);
                      return;
                  }
              }          
          } 
          
          if (event.RequestType === 'Create') {
          
              if (lowerCasePrefix !== 'awsaccelerator') {
                  // Fail stack if prefix starts with aws or ssm
                  if (lowerCasePrefix.startsWith('aws') || lowerCasePrefix.startsWith('ssm')) { 
                      await response.send(event, context, response.FAILED, {'FailureReason': 'Accelerator prefix ' + prefix + ' can not be started with aws or ssm !!!'}, event.PhysicalResourceId);
                      return;
                  }

                  // Check if this is an existing deployment and prefix changed with initial deployment of custom resource
                  var versionParams = {
                    Name: pipelineStackVersionSsmParamName,
                  };
                  try {
                    await ssm.getParameter(versionParams).promise();
                    await response.send(event, context, response.FAILED, {'FailureReason': 'Can not change AcceleratorPrefix parameter for existing deployment, existing prefix value is AWSAccelerator, keep AcceleratorPrefix parameter value to default value for successfully stack update !!!'}, event.PhysicalResourceId);
                    return;
                  }
                  catch (error) {
                    console.log(error);
                    if (error.code !== 'ParameterNotFound'){
                      await response.send(event, context, response.FAILED, {'FailureReason': error.code + ' error occurred while accessing LZA ssm parameter ' + pipelineStackVersionSsmParamName }, event.PhysicalResourceId);
                      return;
                    }
                  }
              }
          
              // Create /accelerator/lza-prefix SSM parameter to store prefix value to protect updating prefix
              try {
                  var newParams = {
                        Name: paramName,
                        Value: prefix,
                        Description: 'LZA created SSM parameter for Accelerator prefix value, DO NOT MODIFY/DELETE this parameter',
                        Type: 'String',
                      };
                  await ssm.putParameter(newParams).promise();
                  console.log('LZA prefix parameter ' + paramName  + ' created successfully.');
                  await response.send(event, context, response.SUCCESS, data, event.PhysicalResourceId);
              }
              catch (error) {
                  console.log(error);
                  await response.send(event, context, response.FAILED, {'FailureReason': error.code + ' error occurred while creating LZA prefix ssm parameter ' + paramName }, event.PhysicalResourceId);
                  return;
              }
          }
          if (event.RequestType === 'Delete') {

            var deleteParams = {
              Name: paramName,
            };
            try {
              await ssm.deleteParameter(deleteParams).promise();
              console.log('LZA prefix parameter ' + paramName  + ' deleted successfully.');
            }
            catch (error) {
              console.log(error);
              if (error.code !== 'ParameterNotFound'){
                await response.send(event, context, response.FAILED, {'FailureReason': error.code + ' error occurred while deleting LZA ssm parameter ' + paramName }, event.PhysicalResourceId);
                return;
              }
            }
            await response.send(event, context, response.SUCCESS, {'Status': 'Custom resource deleted successfully' }, event.PhysicalResourceId);
          }
          
          return;
      }`),
    });

    if (props.acceleratorQualifier) {
      lambdaFunction.addToRolePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'SsmReadParameterAccess',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['ssm:GetParameters', 'ssm:GetParameter', 'ssm:PutParameter', 'ssm:DeleteParameter'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:ssm:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:parameter/accelerator/${props.acceleratorQualifier}/lza-prefix`,
            `arn:${cdk.Stack.of(this).partition}:ssm:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:parameter${pipelineStackVersionSsmParamName}`,
          ],
          conditions: {
            StringEquals: {
              'aws:PrincipalAccount': cdk.Stack.of(this).account,
            },
          },
        }),
      );
    } else {
      lambdaFunction.addToRolePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'SsmReadParameterAccess',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['ssm:GetParameters', 'ssm:GetParameter', 'ssm:PutParameter', 'ssm:DeleteParameter'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:ssm:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:parameter/accelerator/lza-prefix`,
            `arn:${cdk.Stack.of(this).partition}:ssm:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:parameter${pipelineStackVersionSsmParamName}`,
          ],
          conditions: {
            StringEquals: {
              'aws:PrincipalAccount': cdk.Stack.of(this).account,
            },
          },
        }),
      );
    }

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

    NagSuppressions.addResourceSuppressions(
      lambdaFunction,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Needed to create SSM parameter for prefix',
        },
      ],
      true,
    );

    const getPrefixResource = new cdk.CustomResource(this, 'GetPrefixResource', {
      serviceToken: lambdaFunction.functionArn,
      properties: {
        prefix: props.acceleratorPrefix,
        pipelineStackVersionSsmParamName: pipelineStackVersionSsmParamName,
        prefixParameterName: props.acceleratorQualifier
          ? `/accelerator/${props.acceleratorQualifier}/lza-prefix`
          : '/accelerator/lza-prefix',
      },
      resourceType: 'Custom::GetPrefixes',
    });

    this.acceleratorPrefix = getPrefixResource.getAtt('acceleratorPrefix').toString();
    this.lowerCasePrefix = getPrefixResource.getAtt('lowerCasePrefix').toString();
    this.oneWordPrefix = getPrefixResource.getAtt('oneWordPrefix').toString();
  }
}
