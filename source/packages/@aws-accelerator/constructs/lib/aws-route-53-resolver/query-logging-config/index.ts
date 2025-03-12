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

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  CreateResolverQueryLogConfigCommand,
  DeleteResolverQueryLogConfigCommand,
  Route53ResolverClient,
} from '@aws-sdk/client-route53resolver';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * query-logging-config - Lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
      Data?: {
        attrArn: string | undefined;
        attrId: string | undefined;
      };
    }
  | undefined
> {
  interface ResolverQueryLogConfig {
    Name: string;
    DestinationArn: string;
    CreatorRequestId?: string;
    Tags?: [] | undefined;
  }

  const resolverQueryLogConfig = event.ResourceProperties as unknown as ResolverQueryLogConfig;
  if (!resolverQueryLogConfig.CreatorRequestId) {
    resolverQueryLogConfig.CreatorRequestId = Date.now().toString();
  }

  const { Name, DestinationArn, CreatorRequestId, Tags } = resolverQueryLogConfig;
  const resolverClient = new Route53ResolverClient({
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Update':
    case 'Create':
      console.log(`Creating Route53 resolver query log config ${resolverQueryLogConfig.Name}`);
      const data = await throttlingBackOff(() =>
        resolverClient.send(
          new CreateResolverQueryLogConfigCommand({
            Name,
            DestinationArn,
            CreatorRequestId,
            Tags,
          }),
        ),
      );
      console.log(`Route53 resolver query log config created: ${data.ResolverQueryLogConfig?.Id}`);
      return {
        PhysicalResourceId: data.ResolverQueryLogConfig?.Id,
        Status: 'SUCCESS',
        Data: {
          attrArn: data.ResolverQueryLogConfig?.Arn,
          attrId: data.ResolverQueryLogConfig?.Id,
        },
      };
    case 'Delete':
      console.log(`Deleting Route53 resolver query log config ${event.PhysicalResourceId}`);
      await throttlingBackOff(() =>
        resolverClient.send(
          new DeleteResolverQueryLogConfigCommand({
            ResolverQueryLogConfigId: event.PhysicalResourceId,
          }),
        ),
      );
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
