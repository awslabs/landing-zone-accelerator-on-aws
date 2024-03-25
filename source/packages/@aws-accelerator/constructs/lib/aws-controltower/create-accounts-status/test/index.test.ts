import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import {
  ServiceCatalogClient,
  SearchProvisionedProductsCommand,
  SearchProductsCommand,
  ListProvisioningArtifactsCommand,
  ProvisionProductCommand,
} from '@aws-sdk/client-service-catalog';

import { describe, beforeEach, expect, test } from '@jest/globals';
import { handler } from '../index';
import { AcceleratorMockClient } from '../../../../test/unit-test/common/resources';

import { StaticInput } from './static-input';

const ddbClient = AcceleratorMockClient(DynamoDBDocumentClient);
const scClient = AcceleratorMockClient(ServiceCatalogClient);

describe('Any Event', () => {
  beforeEach(() => {
    ddbClient.reset();
    scClient.reset();
  });
  test('Event - 5 accounts being provisioned', async () => {
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: UNDER_CHANGE`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves(StaticInput.fiveAccountsProvisioning);
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: TAINTED`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: ERROR`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: PLAN_IN_PROGRESS`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    const response = await handler({});
    expect(response!.IsComplete).toBeFalsy();
  });

  test('Event - one account provisioned', async () => {
    // account to add
    ddbClient.on(ScanCommand, { TableName: '', ProjectionExpression: 'accountEmail' }).resolves({
      Items: [{ accountEmail: 'example@example.com' }],
    });
    // get account details
    ddbClient.on(ScanCommand, { TableName: '', Limit: 1 }).resolves({
      Items: [
        {
          accountEmail: 'example@example.com',
          accountConfig: JSON.stringify({
            name: 'name',
            description: 'description',
            email: 'example@example.com',
            enableGovCloud: false,
            organizationalUnitId: 'ou-id',
          }),
        },
      ],
    });
    // lookup products on any state is empty. This is like a new account which is running for the first time
    scClient.on(SearchProvisionedProductsCommand).resolves({});
    // lookup and get CT product ID
    scClient
      .on(SearchProductsCommand, {
        Filters: { FullTextSearch: ['AWS Control Tower Account Factory'] },
      })
      .resolves({ ProductViewSummaries: [{ ProductId: 'ProductId' }] });
    // get artifact id for that product ID
    scClient
      .on(ListProvisioningArtifactsCommand, { ProductId: 'ProductId' })
      .resolves({ ProvisioningArtifactDetails: [{ Active: true, Id: 'provisioningArtifactId' }] });
    // this call has a uuid so just mocking the entire call
    scClient.on(ProvisionProductCommand).resolves({});
    // delete the record. mocking entire call
    ddbClient.on(DeleteCommand, {}).resolves({});
    const response = await handler({});
    expect(response!.IsComplete).toBeFalsy();
  });

  test('Event - one account completed', async () => {
    // new accounts table has nothing
    ddbClient.on(ScanCommand).resolves({
      Items: [],
    });
    // products do not have error or tainted status
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: ERROR`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: TAINTED`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: UNDER_CHANGE`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: PLAN_IN_PROGRESS`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    const response = await handler({});
    expect(response!.IsComplete).toBeTruthy();
  });

  test('Event - one account has error', async () => {
    // new accounts table has nothing
    ddbClient.on(ScanCommand).resolves({
      Items: [],
    });
    // products have error or tainted status
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: ERROR`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({
        ProvisionedProducts: [
          {
            Name: 'account1',
            Type: 'CONTROL_TOWER_ACCOUNT',
            Status: 'ERROR',
          },
        ],
      });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: TAINTED`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: UNDER_CHANGE`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: PLAN_IN_PROGRESS`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    await expect(handler({})).rejects.toThrow(
      'Accounts failed to enroll in Control Tower. Check Service Catalog Console',
    );
  });

  test('Event - one account has been tainted', async () => {
    // new accounts table has nothing
    ddbClient.on(ScanCommand).resolves({
      Items: [],
    });
    // product has tainted status
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: ERROR`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: TAINTED`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({
        ProvisionedProducts: [
          {
            Name: 'account2',
            Type: 'CONTROL_TOWER_ACCOUNT',
            Status: 'TAINTED',
          },
        ],
      });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: UNDER_CHANGE`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: PLAN_IN_PROGRESS`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    await expect(handler({})).rejects.toThrow(
      'Accounts failed to enroll in Control Tower. Check Service Catalog Console',
    );
  });

  test('Event - one account is being created', async () => {
    // new accounts table has nothing
    ddbClient.on(ScanCommand).resolves({
      Items: [],
    });
    // product has plan_in_progress status
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: ERROR`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: TAINTED`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({
        ProvisionedProducts: [],
      });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: UNDER_CHANGE`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({ ProvisionedProducts: [] });
    scClient
      .on(SearchProvisionedProductsCommand, {
        Filters: {
          SearchQuery: [`status: PLAN_IN_PROGRESS`],
        },
        AccessLevelFilter: {
          Key: 'Account',
          Value: 'self',
        },
      })
      .resolves({
        ProvisionedProducts: [
          {
            Name: 'account2',
            Type: 'CONTROL_TOWER_ACCOUNT',
            Status: 'PLAN_IN_PROGRESS',
          },
        ],
      });
    const response = await handler({});
    expect(response?.IsComplete).toBeFalsy();
  });

  test('Event - no Control Tower product', async () => {
    // account to add
    ddbClient.on(ScanCommand, { TableName: '', ProjectionExpression: 'accountEmail' }).resolves({
      Items: [{ accountEmail: 'example@example.com' }],
    });
    // get account details
    ddbClient.on(ScanCommand, { TableName: '', Limit: 1 }).resolves({
      Items: [
        {
          accountEmail: 'example@example.com',
          accountConfig: JSON.stringify({
            name: 'name',
            description: 'description',
            email: 'example@example.com',
            enableGovCloud: false,
            organizationalUnitId: 'ou-id',
          }),
        },
      ],
    });
    // lookup products on any state is empty. This is like a new account which is running for the first time
    scClient.on(SearchProvisionedProductsCommand).resolves({ ProvisionedProducts: [] });
    // lookup and get CT product ID
    scClient
      .on(SearchProductsCommand, {
        Filters: { FullTextSearch: ['AWS Control Tower Account Factory'] },
      })
      .resolves({ ProductViewSummaries: [] });

    await expect(handler({})).rejects.toThrow(
      'No products were found while searching for AWS Control Tower Account Factory',
    );
  });

  test('Event - more than 1 Control Tower product', async () => {
    // account to add
    ddbClient.on(ScanCommand, { TableName: '', ProjectionExpression: 'accountEmail' }).resolves({
      Items: [{ accountEmail: 'example@example.com' }],
    });
    // get account details
    ddbClient.on(ScanCommand, { TableName: '', Limit: 1 }).resolves({
      Items: [
        {
          accountEmail: 'example@example.com',
          accountConfig: JSON.stringify({
            name: 'name',
            description: 'description',
            email: 'example@example.com',
            enableGovCloud: false,
            organizationalUnitId: 'ou-id',
          }),
        },
      ],
    });
    // lookup products on any state is empty. This is like a new account which is running for the first time
    scClient.on(SearchProvisionedProductsCommand).resolves({ ProvisionedProducts: [] });
    // lookup and get CT product ID
    scClient
      .on(SearchProductsCommand, {
        Filters: { FullTextSearch: ['AWS Control Tower Account Factory'] },
      })
      .resolves({ ProductViewSummaries: [{ ProductId: 'ProductId1' }, { ProductId: 'ProductId2' }] });
    await expect(handler({})).rejects.toThrow(
      'Multiple products were found while searching for AWS Control Tower Account Factory',
    );
  });
});
