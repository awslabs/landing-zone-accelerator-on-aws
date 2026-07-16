/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import path from 'path';
import { isDeepStrictEqual } from 'util';

import { IAMClient, PutRolePolicyCommand } from '@aws-sdk/client-iam';
import { GetKeyPolicyCommand, KMSClient, PutKeyPolicyCommand } from '@aws-sdk/client-kms';

import { MODULE_EXCEPTIONS } from '../../../../common/enums';
import { setRetryStrategy } from '../../../../common/functions';
import { createLogger } from '../../../../common/logger';
import { AssumeRoleCredentialType, PolicyDocument, PolicyStatementType } from '../../../../common/resources';
import { throttlingBackOff } from '../../../../common/throttle';
import { getCredentials } from '../../../common/sts-functions';

/**
 * ControlTowerLogAccess abstract class to configure AWS Control Tower centralized log decryption access
 */
export abstract class ControlTowerLogAccess {
  private static logger = createLogger([path.parse(path.basename(__filename)).name]);
  private static readOnlyExecutionRoleName = 'aws-controltower-ReadOnlyExecutionRole';
  private static rolePolicyName = 'AWSAcceleratorControlTowerLogDecryptPolicy';
  private static keyPolicyStatementId = 'AllowControlTowerReadOnlyExecutionRoleToDecryptLogs';

  /**
   * Function to configure the AWS Control Tower read-only role to decrypt centralized log objects
   * @param partition string
   * @param region string
   * @param logArchiveAccountId string
   * @param centralizedLoggingKeyArn string
   * @param solutionId string | undefined
   * @param credentials {@link IAssumeRoleCredential} | undefined
   */
  public static async configure(
    partition: string,
    region: string,
    logArchiveAccountId: string,
    centralizedLoggingKeyArn: string,
    solutionId?: string,
    credentials?: AssumeRoleCredentialType,
  ): Promise<void> {
    const roleArn = `arn:${partition}:iam::${logArchiveAccountId}:role/${ControlTowerLogAccess.readOnlyExecutionRoleName}`;
    const viaService = `s3.${region}.amazonaws.com`;
    const client: KMSClient = new KMSClient({
      region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials,
    });

    try {
      await ControlTowerLogAccess.updateLoggingKeyPolicy(client, centralizedLoggingKeyArn, roleArn, viaService);
    } catch (error) {
      throw ControlTowerLogAccess.getError('Failed to update the AWS Control Tower logging KMS key policy', error);
    }

    try {
      await ControlTowerLogAccess.updateRolePolicy(
        partition,
        region,
        logArchiveAccountId,
        centralizedLoggingKeyArn,
        roleArn,
        viaService,
        solutionId,
        credentials,
      );
    } catch (error) {
      throw ControlTowerLogAccess.getError('Failed to update the AWS Control Tower Log Archive role policy', error);
    }
  }

  /**
   * Function to add or update the LZA-managed statement in the AWS Control Tower logging key policy
   * @param client {@link KMSClient}
   * @param centralizedLoggingKeyArn string
   * @param roleArn string
   * @param viaService string
   */
  private static async updateLoggingKeyPolicy(
    client: KMSClient,
    centralizedLoggingKeyArn: string,
    roleArn: string,
    viaService: string,
  ): Promise<void> {
    const response = await throttlingBackOff(() =>
      client.send(
        new GetKeyPolicyCommand({
          KeyId: centralizedLoggingKeyArn,
          PolicyName: 'default',
        }),
      ),
    );

    if (!response.Policy) {
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetKeyPolicyCommand did not return Policy`);
    }

    const policyDocument = JSON.parse(response.Policy) as Omit<PolicyDocument, 'Statement'> & {
      Statement: PolicyStatementType | PolicyStatementType[];
    };
    const statements = Array.isArray(policyDocument.Statement) ? policyDocument.Statement : [policyDocument.Statement];
    const statement = ControlTowerLogAccess.getLoggingKeyPolicyStatement(roleArn, viaService);
    const statementIndex = statements.findIndex(item => item.Sid === ControlTowerLogAccess.keyPolicyStatementId);

    if (statementIndex >= 0 && ControlTowerLogAccess.arePolicyValuesEqual(statements[statementIndex], statement)) {
      ControlTowerLogAccess.logger.info(`AWS Control Tower logging key policy already grants access to ${roleArn}.`);
      return;
    }

    if (statementIndex >= 0) {
      statements[statementIndex] = statement;
    } else {
      statements.push(statement);
    }

    const parameters = {
      KeyId: centralizedLoggingKeyArn,
      PolicyName: 'default',
      Policy: JSON.stringify({
        ...policyDocument,
        Statement: statements,
      }),
    };
    ControlTowerLogAccess.logger.info(
      `Updating AWS Control Tower logging KMS key policy ${centralizedLoggingKeyArn} to grant decrypt access to ${roleArn}.`,
    );
    await throttlingBackOff(() => client.send(new PutKeyPolicyCommand(parameters)));
  }

  /**
   * Function to attach the AWS KMS identity permission to the AWS Control Tower-managed role in the Log Archive account
   * @param partition string
   * @param region string
   * @param logArchiveAccountId string
   * @param centralizedLoggingKeyArn string
   * @param roleArn string
   * @param viaService string
   * @param solutionId string | undefined
   * @param credentials {@link IAssumeRoleCredential} | undefined
   */
  private static async updateRolePolicy(
    partition: string,
    region: string,
    logArchiveAccountId: string,
    centralizedLoggingKeyArn: string,
    roleArn: string,
    viaService: string,
    solutionId?: string,
    credentials?: AssumeRoleCredentialType,
  ): Promise<void> {
    const logPrefix = `${logArchiveAccountId}:${region}`;
    const sessionPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'iam:PutRolePolicy',
          Resource: roleArn,
        },
      ],
    });
    const logArchiveCredentials = await getCredentials({
      accountId: logArchiveAccountId,
      region,
      partition,
      solutionId,
      assumeRoleName: 'AWSControlTowerExecution',
      credentials,
      sessionPolicy,
      requireSessionPolicy: true,
      logPrefix,
    });

    const client: IAMClient = new IAMClient({
      region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: logArchiveCredentials ?? credentials,
    });
    const policyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowControlTowerLoggingKeyDecryption',
          Effect: 'Allow',
          Action: ['kms:Decrypt'],
          Resource: centralizedLoggingKeyArn,
          Condition: {
            StringEquals: {
              'kms:ViaService': viaService,
            },
          },
        },
      ],
    };

    ControlTowerLogAccess.logger.info(`Attaching ${ControlTowerLogAccess.rolePolicyName} to ${roleArn}.`);
    await throttlingBackOff(() =>
      client.send(
        new PutRolePolicyCommand({
          RoleName: ControlTowerLogAccess.readOnlyExecutionRoleName,
          PolicyName: ControlTowerLogAccess.rolePolicyName,
          PolicyDocument: JSON.stringify(policyDocument),
        }),
      ),
    );
  }

  /**
   * Function to build the AWS KMS key policy statement managed by this class
   * @param roleArn string
   * @param viaService string
   * @returns statement {@link PolicyStatementType}
   */
  private static getLoggingKeyPolicyStatement(roleArn: string, viaService: string): PolicyStatementType {
    return {
      Sid: ControlTowerLogAccess.keyPolicyStatementId,
      Effect: 'Allow',
      Principal: {
        AWS: roleArn,
      },
      Action: ['kms:Decrypt'],
      Resource: '*',
      Condition: {
        StringEquals: {
          'kms:ViaService': viaService,
        },
      },
    };
  }

  /**
   * Function to compare policy values while ignoring object field order, array order, and singleton array representation
   * @param left unknown
   * @param right unknown
   * @returns status boolean
   */
  private static arePolicyValuesEqual(left: unknown, right: unknown): boolean {
    return isDeepStrictEqual(
      ControlTowerLogAccess.normalizePolicyValue(left),
      ControlTowerLogAccess.normalizePolicyValue(right),
    );
  }

  /**
   * Function to normalize semantically equivalent IAM policy JSON representations
   * @param value unknown
   * @returns normalizedValue unknown
   */
  private static normalizePolicyValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      const normalizedValues = value
        .map(item => ControlTowerLogAccess.normalizePolicyValue(item))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
      return normalizedValues.length === 1 ? normalizedValues[0] : normalizedValues;
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nestedValue]) => [key, ControlTowerLogAccess.normalizePolicyValue(nestedValue)]),
      );
    }

    return value;
  }

  /**
   * Function to add operation context while retaining the original SDK error
   * @param message string
   * @param cause unknown
   * @returns error {@link Error}
   */
  private static getError(message: string, cause: unknown): Error {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    return new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ${message}: ${causeMessage}`, { cause });
  }
}
