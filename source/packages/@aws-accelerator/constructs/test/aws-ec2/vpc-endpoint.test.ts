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
import { SecurityGroup } from '../../lib/aws-ec2/vpc';
import { VpcEndpoint, VpcEndpointType } from '../../lib/aws-ec2/vpc-endpoint';
import { snapShotTest } from '../snapshot-test';
import { describe, it, expect } from '@jest/globals';

const testNamePrefix = 'Construct(VpcEndpoint): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

const securityGroup = new SecurityGroup(stack, 'TestSecurityGroup`', {
  securityGroupName: 'TestSecurityGroup',
  description: `AWS Private Endpoint Zone`,
  vpcId: 'Test',
});

/**
 * VpcEndpoint construct test
 */
describe('VpcEndpoint', () => {
  it('vpc gateway end point type test', () => {
    const initialStack = new VpcEndpoint(stack, 'VpcEndpoint', {
      vpcId: 'Test',
      vpcEndpointType: VpcEndpointType.GATEWAY,
      service: 'service',
      subnets: ['Test1', 'Test2'],
      securityGroups: [securityGroup],
      privateDnsEnabled: true,
      policyDocument: new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            sid: 'AccessToTrustedPrincipalsAndResources',
            actions: ['*'],
            effect: cdk.aws_iam.Effect.ALLOW,
            resources: ['*'],
            principals: [new cdk.aws_iam.AnyPrincipal()],
            conditions: {
              StringEquals: {
                'aws:PrincipalOrgID': ['organizationId'],
              },
            },
          }),
        ],
      }),
      routeTables: ['Test1', 'Test2'],
    });
    expect(typeof initialStack.createEndpointRoute('id', '10.100.0.0/16', 'routeTableId')).toBe('undefined');
  });
  it('vpc interface end point type test with sagemaker', () => {
    new VpcEndpoint(stack, 'VpcEndpointInterfaceSagemaker', {
      vpcId: 'Test',
      vpcEndpointType: VpcEndpointType.INTERFACE,
      service: 'notebook',
      subnets: ['Test1', 'Test2'],
      securityGroups: [securityGroup],
      privateDnsEnabled: true,
      policyDocument: new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            sid: 'AccessToTrustedPrincipalsAndResources',
            actions: ['*'],
            effect: cdk.aws_iam.Effect.ALLOW,
            resources: ['*'],
            principals: [new cdk.aws_iam.AnyPrincipal()],
            conditions: {
              StringEquals: {
                'aws:PrincipalOrgID': ['organizationId'],
              },
            },
          }),
        ],
      }),
      routeTables: ['Test1', 'Test2'],
    });
  });
  it('vpc interface end point type test with s3 global access', () => {
    new VpcEndpoint(stack, 'VpcEndpointInterfaceS3', {
      vpcId: 'Test',
      vpcEndpointType: VpcEndpointType.INTERFACE,
      service: 's3-global.accesspoint',
      subnets: ['Test1', 'Test2'],
      securityGroups: [securityGroup],
      privateDnsEnabled: true,
      policyDocument: new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            sid: 'AccessToTrustedPrincipalsAndResources',
            actions: ['*'],
            effect: cdk.aws_iam.Effect.ALLOW,
            resources: ['*'],
            principals: [new cdk.aws_iam.AnyPrincipal()],
            conditions: {
              StringEquals: {
                'aws:PrincipalOrgID': ['organizationId'],
              },
            },
          }),
        ],
      }),
      routeTables: ['Test1', 'Test2'],
    });
  });
  it('vpc interface end point type test with serviceName', () => {
    new VpcEndpoint(stack, 'VpcEndpointInterfaceEc2', {
      vpcId: 'Test',
      vpcEndpointType: VpcEndpointType.INTERFACE,
      serviceName: 'ec2',
      service: 'ec2',
      subnets: ['Test1', 'Test2'],
      securityGroups: [securityGroup],
      privateDnsEnabled: true,
      policyDocument: new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            sid: 'AccessToTrustedPrincipalsAndResources',
            actions: ['*'],
            effect: cdk.aws_iam.Effect.ALLOW,
            resources: ['*'],
            principals: [new cdk.aws_iam.AnyPrincipal()],
            conditions: {
              StringEquals: {
                'aws:PrincipalOrgID': ['organizationId'],
              },
            },
          }),
        ],
      }),
      routeTables: ['Test1', 'Test2'],
    });
  });
  it('vpc interface end point type test with gwlb', () => {
    new VpcEndpoint(stack, 'VpcEndpointInterfaceGwlb', {
      vpcId: 'Test',
      vpcEndpointType: VpcEndpointType.GWLB,
      serviceName: 'ec2',
      service: 'ec2',
      subnets: ['Test1', 'Test2'],
      securityGroups: [securityGroup],
      privateDnsEnabled: true,
      policyDocument: new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            sid: 'AccessToTrustedPrincipalsAndResources',
            actions: ['*'],
            effect: cdk.aws_iam.Effect.ALLOW,
            resources: ['*'],
            principals: [new cdk.aws_iam.AnyPrincipal()],
            conditions: {
              StringEquals: {
                'aws:PrincipalOrgID': ['organizationId'],
              },
            },
          }),
        ],
      }),
      routeTables: ['Test1', 'Test2'],
    });
  });
  snapShotTest(testNamePrefix, stack);
});
