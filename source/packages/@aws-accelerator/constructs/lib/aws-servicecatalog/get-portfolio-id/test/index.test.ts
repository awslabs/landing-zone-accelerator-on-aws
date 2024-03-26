import { ListPortfoliosCommand, ServiceCatalogClient } from '@aws-sdk/client-service-catalog';
import { describe, beforeEach, expect, test } from '@jest/globals';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';

import { StaticInput } from './static-input';

import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

const scClient = AcceleratorMockClient(ServiceCatalogClient);

describe('Create Event', () => {
  beforeEach(() => {
    scClient.reset();
  });
  test('Create get portfolio id - just one id returned', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });
    scClient.on(ListPortfoliosCommand).resolves({
      PortfolioDetails: [
        { Id: 'Id', DisplayName: StaticInput.newProps.displayName, ProviderName: StaticInput.newProps.providerName },
      ],
    });
    const response = await handler(event);
    expect(response?.PhysicalResourceId).toBe('Id');
  });
});
describe('Update Event', () => {
  beforeEach(() => {
    scClient.reset();
  });

  test('Update get portfolio id - no id returned', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.newProps] });
    scClient.on(ListPortfoliosCommand).resolves({});
    await expect(handler(event)).rejects.toThrowError(StaticInput.noPortfolioFoundError);
  });
  test('Update get portfolio id - multiple ids returned', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.newProps] });
    scClient.on(ListPortfoliosCommand).resolves({
      PortfolioDetails: [
        { Id: 'Id1', DisplayName: StaticInput.newProps.displayName, ProviderName: StaticInput.newProps.providerName },
        { Id: 'Id2', DisplayName: StaticInput.newProps.displayName, ProviderName: StaticInput.newProps.providerName },
      ],
    });
    await expect(handler(event)).rejects.toThrowError(StaticInput.multiplePortfolioFoundError);
  });
});
describe('Delete Event', () => {
  beforeEach(() => {
    scClient.reset();
  });
  test('Delete get portfolio id - no action', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });
    const response = await handler(event);
    expect(response?.Status).toBe('SUCCESS');
  });
});
