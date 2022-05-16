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
AWS.config.logger = console;
/**
 * secret rotation - lambda handler
 *
 * @param event
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(event: any): Promise<any> {
  const secretId = event['SecretId'];
  const token = event['ClientRequestToken'];
  const step = event['Step'];

  const userName = process.env['userName']!;

  const secretManager = new AWS.SecretsManager({});
  const metadata: AWS.SecretsManager.DescribeSecretResponse = await secretManager
    .describeSecret({ SecretId: secretId })
    .promise();

  if (!metadata.RotationEnabled) {
    throw new Error(`Secret ${secretId} is not enabled for rotation.`);
  }

  const versions = metadata.VersionIdsToStages;

  if (versions) {
    if (!versions[token]) {
      throw new Error(`Secret version ${token} has no stage for rotation of secret ${secretId}.`);
    }

    if (versions[token].includes('AWSCURRENT')) {
      console.warn(`Secret version ${versions} already set as AWSCURRENT for secret ${secretId}.`);
    }

    if (!versions[token].includes('AWSPENDING')) {
      console.warn(`Secret version ${versions} not set as AWSPENDING for rotation of secret ${secretId}.`);
    }

    if (step === 'createSecret') {
      await createSecret(secretManager, secretId, token, userName);
      return;
    }

    if (step === 'setSecret') {
      await setSecret(secretManager, secretId, token, userName);
      return;
    }

    if (step === 'testSecret') {
      // TODO Are there any user password connection test needed
      return;
    }

    if (step === 'finishSecret') {
      await finishSecret(secretManager, secretId, token, metadata);
      return;
    }
  }
}

/**
 * Function to handle createSecret step
 * @param secretManager
 * @param secretId
 * @param token
 * @param userName
 */
async function createSecret(
  secretManager: AWS.SecretsManager,
  secretId: string,
  token: string,
  userName: string,
): Promise<void> {
  // Make sure the current secret exists
  await secretManager.getSecretValue({ SecretId: secretId, VersionStage: 'AWSCURRENT' }).promise();

  // Now try to get the secret version, if that fails, put a new secret
  try {
    await secretManager.getSecretValue({ SecretId: secretId, VersionStage: 'AWSPENDING', VersionId: token }).promise();
    console.log(`createSecret: Successfully retrieved secret for ${secretId}.`);
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    if (
      // SDKv2 Error Structure
      e.code === 'ResourceNotFoundException' ||
      // SDKv3 Error Structure
      e.name === 'ResourceNotFoundException'
    ) {
      // Generate randomPassword
      const randomPassword = await secretManager.getRandomPassword({}).promise();

      await secretManager
        .putSecretValue({
          SecretId: secretId,
          SecretString: JSON.stringify({ username: userName, password: randomPassword.RandomPassword }),
          VersionStages: ['AWSPENDING'],
          ClientRequestToken: token,
        })
        .promise();
      console.log(`createSecret: Successfully put secret for ARN ${secretId} and version ${token}."`);
    }
  }
}

/**
 * Function to handle setSecret step
 * @param secretManager
 * @param secretId
 * @param token
 * @param userName
 */
async function setSecret(
  secretManager: AWS.SecretsManager,
  secretId: string,
  token: string,
  userName: string,
): Promise<void> {
  const pendingSecretObject = await secretManager
    .getSecretValue({ SecretId: secretId, VersionStage: 'AWSPENDING', VersionId: token })
    .promise();
  const pendingSecret = JSON.parse(pendingSecretObject.SecretString!);

  let response = await updateUserProfile(userName, pendingSecret['password']);
  while (response !== 200) {
    console.warn(`updateUserProfile: EntityTemporarilyUnmodifiable, retry after 1000 ms.`);
    await delay(1000);
    response = await updateUserProfile(userName, pendingSecret['password']);
  }
}

/**
 * Function to updaye user profile
 * @param userName
 * @param password
 */
async function updateUserProfile(userName: string, password: string): Promise<number> {
  // Change user password
  const iam = new AWS.IAM();
  try {
    const response = await iam.updateLoginProfile({ UserName: userName, Password: password }).promise();
    return response.$response.httpResponse.statusCode;
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    if (
      // SDKv2 Error Structure
      e.code === 'EntityTemporarilyUnmodifiable' ||
      // SDKv3 Error Structure
      e.name === 'EntityTemporarilyUnmodifiable'
    ) {
      return 409; // Error code for EntityTemporarilyUnmodifiable
    } else {
      throw new Error(`updateLoginProfile issue for user ${userName}, error message - ${e}`);
    }
  }
}

/**
 * Function to handle finishSecret step
 * @param secretManager
 * @param secretId
 * @param token
 * @param metadata
 */
async function finishSecret(
  secretManager: AWS.SecretsManager,
  secretId: string,
  token: string,
  metadata: AWS.SecretsManager.DescribeSecretResponse,
): Promise<void> {
  let currentVersion = undefined;

  for (const version in metadata.VersionIdsToStages) {
    if (metadata.VersionIdsToStages[version].includes('AWSCURRENT')) {
      currentVersion = version;
      break;
    }
  }

  // Finalize by staging the secret version current
  await secretManager
    .updateSecretVersionStage({
      SecretId: secretId,
      VersionStage: 'AWSCURRENT',
      MoveToVersionId: token,
      RemoveFromVersionId: currentVersion,
    })
    .promise();

  console.log(`finishSecret: Successfully set AWSCURRENT stage to version ${token} for secret ${secretId}.`);
}

/**
 * Sleep function
 * @param ms
 */
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
