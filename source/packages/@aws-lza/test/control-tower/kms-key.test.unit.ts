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

import { describe, beforeEach, expect, test } from '@jest/globals';

import { KmsKey } from '../../lib/control-tower/prerequisites/kms-key';
import { KMSClient, CreateKeyCommand, paginateListAliases, ListAliasesCommand } from '@aws-sdk/client-kms';
import {
  AcceleratorKeyAlias,
  AcceleratorMockClient,
  AccountId,
  AliasFoundError,
  ControlTowerKeyAlias,
  CreateKeyParams,
  InstallerKeyAlias,
  Partition,
  Region,
  SolutionId,
} from '../utils/test-resources';

const client = AcceleratorMockClient(KMSClient);
describe('Success', () => {
  beforeEach(() => {
    client.reset();
  });

  test('Create CMK', async () => {
    client.on(ListAliasesCommand, {}).resolves({
      Aliases: [AcceleratorKeyAlias, InstallerKeyAlias],
    });
    const aliases: string[] = [];
    const paginator = paginateListAliases({ client: new KMSClient({}), pageSize: 1 }, {});
    for await (const page of paginator) {
      for (const alias of page.Aliases ?? []) {
        aliases.push(alias.AliasName!);
      }
    }
    client.on(CreateKeyCommand, CreateKeyParams).resolves({
      KeyMetadata: { KeyId: 'key-id', Arn: `arn:${Partition}:kms:${Region}:${AccountId}:key/key-id` },
    });

    const keyArn = await KmsKey.createControlTowerKey(Partition, AccountId, Region, SolutionId);

    expect(keyArn).toStrictEqual(`arn:${Partition}:kms:${Region}:${AccountId}:key/key-id`);
  });
});

describe('Failure', () => {
  beforeEach(() => {
    client.reset();
  });

  test('Existing alias found', async () => {
    client.on(ListAliasesCommand, {}).resolves({
      Aliases: [AcceleratorKeyAlias, InstallerKeyAlias, ControlTowerKeyAlias],
    });
    const aliases: string[] = [];
    const paginator = paginateListAliases({ client: new KMSClient({}), pageSize: 1 }, {});
    for await (const page of paginator) {
      for (const alias of page.Aliases ?? []) {
        aliases.push(alias.AliasName!);
      }
    }

    await expect(KmsKey.createControlTowerKey(Partition, AccountId, Region, SolutionId)).rejects.toThrow(
      AliasFoundError,
    );
  });
});
