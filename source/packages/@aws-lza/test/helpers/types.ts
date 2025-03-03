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

import { IAssumeRoleCredential } from '../../common/resources';

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
   * Integration account assume role arn
   */
  integrationAccountIamRoleArn: string;
  /**
   * Integration account STS credentials
   */
  integrationAccountStsCredentials?: IAssumeRoleCredential;
  /**
   * List of AWS Organizations account name and ids for the test environment
   */
  accounts?: ManifestAccountType[];
  /**
   * Solution id
   */
  solutionId?: string;
};
