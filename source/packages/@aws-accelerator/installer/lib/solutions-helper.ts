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

import * as lambda from 'aws-cdk-lib/aws-lambda';

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface SolutionHelperProps {
  readonly solutionId: string;
  readonly repositorySource: cdk.CfnParameter;
  readonly repositoryOwner: cdk.CfnParameter;
  readonly repositoryBranchName: cdk.CfnParameter;
  readonly repositoryName: cdk.CfnParameter;
}

export class SolutionHelper extends Construct {
  constructor(scope: Construct, id: string, props: SolutionHelperProps) {
    super(scope, id);
    const metricsMapping = new cdk.CfnMapping(this, 'AnonymousData', {
      mapping: {
        SendAnonymousData: {
          Data: 'Yes',
        },
      },
    });

    const metricsCondition = new cdk.CfnCondition(this, 'AnonymousDataToAWS', {
      expression: cdk.Fn.conditionEquals(metricsMapping.findInMap('SendAnonymousData', 'Data'), 'Yes'),
    });

    const helperFunction = new lambda.Function(this, 'SolutionHelper', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      description:
        'This function generates UUID for each deployment and sends anonymous data to the AWS Solutions team',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const response = require('cfn-response');
        const https = require('https');

        async function post(url, data) {
          const dataString = JSON.stringify(data)
          const options = {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              timeout: 1000, // in ms
          }
          
          return new Promise((resolve, reject) => {
              const req = https.request(url, options, (res) => {
                  if (res.statusCode < 200 || res.statusCode > 299) {
                      return reject(new Error('HTTP status code: ', res.statusCode))
                  }
                  const body = []
                  res.on('data', (chunk) => body.push(chunk))
                  res.on('end', () => {
                      const resString = Buffer.concat(body).toString()
                      resolve(resString)
                  })
              })
              req.on('error', (err) => {
                  reject(err)
              })
              req.on('timeout', () => {
                  req.destroy()
                  reject(new Error('Request time out'))
              })
              req.write(dataString)
              req.end()
          })
        }

        function uuidv4() {
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
              var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
              return v.toString(16);
          });
        }


        function sanitizeData(resourceProperties) {
          const keysToExclude = ['ServiceToken', 'Resource', 'SolutionId', 'UUID'];
          return Object.keys(resourceProperties).reduce((sanitizedData, key) => {
              if (!keysToExclude.includes(key)) {
                  sanitizedData[key] = resourceProperties[key];
              }
              return sanitizedData;
          }, {})
        }

        exports.handler = async function (event, context) {
          console.log(JSON.stringify(event, null, 4));
          const requestType = event.RequestType;
          const resourceProperties = event.ResourceProperties;
          const resource = resourceProperties.Resource;
          let data = {};
          try {
              if (resource === 'UUID' && requestType === 'Create') {
                  data['UUID'] = uuidv4();
              }
              if (resource === 'AnonymousMetric') {
                  const currentDate = new Date()
                  data = sanitizeData(resourceProperties);
                  data['RequestType'] = requestType;
                  const payload = {
                      Solution: resourceProperties.SolutionId,
                      UUID: resourceProperties.UUID,
                      TimeStamp: currentDate.toISOString(),
                      Data: data
                  }

                  console.log('Sending metrics data: ', JSON.stringify(payload, null, 2));
                  await post('https://metrics.awssolutionsbuilder.com/generic', payload);
                  console.log('Sent Data');
              }
          } catch (error) {
              console.log(error);
          }
      
          if (requestType === 'Create') {
            await response.send(event, context, response.SUCCESS, data);
          }
          else {
            await response.send(event, context, response.SUCCESS, data, event.PhysicalResourceId);
          }
          return;
        } 
      `),
      timeout: cdk.Duration.seconds(30),
    });

    NagSuppressions.addResourceSuppressions(
      helperFunction,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Needed to write to CWL group',
        },
      ],
      true,
    );

    const cfnLambdaFunction = helperFunction.node.findChild('Resource') as lambda.CfnFunction;
    cfnLambdaFunction.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W58',
            reason: `CloudWatch Logs are enabled in AWSLambdaBasicExecutionRole`,
          },
          {
            id: 'W89',
            reason: `This function supports infrastructure deployment and is not deployed inside a VPC.`,
          },
          {
            id: 'W92',
            reason: `This function supports infrastructure deployment and does not require setting ReservedConcurrentExecutions.`,
          },
        ],
      },
    };

    const createIdFunction = new cdk.CustomResource(this, 'SolutionCreateUniqueID', {
      serviceToken: helperFunction.functionArn,
      properties: {
        Resource: 'UUID',
      },
      resourceType: 'Custom::CreateUUID',
    });

    const sendDataFunction = new cdk.CustomResource(this, 'SolutionSendAnonymousData', {
      serviceToken: helperFunction.functionArn,
      properties: {
        Resource: 'AnonymousMetric',
        SolutionId: props.solutionId,
        UUID: createIdFunction.getAttString('UUID'),
        Region: cdk.Aws.REGION,
        BranchName: props.repositoryBranchName.valueAsString,
        RepositoryName: props.repositoryName.valueAsString,
        RepositoryOwner: props.repositoryOwner.valueAsString,
        RepositorySource: props.repositorySource.valueAsString,
      },
      resourceType: 'Custom::AnonymousData',
    });

    (helperFunction.node.defaultChild as lambda.CfnFunction).cfnOptions.condition = metricsCondition;
    (createIdFunction.node.defaultChild as lambda.CfnFunction).cfnOptions.condition = metricsCondition;
    (sendDataFunction.node.defaultChild as lambda.CfnFunction).cfnOptions.condition = metricsCondition;
  }
}
