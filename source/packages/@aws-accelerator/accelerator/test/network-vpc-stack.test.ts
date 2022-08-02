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

import {
  AccountsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { NetworkVpcStack } from '../lib/stacks/network-vpc-stack';

const testNamePrefix = 'Construct(NetworkVpcStack): ';

/**
 * NetworkVpcStack
 */
const app = new cdk.App({
  context: { 'config-dir': path.join(__dirname, 'configs/all-enabled') },
});
const configDirPath = app.node.tryGetContext('config-dir');

const props: AcceleratorStackProps = {
  configDirPath,
  accountsConfig: AccountsConfig.load(configDirPath),
  globalConfig: GlobalConfig.load(configDirPath),
  iamConfig: IamConfig.load(configDirPath),
  networkConfig: NetworkConfig.load(configDirPath),
  organizationConfig: OrganizationConfig.load(configDirPath),
  securityConfig: SecurityConfig.load(configDirPath),
  partition: 'aws',
};

/**
 * Build all related stacks
 */
const stacks = new Map<string, NetworkVpcStack>();

for (const region of props.globalConfig.enabledRegions) {
  for (const account of [...props.accountsConfig.mandatoryAccounts, ...props.accountsConfig.workloadAccounts]) {
    const accountId = props.accountsConfig.getAccountId(account.name);

    stacks.set(
      `${account.name}-${region}`,
      new NetworkVpcStack(app, `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC]}-${accountId}-${region}`, {
        env: {
          account: accountId,
          region,
        },
        ...props,
      }),
    );
  }
}

/**
 * NetworkVpcStack construct test
 */
describe('NetworkVpcStack', () => {
  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).resourceCountIs('AWS::Lambda::Function', 2);
  });

  // /**
  //  * Number of Lambda function IAM role resource test
  //  */
  // test(`${testNamePrefix} Lambda function IAM role resource count test`, () => {
  //   cdk.assertions.Template.fromStack(managementStack).resourceCountIs('AWS::IAM::Role', 2);
  // });

  // /**
  //  * Number of DeleteDefaultVpc custom resource test
  //  */
  // test(`${testNamePrefix} DeleteDefaultVpc custom resource count test`, () => {
  //   cdk.assertions.Template.fromStack(managementStack).resourceCountIs('Custom::DeleteDefaultVpc', 1);
  // });

  // /**
  //  * Number of SSM parameter resource test
  //  */
  // test(`${testNamePrefix} SSM parameter custom resource count test`, () => {
  //   cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SSM::Parameter', 2);
  // });

  // /**
  //  * Number of Prefix Lists resource test
  //  */
  // test(`${testNamePrefix} Prefix List custom resource count test`, () => {
  //   cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::PrefixList', 1);
  // });

  // /**
  //  * Lambda function CustomDeleteDefaultVpcCustomResourceProviderHandler resource configuration test
  //  */
  // test(`${testNamePrefix} Lambda function CustomDeleteDefaultVpcCustomResourceProviderHandler resource configuration test`, () => {
  //   cdk.assertions.Template.fromStack(managementStack).templateMatches({
  //     Resources: {
  //       CustomDeleteDefaultVpcCustomResourceProviderHandler87E89F35: {
  //         Type: 'AWS::Lambda::Function',
  //         DependsOn: ['CustomDeleteDefaultVpcCustomResourceProviderRole80963EEF'],
  //         Properties: {
  //           Code: {
  //             S3Bucket: 'cdk-hnb659fds-assets-111111111111-us-east-1',
  //           },
  //           Handler: '__entrypoint__.handler',
  //           MemorySize: 128,
  //           Role: {
  //             'Fn::GetAtt': ['CustomDeleteDefaultVpcCustomResourceProviderRole80963EEF', 'Arn'],
  //           },
  //           Runtime: 'nodejs14.x',
  //           Timeout: 900,
  //         },
  //       },
  //     },
  //   });
  // });

  // /**
  //  * Lambda function IAM role CustomDeleteDefaultVpcCustomResourceProviderRole resource configuration test
  //  */
  // test(`${testNamePrefix} Lambda function IAM role CustomDeleteDefaultVpcCustomResourceProviderRole resource configuration test`, () => {
  //   cdk.assertions.Template.fromStack(managementStack).templateMatches({
  //     Resources: {
  //       CustomDeleteDefaultVpcCustomResourceProviderRole80963EEF: {
  //         Type: 'AWS::IAM::Role',
  //         Properties: {
  //           AssumeRolePolicyDocument: {
  //             Statement: [
  //               {
  //                 Action: 'sts:AssumeRole',
  //                 Effect: 'Allow',
  //                 Principal: {
  //                   Service: 'lambda.amazonaws.com',
  //                 },
  //               },
  //             ],
  //             Version: '2012-10-17',
  //           },
  //           ManagedPolicyArns: [
  //             {
  //               'Fn::Sub': 'arn:${AWS::Partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
  //             },
  //           ],
  //           Policies: [
  //             {
  //               PolicyDocument: {
  //                 Statement: [
  //                   {
  //                     Action: [
  //                       'ec2:DeleteInternetGateway',
  //                       'ec2:DetachInternetGateway',
  //                       'ec2:DeleteNetworkAcl',
  //                       'ec2:DeleteRoute',
  //                       'ec2:DeleteSecurityGroup',
  //                       'ec2:DeleteSubnet',
  //                       'ec2:DeleteVpc',
  //                       'ec2:DescribeInternetGateways',
  //                       'ec2:DescribeNetworkAcls',
  //                       'ec2:DescribeRouteTables',
  //                       'ec2:DescribeSecurityGroups',
  //                       'ec2:DescribeSubnets',
  //                       'ec2:DescribeVpcs',
  //                     ],
  //                     Effect: 'Allow',
  //                     Resource: '*',
  //                   },
  //                 ],
  //                 Version: '2012-10-17',
  //               },
  //               PolicyName: 'Inline',
  //             },
  //           ],
  //         },
  //       },
  //     },
  //   });
  // });

  // /**
  //  * DeleteDefaultVpc custom resource configuration test
  //  */
  // test(`${testNamePrefix} DeleteDefaultVpc custom resource configuration test`, () => {
  //   cdk.assertions.Template.fromStack(managementStack).templateMatches({
  //     Resources: {
  //       DeleteDefaultVpc4DBAE36C: {
  //         Type: 'Custom::DeleteDefaultVpc',
  //         UpdateReplacePolicy: 'Delete',
  //         DeletionPolicy: 'Delete',
  //         Properties: {
  //           ServiceToken: {
  //             'Fn::GetAtt': ['CustomDeleteDefaultVpcCustomResourceProviderHandler87E89F35', 'Arn'],
  //           },
  //         },
  //       },
  //     },
  //   });
  // });

  // /**
  //  * SSM parameter SsmParamStackId resource configuration test
  //  */
  // test(`${testNamePrefix} SSM parameter SsmParamStackId resource configuration test`, () => {
  //   cdk.assertions.Template.fromStack(managementStack).templateMatches({
  //     Resources: {
  //       SsmParamStackId521A78D3: {
  //         Type: 'AWS::SSM::Parameter',
  //         Properties: {
  //           Name: '/accelerator/AWSAccelerator-NetworkVpcStack-111111111111-us-east-1/stack-id',
  //           Type: 'String',
  //           Value: {
  //             Ref: 'AWS::StackId',
  //           },
  //         },
  //       },
  //     },
  //   });
  // });
});
