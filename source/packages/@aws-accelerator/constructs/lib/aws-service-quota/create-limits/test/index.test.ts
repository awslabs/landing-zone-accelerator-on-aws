import {
  ServiceQuotasClient,
  GetServiceQuotaCommand,
  RequestServiceQuotaIncreaseCommand,
} from '@aws-sdk/client-service-quotas';
import { describe, beforeEach, expect, test } from '@jest/globals';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';

import { StaticInput } from './static-input';

import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

const sqClient = AcceleratorMockClient(ServiceQuotasClient);

describe('Create Event', () => {
  beforeEach(() => {
    sqClient.reset();
  });
  test('Create service quota - success', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });

    sqClient
      .on(GetServiceQuotaCommand, {
        ServiceCode: StaticInput.newProps.serviceCode,
        QuotaCode: StaticInput.newProps.quotaCode,
      })
      .resolves({ Quota: { Adjustable: true, Value: 1 } });
    sqClient
      .on(RequestServiceQuotaIncreaseCommand, {
        ServiceCode: StaticInput.newProps.serviceCode,
        QuotaCode: StaticInput.newProps.quotaCode,
        DesiredValue: parseInt(StaticInput.newProps.desiredValue),
      })
      .resolves({});
    expect(await handler(event)).toEqual({ PhysicalResourceId: 'service-quota-limits', Status: 'SUCCESS' });
  });
  test('Create service quota - non-adjustable service', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });

    sqClient
      .on(GetServiceQuotaCommand, {
        ServiceCode: StaticInput.newProps.serviceCode,
        QuotaCode: StaticInput.newProps.quotaCode,
      })
      .resolves({});
    expect(await handler(event)).toEqual({ PhysicalResourceId: 'service-quota-limits', Status: 'SUCCESS' });
  });
});
describe('Update Event', () => {
  beforeEach(() => {
    sqClient.reset();
  });

  test('Update service quotas - error', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.newProps] });
    const serviceCode = event.ResourceProperties['serviceCode'];
    const quotaCode = event.ResourceProperties['quotaCode'];
    const serviceQuotaParams = {
      ServiceCode: serviceCode /* required */,
      QuotaCode: quotaCode,
    };
    const region = process.env['AWS_REGION'];
    const accountId = event.StackId.split(':')[4];
    sqClient.on(GetServiceQuotaCommand, serviceQuotaParams).rejects({});
    await expect(handler(event)).rejects.toThrowError(
      `[service-quota-limits-config] Error increasing service quota ${quotaCode} for service ${serviceCode} in account ${accountId} region ${region}. Error: {}`,
    );
  });
});
describe('Delete Event', () => {
  test('Delete service quota - no action', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });
    const response = await handler(event);
    expect(response?.Status).toBe('SUCCESS');
  });
});
