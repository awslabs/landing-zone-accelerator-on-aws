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

import path from 'path';
import * as fs from 'fs';

import { ManifestType, TestEnvironmentManifestType, TestEnvironmentType } from './types';
import { createLogger } from '../../common/logger';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { getCredentials, setRetryStrategy } from '../../common/functions';
import { throttlingBackOff } from '../../common/throttle';
import { IAssumeRoleCredential } from '../../common/resources';
import { Assertion } from './assertion';

export enum EnvironmentErrors {
  MISSING_DEPENDENCIES = 'TestEnvironmentMissingDependencies',
}

/**
 * Accelerator integration test class.
 *
 * @description
 * This class is used to configure integration test environment.
 */
export class IntegrationTest {
  /**
   * Integration test environment details
   */
  public environment: TestEnvironmentType;

  /**
   * Assertion
   */
  public assertion: Assertion;

  private readonly environmentManifest: ManifestType;

  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  constructor() {
    //
    // Get test environment
    //
    this.environment = this.getEnvironment();

    //
    // Initialize assertion
    //
    this.assertion = new Assertion();

    const testEnvStringMessage = `[${this.environment.accountId}:${this.environment.partition}:${this.environment.region}]`;

    this.logger.info(`Test environment is ${testEnvStringMessage}`);

    //
    // Get tests environment manifest
    //
    this.environmentManifest = this.getEnvironmentManifest();

    //
    // Load manifest account details into environment
    //
    this.environment.accounts = this.environmentManifest.accounts;
  }

  public async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Function to setup integration test environment.
   *
   * @description
   * This function performs following actions to prepare integration test environment.
   *
   * - Generate integration test role STS credentials
   * - Create integration test executor IAM role
   * - Configure integration test executor IAM role with required permission
   * - Generate integration test executor IAM role STS credentials
   */
  public async prepare(): Promise<void> {
    //
    // Generate integration test role STS credentials
    //
    const client = new STSClient({
      region: this.environment.region,
      customUserAgent: this.environment.solutionId,
      retryStrategy: setRetryStrategy(),
    });

    this.environment.integrationAccountStsCredentials = undefined;
    const insideIntegrationAccount = await this.isInsideIntegrationAccount(client);

    if (!insideIntegrationAccount) {
      this.environment.integrationAccountStsCredentials = await this.getIntegrationAccountCredentials(
        this.environment.integrationAccountIamRoleArn,
      );
    }

    this.logger.info(`Successfully received test executor STS credentials`);
  }

  public getAccountId(accountName: string): string {
    const accountId = this.environment.accounts?.find(item => item.name === accountName)?.id;
    if (!accountId) {
      throw new Error(`Missing "${accountName}" account details for environment ${this.environment.name}`);
    }
    return accountId;
  }

  /**
   * Function to check if already in integration account
   * @param client {@link STSClient}
   * @returns status boolean
   */
  private async isInsideIntegrationAccount(client: STSClient): Promise<boolean> {
    this.logger.info(`Checking if already inside integration account`);
    const currentAccountId = await this.getCurrentSessionAccountId(client);
    return currentAccountId === this.environment.accountId;
  }

  /**
   * Function to get integration account sts Credentials
   * @param client {@link STSClient}
   * @param roleArn string
   * @returns credentials {@link IAssumeRoleCredential}
   */
  private async getIntegrationAccountCredentials(roleArn: string): Promise<IAssumeRoleCredential | undefined> {
    this.logger.info(`Getting STS credentials for the integration account role ${roleArn}`);
    const credentials = await getCredentials({
      accountId: this.environment.accountId,
      region: this.environment.region,
      assumeRoleArn: roleArn,
      solutionId: this.environment.solutionId,
      credentials: this.environment.integrationAccountStsCredentials,
    });

    return credentials;
  }

  /**
   * Function to get current session account Id
   * @param client {@link STSClient}
   * @returns accountId string
   */
  private async getCurrentSessionAccountId(client: STSClient): Promise<string> {
    this.logger.info(`Checking current session account id`);

    const response = await throttlingBackOff(() => client.send(new GetCallerIdentityCommand({})));

    const accountId = response.Account;

    if (!accountId) {
      throw new Error(`Unable to execute GetCallerIdentity API to get current session account id.`);
    }
    this.logger.info(`Current session account id is ${accountId}`);

    return accountId;
  }

  /**
   * Function to get test environment
   */
  private getEnvironment(): TestEnvironmentType {
    this.logger.info(`Preparing test environment variables`);

    const environmentName = process.env['ENV_NAME'];
    const partition = process.env['PARTITION'];
    const accountId = process.env['ACCOUNT_ID'];
    const region = process.env['AWS_DEFAULT_REGION'];

    // Validating essential environment configuration variables
    if (!environmentName || !accountId || !partition || !region) {
      throw new Error(`Missing required environment variables (ACCOUNT_ID, PARTITION, AWS_DEFAULT_REGION, ENV_NAME)`);
    }

    return {
      name: environmentName,
      partition,
      accountId,
      region,
      integrationAccountIamRoleArn: `arn:${partition}:iam::${accountId}:role/LzaIntegrationTestRole`,
      solutionId: `Accelerator-IntegrationTest-SO0199`,
    };
  }

  /**
   * Function to get test environment manifest
   */
  private getEnvironmentManifest(): ManifestType {
    if (!process.env['ENV_MANIFEST']) {
      throw new Error(`Missing environment variable ENV_MANIFEST`);
    }

    // Set environment variable for the test input file name variable
    const envManifestFilePath = process.env['ENV_MANIFEST'];

    //
    // Process environment manifest file
    //
    if (!fs.existsSync(envManifestFilePath)) {
      throw new Error(`Test environment file not found`);
    }

    this.logger.info(`Loading test environment manifest from ${envManifestFilePath} file`);
    const fileContent = fs.readFileSync(envManifestFilePath, 'utf-8');
    const testEnvironmentManifest: TestEnvironmentManifestType = JSON.parse(fileContent);
    this.logger.info(`Loaded test environment manifest`);

    for (const environment of testEnvironmentManifest.environments) {
      if (environment.name === this.environment.name && environment.partition === this.environment.partition) {
        const managementAccountId = environment.accounts.find(item => item.name === 'Management')?.id;

        if (!managementAccountId) {
          throw new Error(`Missing management account details for test environment ${environment.name}`);
        }
        return environment;
      }
    }
    throw new Error(`Missing test environment [${this.environment.name}:${this.environment.partition}]`);
  }
}
