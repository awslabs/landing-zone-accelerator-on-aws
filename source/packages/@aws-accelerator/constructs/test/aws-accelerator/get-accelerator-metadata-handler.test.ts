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

import { describe, expect, it } from 'vitest';
import { getAllAccountsWithPathsFromDDB } from '../../lib/aws-accelerator/get-accelerator-metadata/index';

describe('get-accelerator-metadata account lifecycle serialization', () => {
  it('keeps the status key while preferring State and falling back to Status', () => {
    const accounts = getAllAccountsWithPathsFromDDB(
      [
        {
          dataType: 'mandatoryAccount',
          acceleratorKey: 'state@example.com',
          awsKey: '111111111111',
          commitId: 'commit',
          ouName: 'Root',
          dataBag: {},
          orgInfo: {
            email: 'state@example.com',
            accountId: '111111111111',
            status: 'PENDING_CLOSURE',
            orgsApiResponse: {
              Id: '111111111111',
              Arn: 'arn:aws:organizations::111111111111:account/o-example/111111111111',
              Email: 'state@example.com',
              Name: 'StateAccount',
              State: 'ACTIVE',
              Status: 'SUSPENDED',
            },
          },
        },
        {
          dataType: 'workloadAccount',
          acceleratorKey: 'legacy@example.com',
          awsKey: '222222222222',
          commitId: 'commit',
          ouName: 'Workloads',
          dataBag: {},
          orgInfo: {
            email: 'legacy@example.com',
            accountId: '222222222222',
            status: 'ACTIVE',
            orgsApiResponse: {
              Id: '222222222222',
              Arn: 'arn:aws:organizations::111111111111:account/o-example/222222222222',
              Email: 'legacy@example.com',
              Name: 'LegacyAccount',
              Status: 'SUSPENDED',
            },
          },
        },
      ],
      [],
    );

    expect(accounts.map(account => account.status)).toEqual(['ACTIVE', 'SUSPENDED']);
  });
});
