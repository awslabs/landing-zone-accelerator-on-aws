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

import * as AWS from 'aws-sdk';
import * as uuid from 'uuid';

import {
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  DetachRolePolicyCommand,
  IAMClient,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

import { createLogger } from '../../logger';
import { delay, throttlingBackOff } from '../../throttle';
import { PolicyStatementType } from '../../common-resources';
import { getGlobalRegion, setRetryStrategy } from '../../common-functions';

import {
  AcceleratorIntegrationTestResources,
  ManifestType,
  TestEnvironmentManifestType,
  TestEnvironmentType,
} from './resources';

import { Assertion } from './assertion';

/**
 * Accelerator integration test props interface
 */
export interface IntegrationTestProps {
  /**
   * Integration test executor IAM Role permission policy statements
   */
  executorRolePolicyStatements: PolicyStatementType[];
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

  private props: IntegrationTestProps;

  private environmentManifest: ManifestType;
  private executorRoleName: string;

  private logger = createLogger([path.parse(path.basename(__filename)).name]);

  constructor(props: IntegrationTestProps) {
    //
    // Initialize properties
    //
    this.props = props;

    //
    // Initialize assertion
    //
    this.assertion = new Assertion();

    //
    // Get test environment
    //
    this.environment = this.getEnvironment();
    const testEnvStringMessage = `[${this.environment.accountId}:${this.environment.partition}:${this.environment.region}:global-region:${this.environment.globalRegion}]`;

    this.executorRoleName = `${this.environment.region}-integ-test-role-${uuid.v4()}`;

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
      globalRegion: getGlobalRegion(partition),
      integrationAccountIamRoleArn: `arn:${partition}:iam::${accountId}:role/${AcceleratorIntegrationTestResources.integrationAccountRoleName}`,
      solutionId: `InteTest-SO0199`,
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
   * Function to check if already in integration account
   * @param client {@link STSClient}
   * @returns status boolean
   */
  public async isInsideIntegrationAccount(client: STSClient): Promise<boolean> {
    this.logger.info(`Checking if already inside integration account`);
    const currentAccountId = await this.getCurrentSessionAccountId(client);
    return currentAccountId === this.environment.accountId;
  }

  public getAccountId(accountName: string): string {
    const accountId = this.environment.accounts?.find(item => item.name === accountName)?.id;
    if (!accountId) {
      throw new Error(`Missing "${accountName}" account details for environment ${this.environment.name}`);
    }
    return accountId;
  }

  /**
   * Function to setup integration test environment.
   *
   * @description
   * This function performs following actions to setup integration test environment.
   *
   * - Generate integration test role STS credentials
   * - Create integration test executor IAM role
   * - Configure integration test executor IAM role with required permission
   * - Generate integration test executor IAM role STS credentials
   */
  public async setup(): Promise<void> {
    //
    // Generate integration test role STS credentials
    //
    const client = new STSClient({
      region: this.environment.region,
      customUserAgent: AcceleratorIntegrationTestResources.solutionId,
      retryStrategy: setRetryStrategy(),
    });

    this.environment.integrationAccountStsCredentials = (await this.isInsideIntegrationAccount(client))
      ? undefined
      : await AcceleratorIntegrationTestResources.getIntegrationAccountCredentials(
          client,
          this.environment.integrationAccountIamRoleArn,
        );

    //
    // Create test executor IAM role
    //
    const executorRole = await AcceleratorIntegrationTestResources.createTestExecutorRole({
      partition: this.environment.partition,
      region: this.environment.region,
      roleName: this.executorRoleName,
      policyStatements: this.props.executorRolePolicyStatements,
      integrationAccountIamRoleArn: this.environment.integrationAccountIamRoleArn,
      integrationAccountId: this.environment.accountId,
      credentials: this.environment.integrationAccountStsCredentials,
    });

    //
    // Generate test executor IAM role STS credentials
    //
    this.logger.info(`Getting test executor STS credentials`);
    const executorRoleStsCredentials = await AcceleratorIntegrationTestResources.getCrStsCredentials(
      new STSClient({
        region: this.environment.region,
        credentials: this.environment.integrationAccountStsCredentials,
        customUserAgent: AcceleratorIntegrationTestResources.solutionId,
        retryStrategy: setRetryStrategy(),
      }),
      executorRole.Arn!,
    );
    this.logger.info(`Successfully received test executor STS credentials`);

    //
    // Set test executor credential environment
    //
    if (!executorRoleStsCredentials) {
      throw new Error(`STS credentials for role ${executorRole.RoleName} not found, cannot assume.`);
    }

    AWS.config.credentials = executorRoleStsCredentials;
    process.env['AWS_REGION'] = this.environment.region;
    process.env['SOLUTION_ID'] = AcceleratorIntegrationTestResources.solutionId;
  }

  /**
   * Function to cleanup integration test executor role.
   *
   *
   * @description
   * This function performs following actions to cleanup integration test executor IAM role, if the role exists.
   *
   * - Delete all inline policies from the executor IAM role
   * - Detach all managed policies from the executor IAM role
   * - Finally delete the integration test executor IAM role
   *
   *
   */
  public async cleanup(): Promise<void> {
    this.logger.info(`Start environment cleanup`);
    const iamClient: IAMClient = new IAMClient({
      region: this.environment.region,
      customUserAgent: AcceleratorIntegrationTestResources.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: this.environment.integrationAccountStsCredentials,
    });

    if (!(await AcceleratorIntegrationTestResources.isRoleExists(iamClient, this.executorRoleName))) {
      this.logger.warn(`Executor IAM role "${this.executorRoleName}" does not exists, skipping environment cleanup`);
      return;
    }

    const listRolePoliciesResponse = await throttlingBackOff(() =>
      iamClient.send(
        new ListRolePoliciesCommand({
          RoleName: this.executorRoleName,
        }),
      ),
    );

    //
    // Start CR Role cleanup
    //
    for (const policyName of listRolePoliciesResponse.PolicyNames ?? []) {
      this.logger.info(`Deleting inline policy "${policyName}" from ${this.executorRoleName} role`);
      await throttlingBackOff(() =>
        iamClient.send(
          new DeleteRolePolicyCommand({
            RoleName: this.executorRoleName,
            PolicyName: policyName,
          }),
        ),
      );
      await delay(30000);
      const listAttachedRolePoliciesResponse = await throttlingBackOff(() =>
        iamClient.send(
          new ListAttachedRolePoliciesCommand({
            RoleName: this.executorRoleName,
          }),
        ),
      );
      for (const attachedPolicy of listAttachedRolePoliciesResponse.AttachedPolicies ?? []) {
        this.logger.info(`Detaching managed policy "${attachedPolicy.PolicyName}" from ${this.executorRoleName} role`);
        await throttlingBackOff(() =>
          iamClient.send(
            new DetachRolePolicyCommand({
              RoleName: this.executorRoleName,
              PolicyArn: attachedPolicy.PolicyArn,
            }),
          ),
        );
        await delay(30000);
      }
      this.logger.info(`Deleting role ${this.executorRoleName}`);
      await throttlingBackOff(() =>
        iamClient.send(
          new DeleteRoleCommand({
            RoleName: this.executorRoleName,
          }),
        ),
      );
    }
    this.logger.info(`Executor IAM role ${this.executorRoleName} cleanup completed.`);
  }

  public async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
