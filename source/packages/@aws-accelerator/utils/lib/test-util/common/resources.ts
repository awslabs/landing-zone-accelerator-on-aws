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

import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import {
  AttachRolePolicyCommand,
  CreateRoleCommand,
  GetRoleCommand,
  IAMClient,
  NoSuchEntityException,
  PutRolePolicyCommand,
  Role,
  waitUntilRoleExists,
} from '@aws-sdk/client-iam';

import { createLogger } from '../../logger';
import { delay, throttlingBackOff } from '../../throttle';
import { setRetryStrategy } from '../../common-functions';
import { PolicyStatementType } from '../../common-resources';
import {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceUpdateEvent,
} from '../../common-types';

/**
 * STS Credentials type used for integration testing role chaining
 */
export type AssumeCredentialType = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: Date;
};

/**
 * Policy Document Type
 */
export type PolicyDocumentType = {
  Version: string;
  Id?: string;
  Statement: PolicyStatementType[];
};

/**
 * Custom resource create event
 */
export const CreateEvent: CloudFormationCustomResourceCreateEvent = {
  RequestType: 'Create',
  ServiceToken: '',
  ResponseURL: '...',
  StackId: '',
  RequestId: '',
  LogicalResourceId: '',
  ResourceType: '',
  ResourceProperties: {
    ServiceToken: '',
  },
};
/**
 * Custom resource update event
 */
export const UpdateEvent: CloudFormationCustomResourceUpdateEvent = {
  RequestType: 'Update',
  ServiceToken: '',
  ResponseURL: '...',
  StackId: '',
  RequestId: '',
  LogicalResourceId: '',
  ResourceType: '',
  PhysicalResourceId: '',
  ResourceProperties: {
    ServiceToken: '',
  },
  OldResourceProperties: {
    ServiceToken: '',
  },
};

/**
 * Custom resource delete event
 */
export const DeleteEvent: CloudFormationCustomResourceDeleteEvent = {
  RequestType: 'Delete',
  ServiceToken: '',
  ResponseURL: '...',
  StackId: '',
  RequestId: '',
  LogicalResourceId: '',
  ResourceType: '',
  PhysicalResourceId: '',
  ResourceProperties: {
    ServiceToken: '',
  },
};

/**
 * A dummy value for testing failures
 */
export const Dummy = '000000000000';

/**
 * Manifest account details type
 */
type ManifestAccountType = { name: string; id: string };

/**
 * Test environment manifest type
 */
export type ManifestType = {
  /**
   * Test environment name
   */
  name: string;
  /**
   * Description of the test environment
   */
  description: string;
  /**
   * AWS partition where for integration testing
   */
  partition: string;
  /**
   * List of AWS Organizations account name and ids for the test environment
   */
  accounts: ManifestAccountType[];
};

/**
 * Test environment manifest type
 */
export type TestEnvironmentManifestType = {
  environments: ManifestType[];
};

/**
 * Integration test environment type
 */
export type TestEnvironmentType = {
  /**
   * Test environment name
   */
  name: string;
  /**
   * AWS partition for integration testing
   */
  partition: string;
  /**
   * AWS account id for integration testing , aka IntegrationAccountId
   */
  accountId: string;
  /**
   * AWS Region for integration testing
   */
  region: string;
  /**
   * AWS Global Region
   */
  globalRegion: string;
  /**
   * Integration account assume role arn
   */
  integrationAccountIamRoleArn: string;
  /**
   * Integration account STS credentials
   */
  integrationAccountStsCredentials?: AssumeCredentialType;
  /**
   * List of AWS Organizations account name and ids for the test environment
   */
  accounts?: ManifestAccountType[];
  /**
   * Solution id
   */
  solutionId?: string;
};

//
// List of exception to be tested
//
export const Exception = {
  ['MACIE_NOT_IN_ORG']: { error: new Error('The account is not a member in the AWS Organization') },
  ['MACIE_ANOTHER_ACCOUNT_ENABLED']: {
    error: new Error(
      'The request failed because another account has already been designated as the delegated Macie administrator account for your organization',
    ),
  },
  ['GUARDDUTY_NOT_IN_ORG']: {
    error: new Error('The request failed because admin account passed is not member of AWS Organizations.'),
  },
  ['GUARDDUTY_ANOTHER_ACCOUNT_ENABLED']: {
    error: new Error(
      'The request failed because another account is already enabled as GuardDuty delegated administrator for the organization.',
    ),
  },
};

/**
 * Abstract class for integration test resources
 */
export abstract class AcceleratorIntegrationTestResources {
  private static logger = createLogger([path.parse(path.basename(__filename)).name]);

  private static async getRole(roleName: string, region: string, credentials?: AssumeCredentialType): Promise<Role> {
    this.logger.info(`Getting existing role ${roleName}`);
    const client: IAMClient = new IAMClient({
      region,
      customUserAgent: AcceleratorIntegrationTestResources.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials,
    });

    const response = await throttlingBackOff(() =>
      client.send(
        new GetRoleCommand({
          RoleName: roleName,
        }),
      ),
    );

    return response.Role!;
  }

  /**
   * Integration account IAM role name
   */
  public static integrationAccountRoleName = process.env['INTEGRATION_TEST_ROLE_NAME'] ?? 'LzaIntegrationTestRole';
  /**
   * Solution Id for integration testing
   */
  public static solutionId = 'AwsSolution/SO0199/integration-test';

  /**
   * Function to get STS credentials
   * @param client {@link STSClient}
   * @param roleArn string
   * @param roleSessionName string
   * @returns credentials {@link AssumeCredentialType}
   */
  public static async getStsCredentials(
    client: STSClient,
    roleArn: string,
    roleSessionName: string,
  ): Promise<AssumeCredentialType> {
    AcceleratorIntegrationTestResources.logger.info(`Getting STS credentials for ${roleArn} role`);
    const response = await throttlingBackOff(() =>
      client.send(
        new AssumeRoleCommand({
          RoleArn: roleArn,
          RoleSessionName: roleSessionName,
        }),
      ),
    );

    AcceleratorIntegrationTestResources.logger.info(`Received STS credentials for ${roleArn} role`);
    return {
      accessKeyId: response.Credentials!.AccessKeyId!,
      secretAccessKey: response.Credentials!.SecretAccessKey!,
      sessionToken: response.Credentials!.SessionToken!,
      expiration: response.Credentials!.Expiration,
    };
  }

  /**
   * Function to get integration account sts Credentials
   * @param client {@link STSClient}
   * @param roleArn string
   * @returns credentials {@link AssumeCredentialType}
   */
  public static async getIntegrationAccountCredentials(
    client: STSClient,
    roleArn: string,
  ): Promise<AssumeCredentialType> {
    AcceleratorIntegrationTestResources.logger.info(
      `Getting STS credentials for the integration account role ${roleArn}`,
    );
    return await AcceleratorIntegrationTestResources.getStsCredentials(client, roleArn, 'LzaIntegrationAccountSession');
  }

  /**
   *
   * @param client client {@link STSClient}
   * @param roleArn string
   * @returns credentials {@link AssumeCredentialType} | undefined
   */
  public static async getCrStsCredentials(client: STSClient, roleArn: string): Promise<AssumeCredentialType> {
    return await AcceleratorIntegrationTestResources.getStsCredentials(client, roleArn, 'CRRoleAssumeSession');
  }

  public static async createTestExecutorRole(props: {
    partition: string;
    region: string;
    roleName: string;
    policyStatements: PolicyStatementType[];
    integrationAccountIamRoleArn: string;
    integrationAccountId: string;
    credentials?: AssumeCredentialType;
  }): Promise<Role> {
    const iamClient = new IAMClient({
      region: props.region,
      credentials: props.credentials,
      customUserAgent: AcceleratorIntegrationTestResources.solutionId,
      retryStrategy: setRetryStrategy(),
    });

    if (await AcceleratorIntegrationTestResources.isRoleExists(iamClient, props.roleName)) {
      AcceleratorIntegrationTestResources.logger.info(
        `Test executor IAM role ${props.roleName} exists, skip creation of role`,
      );
      const role = await AcceleratorIntegrationTestResources.getRole(props.roleName, props.region, props.credentials);

      this.logger.info(`Existing role arn in ${role.Arn}`);
      return role;
    }

    const statements: PolicyStatementType[] = [
      { Effect: 'Allow', Principal: { Service: ['lambda.amazonaws.com'] }, Action: 'sts:AssumeRole' },
      {
        Effect: 'Allow',
        Principal: { AWS: [props.integrationAccountIamRoleArn] },
        Action: ['sts:AssumeRole', 'sts:TagSession'],
      },
    ];

    // Give access to account for development environment only
    if (!process.env['CI_PIPELINE_ID']) {
      statements.push({
        Effect: 'Allow',
        Principal: { AWS: [`arn:${props.partition}:iam::${props.integrationAccountId}:root`] },
        Action: ['sts:AssumeRole', 'sts:TagSession'],
      });
    }

    const trustPolicyDocument: PolicyDocumentType = {
      Version: '2012-10-17',
      Statement: statements,
    };

    // create Test executor IAM role
    AcceleratorIntegrationTestResources.logger.info(`Creating test executor IAM role - ${props.roleName}`);

    const crIamRole = await throttlingBackOff(() =>
      iamClient.send(
        new CreateRoleCommand({
          RoleName: props.roleName,
          AssumeRolePolicyDocument: JSON.stringify(trustPolicyDocument),
        }),
      ),
    );

    const waiterState = await waitUntilRoleExists(
      { client: iamClient, maxWaitTime: 300 },
      { RoleName: props.roleName },
    );
    if (waiterState.state !== 'SUCCESS') {
      throw new Error(`Test executor role ${props.roleName} creation not completed!!`);
    }

    const policyDocument: PolicyDocumentType = { Version: '2012-10-17', Statement: props.policyStatements };

    await throttlingBackOff(() =>
      iamClient.send(
        new PutRolePolicyCommand({
          RoleName: props.roleName,
          PolicyName: 'Inline-01',
          PolicyDocument: JSON.stringify(policyDocument),
        }),
      ),
    );

    // attach Lambda execution role
    await throttlingBackOff(() =>
      iamClient.send(
        new AttachRolePolicyCommand({
          RoleName: props.roleName,
          PolicyArn: `arn:${props.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`,
        }),
      ),
    );

    // wait for the role creation to complete
    await delay(20000);

    return crIamRole.Role!;
  }

  public static async isRoleExists(client: IAMClient, roleName: string): Promise<boolean> {
    this.logger.info(`Checking test executor role ${roleName} existence`);
    try {
      const response = await throttlingBackOff(() =>
        client.send(
          new GetRoleCommand({
            RoleName: roleName,
          }),
        ),
      );

      if (response.Role?.RoleName === roleName) {
        this.logger.info(`Test executor role ${roleName} exists`);
        return true;
      }
      return false;
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      if (e instanceof NoSuchEntityException) {
        return false;
      }
      throw e;
    }
  }

  /**
   * Function to get current session assume principal arn
   * @param client {@link STSClient}
   * @returns arn string
   */
  public static async getCurrentAssumePrincipalArn(client: STSClient): Promise<string> {
    AcceleratorIntegrationTestResources.logger.info('Getting Integration account assumed principal arn');
    const response = await throttlingBackOff(() => client.send(new GetCallerIdentityCommand({})));
    return response.Arn!;
  }
}
