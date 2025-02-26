import {
  AcceptPortfolioShareCommand,
  AssociatePrincipalWithPortfolioCommand,
  DisassociatePrincipalFromPortfolioCommand,
  ListPrincipalsForPortfolioCommand,
  ListAcceptedPortfolioSharesCommand,
  ServiceCatalogClient,
} from '@aws-sdk/client-service-catalog';
import { IAMClient, ListRolesCommand } from '@aws-sdk/client-iam';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { describe, beforeEach, expect, test, jest, afterAll } from '@jest/globals';
import { handler, getPermissionSetRoleArn } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';

import { StaticInput } from './static-input';

import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

const iamClient = AcceleratorMockClient(IAMClient);
const scClient = AcceleratorMockClient(ServiceCatalogClient);
const stsClient = AcceleratorMockClient(STSClient);

describe('Create Event', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    iamClient.reset();
    scClient.reset();
    stsClient.reset();
    jest.resetModules(); // it clears the cache for environment
    process.env = { ...OLD_ENV }; // Make a copy
  });
  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });
  test('Create propagate portfolio association', async () => {
    // Set the variables
    process.env['AWS_REGION'] = 'us-east-1';
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn1,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn2,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'IMPORTED' })
      .resolves({ PortfolioDetails: [{ Id: 'importedId' }] });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'AWS_ORGANIZATIONS' })
      .resolves({ PortfolioDetails: [{ Id: 'awsOrgId' }] });
    scClient.on(ListPrincipalsForPortfolioCommand, { PortfolioId: 'portfolioId' }).resolves({
      Principals: [{ PrincipalType: 'IAM', PrincipalARN: 'PrincipalARN' }],
    });
    scClient.on(AssociatePrincipalWithPortfolioCommand).resolves({});
    iamClient.on(ListRolesCommand).resolves({
      Roles: [
        {
          RoleId: 'RoleId',
          Path: 'Path',
          Arn: 'roleArn',
          CreateDate: new Date(),
          RoleName: StaticInput.permissionSetName,
        },
      ],
    });
    const response = await handler(event);
    expect(response?.Status).toBe('SUCCESS');
  });
  test('Create propagate portfolio association AssociatePrincipalWithPortfolio error', async () => {
    // Set the variables
    process.env['AWS_REGION'] = 'us-east-1';
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn1,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn2,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'IMPORTED' })
      .resolves({ PortfolioDetails: [{ Id: 'importedId' }] });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'AWS_ORGANIZATIONS' })
      .resolves({ PortfolioDetails: [{ Id: 'awsOrgId' }] });
    scClient.on(ListPrincipalsForPortfolioCommand, { PortfolioId: 'portfolioId' }).resolves({
      Principals: [{ PrincipalType: 'IAM', PrincipalARN: 'PrincipalARN' }],
    });
    scClient.on(AssociatePrincipalWithPortfolioCommand).rejects({});
    iamClient.on(ListRolesCommand).resolves({
      Roles: [
        {
          RoleId: 'RoleId',
          Path: 'Path',
          Arn: 'roleArn',
          CreateDate: new Date(),
          RoleName: StaticInput.permissionSetName,
        },
      ],
    });
    const response = await handler(event);
    expect(response?.Status).toBe('SUCCESS');
  });
  test('Create propagate portfolio association error on assumeRole', async () => {
    // Set the variables
    process.env['AWS_REGION'] = 'us-east-1';
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });
    stsClient.on(AssumeRoleCommand).rejects({});
    const response = await handler(event);
    expect(response?.Status).toBe('FAILED');
  });
  test('Create propagate portfolio association role already associated', async () => {
    // Set the variables
    process.env['AWS_REGION'] = 'us-east-1';
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn1,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn2,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'IMPORTED' })
      .resolves({ PortfolioDetails: [{ Id: 'importedId' }] });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'AWS_ORGANIZATIONS' })
      .resolves({ PortfolioDetails: [{ Id: 'awsOrgId' }] });
    scClient.on(ListPrincipalsForPortfolioCommand, { PortfolioId: 'portfolioId' }).resolves({
      Principals: [{ PrincipalType: 'IAM', PrincipalARN: 'roleArn' }],
    });
    iamClient.on(ListRolesCommand).resolves({
      Roles: [
        {
          RoleId: 'RoleId',
          Path: 'Path',
          Arn: 'roleArn',
          CreateDate: new Date(),
          RoleName: StaticInput.permissionSetName,
        },
      ],
    });
    const response = await handler(event);
    expect(response?.Status).toBe('SUCCESS');
  });
});
describe('Update Event', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    iamClient.reset();
    scClient.reset();
    stsClient.reset();
    jest.resetModules(); // it clears the cache for environment
    process.env = { ...OLD_ENV }; // Make a copy
  });
  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });
  test('Update propagate portfolio association - error on importPortfolio', async () => {
    // Set the variables
    process.env['AWS_REGION'] = 'us-east-1';
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.newProps] });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn1,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn2,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'IMPORTED' })
      .resolves({ PortfolioDetails: [] });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'AWS_ORGANIZATIONS' })
      .resolves({ PortfolioDetails: [] });
    scClient.on(AcceptPortfolioShareCommand).rejects({});
    scClient.on(ListPrincipalsForPortfolioCommand, { PortfolioId: 'portfolioId' }).resolves({});
    iamClient.on(ListRolesCommand).resolves({
      Roles: [
        {
          RoleId: 'RoleId',
          Path: 'Path',
          Arn: 'roleArn',
          CreateDate: new Date(),
          RoleName: StaticInput.permissionSetName,
        },
      ],
    });
    const response = await handler(event);
    expect(response?.Status).toBe('SUCCESS');
  });
  test('Update propagate portfolio association - portfolio exists', async () => {
    // Set the variables
    process.env['AWS_REGION'] = 'us-east-1';
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.newProps] });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn1,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn2,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'IMPORTED' })
      .resolves({ PortfolioDetails: [{ Id: 'portfolioId' }] });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'AWS_ORGANIZATIONS' })
      .resolves({ PortfolioDetails: [] });
    scClient.on(AcceptPortfolioShareCommand).resolves({});
    scClient.on(ListPrincipalsForPortfolioCommand, { PortfolioId: 'portfolioId' }).resolves({
      Principals: [{ PrincipalType: 'IAM', PrincipalARN: 'PrincipalARN' }],
    });
    iamClient.on(ListRolesCommand).resolves({
      Roles: [
        {
          RoleId: 'RoleId',
          Path: 'Path',
          Arn: 'roleArn',
          CreateDate: new Date(),
          RoleName: StaticInput.permissionSetName,
        },
      ],
    });
    const response = await handler(event);
    expect(response?.Status).toBe('SUCCESS');
  });
  test('getPermissionSetRoleArn - permission set does not exist', async () => {
    iamClient.on(ListRolesCommand).resolves({});
    await expect(getPermissionSetRoleArn('permissionSet', 'account', new IAMClient())).rejects.toThrowError(
      StaticInput.permissionSetErrorMessage,
    );
  });
  test('getPermissionSetRoleArn - good role is returned', async () => {
    iamClient.on(ListRolesCommand).resolves({
      Roles: [
        {
          RoleId: 'RoleId',
          Path: 'Path',
          Arn: StaticInput.permissionSetRoleArn,
          CreateDate: new Date(),
          RoleName: StaticInput.permissionSetName,
        },
        {
          RoleId: 'RoleId',
          Path: 'Path',
          Arn: StaticInput.permissionSet2RoleArn,
          CreateDate: new Date(),
          RoleName: StaticInput.permissionSetName2,
        },
      ],
    });
    await expect(await getPermissionSetRoleArn(StaticInput.permissionSetNameLookup, 'account', new IAMClient())).toBe(
      StaticInput.permissionSetRoleArn,
    );

    await expect(await getPermissionSetRoleArn(StaticInput.permissionSet2NameLookup, 'account', new IAMClient())).toBe(
      StaticInput.permissionSet2RoleArn,
    );
  });
});
describe('Delete Event', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    iamClient.reset();
    scClient.reset();
    stsClient.reset();
    jest.resetModules(); // it clears the cache for environment
    process.env = { ...OLD_ENV }; // Make a copy
  });
  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });
  test('Delete propagate portfolio association', async () => {
    // Set the variables
    process.env['AWS_REGION'] = 'us-east-1';
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.deleteProps] });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn1,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn2,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'IMPORTED' })
      .resolves({ PortfolioDetails: [{ Id: 'portfolioId' }] });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'AWS_ORGANIZATIONS' })
      .resolves({ PortfolioDetails: [] });
    scClient.on(AcceptPortfolioShareCommand).resolves({});
    scClient.on(ListPrincipalsForPortfolioCommand, { PortfolioId: 'portfolioId' }).resolves({
      Principals: [{ PrincipalType: 'IAM', PrincipalARN: StaticInput.existingRoleArn }],
    });
    iamClient.on(ListRolesCommand).resolves({
      Roles: [
        {
          RoleId: 'RoleId',
          Path: 'Path',
          Arn: 'roleArn',
          CreateDate: new Date(),
          RoleName: StaticInput.permissionSetName,
        },
      ],
    });
    scClient.on(DisassociatePrincipalFromPortfolioCommand).resolves({});
    const response = await handler(event);
    expect(response?.Status).toBe('SUCCESS');
  });
  test('Delete propagate portfolio association - error on disassociation', async () => {
    // Set the variables
    process.env['AWS_REGION'] = 'us-east-1';
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.deleteProps] });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn1,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.assumeRoleArn2,
        RoleSessionName: 'acceleratorBootstrapCheck',
        DurationSeconds: 3600,
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'mockAccessKeyId',
          SecretAccessKey: 'mockSecretAccessKey',
          SessionToken: 'mockSecretAccessKey',
          Expiration: undefined,
        },
      });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'IMPORTED' })
      .resolves({ PortfolioDetails: [{ Id: 'portfolioId' }] });
    scClient
      .on(ListAcceptedPortfolioSharesCommand, { PortfolioShareType: 'AWS_ORGANIZATIONS' })
      .resolves({ PortfolioDetails: [] });
    scClient.on(AcceptPortfolioShareCommand).resolves({});
    scClient.on(ListPrincipalsForPortfolioCommand, { PortfolioId: 'portfolioId' }).resolves({
      Principals: [{ PrincipalType: 'IAM', PrincipalARN: StaticInput.existingRoleArn }],
    });
    iamClient.on(ListRolesCommand).resolves({
      Roles: [
        {
          RoleId: 'RoleId',
          Path: 'Path',
          Arn: 'roleArn',
          CreateDate: new Date(),
          RoleName: StaticInput.permissionSetName,
        },
      ],
    });
    scClient.on(DisassociatePrincipalFromPortfolioCommand).rejects({});
    const response = await handler(event);
    expect(response?.Status).toBe('SUCCESS');
  });
});
