import { describe, beforeEach, expect, test } from '@jest/globals';

import { Organization } from '../prerequisites/organization';
import {
  DescribeOrganizationCommand,
  ListRootsCommand,
  OrganizationsClient,
  ListOrganizationalUnitsForParentCommand,
  ListAccountsCommand,
  AWSOrganizationsNotInUseException,
  EnableAllFeaturesCommand,
  ListAWSServiceAccessForOrganizationCommand,
  EnabledServicePrincipal,
  paginateListAWSServiceAccessForOrganization,
} from '@aws-sdk/client-organizations';

import { ListInstancesCommand, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import {
  AcceleratorMockClient,
  AllFeatureEnabledOrganizationConfig,
  GlobalRegion,
  ValidateOrganizationError,
  RootOrganization,
  SolutionId,
  OrganizationValidationError,
  AuditAccount,
  LogArchiveAccount,
  MockInternalError,
  SecurityOuConfig,
  BillingEnabledOrganizationConfig,
  Region,
  ManagementAccount,
  ManagementAccountNotFoundError,
} from './utils/test-resources';

const client = AcceleratorMockClient(OrganizationsClient);
const ssoAdminClient = AcceleratorMockClient(SSOAdminClient);

describe('Success', () => {
  beforeEach(() => {
    client.reset();
  });

  test('Valid Organization Configuration ', async () => {
    client.on(ListRootsCommand, {}).resolves({ Roots: [RootOrganization] });

    client.on(ListAWSServiceAccessForOrganizationCommand, {}).resolves({ EnabledServicePrincipals: [] });

    ssoAdminClient.on(ListInstancesCommand, {}).resolves({ Instances: [] });

    client.on(DescribeOrganizationCommand, {}).resolves({ Organization: AllFeatureEnabledOrganizationConfig });

    client.on(ListOrganizationalUnitsForParentCommand, {}).resolves({ OrganizationalUnits: [] });

    client.on(ListAccountsCommand, {}).resolves({ Accounts: [] });

    expect(await Organization.ValidateOrganization(GlobalRegion, Region, SolutionId)).toBeUndefined();
  });

  test('Get management account ID ', async () => {
    client.on(ListAccountsCommand, {}).resolves({ Accounts: [ManagementAccount] });

    const accountId = await Organization.getManagementAccountId(GlobalRegion, SolutionId, ManagementAccount.Email);
    expect(accountId).toEqual(ManagementAccount.Id);
  });
});

describe('Failure', () => {
  beforeEach(() => {
    client.reset();
    client.on(ListRootsCommand, {}).resolves({ Roots: [RootOrganization] });
    client.on(ListAWSServiceAccessForOrganizationCommand, {}).resolves({ EnabledServicePrincipals: [] });
    ssoAdminClient.on(ListInstancesCommand, {}).resolves({ Instances: [] });
  });

  test('Organization Not Enabled', async () => {
    client.on(DescribeOrganizationCommand, {}).resolves({ Organization: undefined });

    await expect(Organization.ValidateOrganization(GlobalRegion, Region, SolutionId)).rejects.toThrow(
      ValidateOrganizationError([OrganizationValidationError.ORG_NOT_FOUND]),
    );
  });

  test('Organization All Feature Not Enabled', async () => {
    client.on(DescribeOrganizationCommand, {}).resolves({ Organization: BillingEnabledOrganizationConfig });

    client.on(EnableAllFeaturesCommand, {}).resolves({ $metadata: { httpStatusCode: 200 } });

    client.on(ListOrganizationalUnitsForParentCommand, {}).resolves({ OrganizationalUnits: [] });

    client.on(ListAccountsCommand, {}).resolves({ Accounts: [] });

    expect(await Organization.ValidateOrganization(GlobalRegion, Region, SolutionId)).toBeUndefined();
  });

  test('Additional OU Found', async () => {
    client.on(DescribeOrganizationCommand, {}).resolves({ Organization: AllFeatureEnabledOrganizationConfig });

    client.on(ListOrganizationalUnitsForParentCommand, {}).resolves({ OrganizationalUnits: [SecurityOuConfig] });

    client.on(ListAccountsCommand, {}).resolves({ Accounts: [] });

    await expect(Organization.ValidateOrganization(GlobalRegion, Region, SolutionId)).rejects.toThrow(
      ValidateOrganizationError([OrganizationValidationError.OU_FOUND]),
    );
  });

  test('Additional Accounts Found', async () => {
    client.on(DescribeOrganizationCommand, {}).resolves({ Organization: AllFeatureEnabledOrganizationConfig });

    client.on(ListOrganizationalUnitsForParentCommand, {}).resolves({ OrganizationalUnits: [] });

    client.on(ListAccountsCommand, {}).resolves({ Accounts: [AuditAccount, LogArchiveAccount] });

    await expect(Organization.ValidateOrganization(GlobalRegion, Region, SolutionId)).rejects.toThrow(
      ValidateOrganizationError([OrganizationValidationError.ACCOUNT_FOUND]),
    );
  });

  test('Organizations have services enabled', async () => {
    client.on(ListAWSServiceAccessForOrganizationCommand, {}).resolves({
      EnabledServicePrincipals: [
        {
          ServicePrincipal: 'securityhub.amazonaws.com',
        },
        {
          ServicePrincipal: 'sso.amazonaws.com',
        },
      ],
    });

    const enabledServicePrincipals: EnabledServicePrincipal[] = [];
    const paginator = paginateListAWSServiceAccessForOrganization(
      { client: new OrganizationsClient({}), pageSize: 1 },
      {},
    );
    for await (const page of paginator) {
      for (const enabledServicePrincipal of page.EnabledServicePrincipals ?? []) {
        enabledServicePrincipals.push(enabledServicePrincipal);
      }
    }

    client.on(DescribeOrganizationCommand, {}).resolves({ Organization: AllFeatureEnabledOrganizationConfig });

    client.on(ListOrganizationalUnitsForParentCommand, {}).resolves({ OrganizationalUnits: [] });

    client.on(ListAccountsCommand, {}).resolves({ Accounts: [] });

    await expect(Organization.ValidateOrganization(GlobalRegion, Region, SolutionId)).rejects.toThrow(
      ValidateOrganizationError([OrganizationValidationError.SERVICE_ENABLED]),
    );
  });

  test('IAM Identity Center enabled', async () => {
    ssoAdminClient.on(ListInstancesCommand, {}).resolves({ Instances: [{ IdentityStoreId: 'd-906751796e' }] });

    client.on(DescribeOrganizationCommand, {}).resolves({ Organization: AllFeatureEnabledOrganizationConfig });

    client.on(ListOrganizationalUnitsForParentCommand, {}).resolves({ OrganizationalUnits: [] });

    client.on(ListAccountsCommand, {}).resolves({ Accounts: [] });

    await expect(Organization.ValidateOrganization(GlobalRegion, Region, SolutionId)).rejects.toThrow(
      ValidateOrganizationError([OrganizationValidationError.IDENTITY_CENTER_ENABLED]),
    );
  });

  test('AWSOrganizationsNotInUseException', async () => {
    client
      .on(DescribeOrganizationCommand, {})
      .rejectsOnce(
        new AWSOrganizationsNotInUseException({
          $metadata: {},
          message: '',
        }),
      )
      .resolves({
        Organization: undefined,
      });

    await expect(Organization.ValidateOrganization(GlobalRegion, Region, SolutionId)).rejects.toThrow(
      ValidateOrganizationError([OrganizationValidationError.ORG_NOT_FOUND]),
    );
  });

  test('Describe Organization internal error', async () => {
    client.on(DescribeOrganizationCommand, {}).rejectsOnce(MockInternalError).resolves({
      Organization: undefined,
    });

    await expect(Organization.ValidateOrganization(GlobalRegion, Region, SolutionId)).rejects.toThrow(
      MockInternalError,
    );
  });

  test('Management account not found ', async () => {
    client.on(ListAccountsCommand, {}).resolves({ Accounts: [] });

    await expect(
      Organization.getManagementAccountId(GlobalRegion, SolutionId, ManagementAccount.Email),
    ).rejects.toThrow(ManagementAccountNotFoundError(ManagementAccount.Email));
  });
});
