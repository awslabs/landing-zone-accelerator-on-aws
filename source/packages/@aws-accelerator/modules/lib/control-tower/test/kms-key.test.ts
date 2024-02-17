import { describe, beforeEach, expect, test } from '@jest/globals';

import { KmsKey } from '../prerequisites/kms-key';
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
} from './utils/test-resources';

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
