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

import { KeySpec, KeyUsageType } from '@aws-sdk/client-kms';
import { AccountStatus, OrganizationFeatureSet } from '@aws-sdk/client-organizations';

import { mockClient } from 'aws-sdk-client-mock';

/**
 * AWS SDK Mock API client
 * @param awsClient
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AcceleratorMockClient = (awsClient: any) => mockClient(awsClient);

/**
 * Partition
 */
export const Partition = 'aws';

/**
 * GovCloud US Partition
 */
export const GovCloud_US = 'aws-us-gov';

/**
 * AWS Account Id
 */
export const AccountId = '111111111111';
/**
 * Global Region
 */
export const GlobalRegion = 'us-east-1';

/**
 * AWS Region
 */
export const Region = 'us-east-1';

/**
 * Solution id
 */
export const SolutionId = 'AwsSolution/SO0199';

/**
 * AWS KMS CMK creation parameter
 */
export const CreateKeyParams = {
  Description: 'AWS Control Tower Landing Zone encryption key',
  KeyUsage: 'ENCRYPT_DECRYPT' as KeyUsageType,
  KeySpec: 'SYMMETRIC_DEFAULT' as KeySpec,
};

/**
 * Accelerator CMK alias mock config
 */
export const AcceleratorKeyAlias = { AliasArn: 'AliasArn1', AliasName: 'alias/accelerator/key' };

/**
 * Installer CMK alias mock config
 */
export const InstallerKeyAlias = { AliasArn: 'AliasArn2', AliasName: 'alias/installer/key' };

/**
 * AWS Control Tower Landing Zone CMK alias mock config
 */
export const ControlTowerKeyAlias = { AliasArn: 'AliasArn3', AliasName: 'alias/aws-controltower/key' };

/**
 * All Feature enabled mock Organization config
 */
export const AllFeatureEnabledOrganizationConfig = {
  Id: 'OrgId',
  Arn: 'OrgArn',
  FeatureSet: OrganizationFeatureSet.ALL,
};

/**
 * Billing enabled mock Organization config
 */
export const BillingEnabledOrganizationConfig = {
  Id: 'OrgId',
  Arn: 'OrgArn',
  FeatureSet: OrganizationFeatureSet.CONSOLIDATED_BILLING,
};

/**
 * AWS Organization Root mock configuration
 */
export const RootOrganization = { Id: 'r-001', Name: 'Root', Arn: 'RootArn' };

/**
 * AWS Organization Security OU mock configuration
 */
export const SecurityOuConfig = { Id: 'ou-001', Name: 'Security', Arn: 'SecurityArn' };

/**
 * Existing fake Management account mock configuration
 */
export const ManagementAccount = {
  Id: 'ManagementAccountId',
  Arn: 'ManagementAccount-Arn',
  Email: 'all-enabled-management-account@example.com',
  Name: 'Management',
  Status: AccountStatus.ACTIVE,
  organizationalUnit: 'Root',
  warm: false,
};

/**
 * Existing fake Audit account mock configuration
 */
export const AuditAccount = {
  Id: 'AuditAccountId',
  Arn: 'AuditAccount-Arn',
  Email: 'all-enabled-audit-account@example.com',
  Name: 'Audit',
  Status: AccountStatus.ACTIVE,
  organizationalUnit: 'Security',
  warm: false,
};

/**
 * Existing fake LogArchive account mock configuration
 */
export const LogArchiveAccount = {
  Id: 'LogArchiveAccountId',
  Arn: 'LogArchiveAccount-Arn',
  Email: 'all-enabled-logarchive-account@example.com',
  Name: 'LogArchive',
  Status: AccountStatus.ACTIVE,
  organizationalUnit: 'Security',
  warm: false,
};

/**
 * AWSControlTowerAdmin Role mock Configuration
 */
export const AWSControlTowerAdmin = {
  RoleName: 'AWSControlTowerAdmin',
  RoleId: 'Role1',
  CreateDate: new Date(),
  Arn: 'Role1Arn',
  Path: '/service-role/',
};

/**
 * Fake Policy document for AWS Control Tower Landing Zone role.
 */
export const AWSControlTowerRolePolicyDocument =
  '{"Version": "2012-10-17","Statement": [{"Action": "ec2:DescribeAvailabilityZones","Resource": "*","Effect": "Allow"}]}';

/**
 * Mock internal error
 */
export const MockInternalError = new Error('An AWS internal error');

/**
 * AWS Account creation internal errors
 * @param errors string[]
 * @returns
 */

export const AccountCreationInternalFailureError = (errors: string[]) =>
  new Error(`Shared account creation failure !!! ${errors.join('. ')}`);

/**
 * Expected error when there is an existing Security OU under Root of Organizations
 */
export const ExistingRoleFoundError = (roleNames: string[]) =>
  new Error(
    `There are existing AWS Control Tower Landing Zone roles "${roleNames.join(
      ',',
    )}", the solution cannot deploy AWS Control Tower Landing Zone`,
  );

/**
 * Possible Organization validation error
 */
export enum OrganizationValidationError {
  ORG_NOT_FOUND = `AWS Control Tower Landing Zone cannot deploy because AWS Organizations have not been configured for the environment.`,
  SERVICE_ENABLED = `AWS Control Tower Landing Zone cannot deploy because AWS Organizations have services enabled.`,
  OU_FOUND = `AWS Control Tower Landing Zone cannot deploy because there are multiple organizational units in AWS Organizations.`,
  ACCOUNT_FOUND = `AWS Control Tower Landing Zone cannot deploy because there are multiple accounts in AWS Organizations.`,
  GOV_CLOUD_ACCOUNT_NOT_FOUND = `Either AWS Organizations does not have required shared accounts (LogArchive and Audit) or have other accounts.`,
  IDENTITY_CENTER_ENABLED = `AWS Control Tower Landing Zone cannot deploy because IAM Identity Center is configured.`,
}

/**
 * Organization validation error
 * @param validationErrors string[]
 * @returns
 */
export const ValidateOrganizationError = (validationErrors: string[]) =>
  new Error(`AWS Organization validation has ${validationErrors.length} issue(s):\n${validationErrors.join('\n')}`);

/**
 * Expected error when there is an existing CMK alias for AWS Control Tower Landing Zone CMK
 */
export const AliasFoundError = new Error(
  `There is already an AWS Control Tower Landing Zone KMS CMK alias named ${ControlTowerKeyAlias.AliasName}. The alias ${ControlTowerKeyAlias.AliasName} is reserved for AWS Control Tower Landing Zone CMK created by the solution, the solution cannot deploy AWS Control Tower Landing Zone.`,
);
