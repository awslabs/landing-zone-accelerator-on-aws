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

import {
  AliasListEntry,
  KMSClient,
  CreateAliasCommand,
  CreateKeyCommand,
  paginateListAliases,
  PutKeyPolicyCommand,
} from '@aws-sdk/client-kms';

import path from 'path';
import * as winston from 'winston';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

import { PolicyDocument } from '../utils/resources';
import { AssumeRoleCredentialType } from '../../../common/resources';

/**
 * KmsKey abstract class to create AWS Control Tower Landing Zone AWS KMS CMK to encrypt AWS Control Tower Landing Zone resources.
 *
 * @remarks
 * If it does not already exist, an AWS KMS CMK with the alias ```alias/aws-controltower/key``` will be created.
 *
 */
export abstract class KmsKey {
  private static logger: winston.Logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Function to get CMK aliases
   * @param client {@link KMSClient}
   * @returns aliases {@link AliasListEntry}[]
   */
  private static async getAliases(client: KMSClient): Promise<AliasListEntry[]> {
    const aliases: AliasListEntry[] = [];
    const paginator = paginateListAliases({ client: client }, {});
    for await (const page of paginator) {
      for (const alias of page.Aliases ?? []) {
        aliases.push(alias);
      }
    }
    return aliases;
  }
  /**
   * Function to check AWS KMS CMK alias ```alias/aws-controltower/key``` is already used. This alias is reserved for AWS Control Tower Landing Zone CMK created the solution.
   * @param client {@link KMSClient}
   * @param keyAlias string
   * @returns status boolean
   */
  private static async isKeyAliasExists(client: KMSClient, keyAlias: string): Promise<boolean> {
    const aliasItems = await KmsKey.getAliases(client);
    for (const aliasItem of aliasItems) {
      if (aliasItem.AliasName === keyAlias) {
        return true;
      }
    }
    return false;
  }

  /**
   * Function to create AWS Control Tower Landing Zone AWS KMS CMK
   * @param partition string
   * @param accountId string
   * @param region string
   * @returns keyArn string
   * @param solutionId string
   * @param managementAccountCredentials {@link AssumeRoleCredentialType} | undefined
   * @returns keyArn string
   */
  public static async createControlTowerKey(
    partition: string,
    accountId: string,
    region: string,
    solutionId: string,
    managementAccountCredentials?: AssumeRoleCredentialType,
  ): Promise<string> {
    const keyAlias = `alias/aws-controltower/key`;
    const client: KMSClient = new KMSClient({
      region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: managementAccountCredentials,
    });

    if (await KmsKey.isKeyAliasExists(client, keyAlias)) {
      throw new Error(
        `There is already an AWS Control Tower Landing Zone KMS CMK alias named ${keyAlias}. The alias ${keyAlias} is reserved for AWS Control Tower Landing Zone CMK created by the solution, the solution cannot deploy AWS Control Tower Landing Zone.`,
      );
    }

    KmsKey.logger.info(`AWS Control Tower Landing Zone encryption key creation started`);
    const response = await throttlingBackOff(() =>
      client.send(
        new CreateKeyCommand({
          Description: 'AWS Control Tower Landing Zone encryption key',
          KeyUsage: 'ENCRYPT_DECRYPT',
          KeySpec: 'SYMMETRIC_DEFAULT',
        }),
      ),
    );

    const keyId = response.KeyMetadata!.KeyId!;
    const keyArn = response.KeyMetadata!.Arn!;

    KmsKey.logger.info(`AWS Control Tower Landing Zone encryption key creation completed, key arn is ${keyArn}`);

    const keyPolicyJson: PolicyDocument = {
      Version: '2012-10-17',
      Id: 'AWSControlTowerPolicy',
      Statement: [
        {
          Sid: 'Enable IAM User Permissions',
          Effect: 'Allow',
          Principal: {
            AWS: `arn:${partition}:iam::${accountId}:root`,
          },
          Action: 'kms:*',
          Resource: '*',
        },
        {
          Sid: 'Allow CloudTrail to encrypt/decrypt logs',
          Effect: 'Allow',
          Principal: {
            Service: 'cloudtrail.amazonaws.com',
          },
          Action: ['kms:GenerateDataKey*', 'kms:Decrypt'],
          Resource: `${keyArn}`,
          Condition: {
            StringEquals: {
              'AWS:SourceArn': `arn:${partition}:cloudtrail:${region}:${accountId}:trail/aws-controltower-BaselineCloudTrail`,
            },
            StringLike: {
              'kms:EncryptionContext:aws:cloudtrail:arn': `arn:${partition}:cloudtrail:*:${accountId}:trail/*`,
            },
          },
        },
        {
          Sid: 'Allow AWS Config to encrypt/decrypt logs',
          Effect: 'Allow',
          Principal: {
            Service: 'config.amazonaws.com',
          },
          Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
          Resource: `${keyArn}`,
        },
      ],
    };

    await throttlingBackOff(() =>
      client.send(
        new PutKeyPolicyCommand({
          KeyId: keyId,
          PolicyName: 'default',
          Policy: JSON.stringify(keyPolicyJson),
        }),
      ),
    );

    await throttlingBackOff(() =>
      client.send(
        new CreateAliasCommand({
          AliasName: keyAlias,
          TargetKeyId: response.KeyMetadata!.KeyId!,
        }),
      ),
    );

    KmsKey.logger.info(
      `AWS Control Tower Landing Zone encryption key creation completed successfully. Key arn is ${keyArn}`,
    );

    return keyArn;
  }
}
