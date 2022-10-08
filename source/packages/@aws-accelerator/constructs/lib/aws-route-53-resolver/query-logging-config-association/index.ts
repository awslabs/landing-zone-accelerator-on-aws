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

import * as AWS from 'aws-sdk';

import { throttlingBackOff } from '@aws-accelerator/utils';

AWS.config.logger = console;

/**
 * query-logging-config-association - Lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  interface ResolverQueryLogConfigAssociation {
    ResolverQueryLogConfigId: string;
    VpcId: string;
  }

  const resolverQueryLogConfigAssociation = event.ResourceProperties as unknown as ResolverQueryLogConfigAssociation;

  const { ResolverQueryLogConfigId, VpcId } = resolverQueryLogConfigAssociation;
  const route53ResolverClient = new AWS.Route53Resolver();

  switch (event.RequestType) {
    case 'Update':
    case 'Create':
      console.log(`Associating Route53 resolver query log config ${ResolverQueryLogConfigId} to VPC ${VpcId}`);
      const data = await throttlingBackOff(() =>
        route53ResolverClient
          .associateResolverQueryLogConfig({
            ResolverQueryLogConfigId: ResolverQueryLogConfigId,
            ResourceId: VpcId,
          })
          .promise(),
      );
      return {
        PhysicalResourceId: data.ResolverQueryLogConfigAssociation?.Id,
        Status: 'SUCCESS',
      };
    case 'Delete':
      console.log(`Disassociating Route53 resolver query log config ${ResolverQueryLogConfigId} to VPC ${VpcId}`);
      await throttlingBackOff(() =>
        route53ResolverClient
          .disassociateResolverQueryLogConfig({
            ResolverQueryLogConfigId: ResolverQueryLogConfigId,
            ResourceId: VpcId,
          })
          .promise(),
      );
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
      console.log(
        `Updating Route53 resolver query log config assocation for config ${ResolverQueryLogConfigId} to VPC ${VpcId}`,
      );
  }
}
