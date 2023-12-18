/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { setRetryStrategy } from './common-functions';
import { OrganizationsClient } from '@aws-sdk/client-organizations';

/**
 * Sets an SDKv3 Organizations client based on partition
 * @param partition string
 * @param solutionId string | undefined
 * @returns OrganizationsClient
 */
export function setOrganizationsClient(partition: string, solutionId?: string): OrganizationsClient {
  if (partition === 'aws-us-gov') {
    return new OrganizationsClient({
      region: 'us-gov-west-1',
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
    });
  } else if (partition === 'aws-cn') {
    return new OrganizationsClient({
      region: 'cn-northwest-1',
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
    });
  } else {
    return new OrganizationsClient({
      region: 'us-east-1',
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
    });
  }
}
