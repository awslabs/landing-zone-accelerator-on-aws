import {
  ServiceQuotasClient,
  GetServiceQuotaCommand,
  RequestServiceQuotaIncreaseCommand,
} from '@aws-sdk/client-service-quotas';
import { afterEach, describe, beforeEach, expect, test, vi } from 'vitest';
import { handler, requestServiceQuotaIncrease } from '../index';
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
  test('Create service quota - ResourceAlreadyExistsException is tolerated', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });

    sqClient
      .on(GetServiceQuotaCommand, {
        ServiceCode: StaticInput.newProps.serviceCode,
        QuotaCode: StaticInput.newProps.quotaCode,
      })
      .resolves({ Quota: { Adjustable: true, Value: 1 } });
    // An open increase request from a prior run already exists; AWS allows only one per quota
    const alreadyExistsError = new Error('Only one open service quota increase request is allowed per quota.');
    alreadyExistsError.name = 'ResourceAlreadyExistsException';
    sqClient.on(RequestServiceQuotaIncreaseCommand).rejects(alreadyExistsError);
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

describe('requestServiceQuotaIncrease', () => {
  const increaseRequest = {
    ServiceCode: StaticInput.newProps.serviceCode,
    QuotaCode: StaticInput.newProps.quotaCode,
    DesiredValue: parseInt(StaticInput.newProps.desiredValue),
  };

  function namedError(name: string, message: string) {
    const error = new Error(message);
    error.name = name;
    return error;
  }

  // Signals that the account has hit its cap on concurrently active increase requests.
  const capacityError = () => namedError('QuotaExceededException', 'You have exceeded your maximum quota requests.');

  beforeEach(() => {
    sqClient.reset();
    // Run the capacity backoff delays immediately instead of waiting seconds.
    vi.spyOn(global, 'setTimeout').mockImplementation((callback: () => void) => {
      callback();
      return 0 as unknown as NodeJS.Timeout;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('retries until active-request capacity becomes available', async () => {
    sqClient.on(RequestServiceQuotaIncreaseCommand).rejectsOnce(capacityError()).resolves({});

    await expect(requestServiceQuotaIncrease(new ServiceQuotasClient({}), increaseRequest)).resolves.toEqual({});
    expect(sqClient.commandCalls(RequestServiceQuotaIncreaseCommand)).toHaveLength(2);
  });

  test('rethrows the capacity error after bounded retries', async () => {
    const error = capacityError();
    sqClient.on(RequestServiceQuotaIncreaseCommand).rejects(error);

    await expect(requestServiceQuotaIncrease(new ServiceQuotasClient({}), increaseRequest)).rejects.toBe(error);
    expect(sqClient.commandCalls(RequestServiceQuotaIncreaseCommand)).toHaveLength(12);
  });

  test('does not retry unrelated errors', async () => {
    const error = namedError('AccessDeniedException', 'Not authorized');
    sqClient.on(RequestServiceQuotaIncreaseCommand).rejects(error);

    await expect(requestServiceQuotaIncrease(new ServiceQuotasClient({}), increaseRequest)).rejects.toBe(error);
    expect(sqClient.commandCalls(RequestServiceQuotaIncreaseCommand)).toHaveLength(1);
  });

  test('does not retry an existing open request, leaving it to the handler', async () => {
    // ResourceAlreadyExistsException is terminal here; the handler tolerates it as an idempotent
    // re-apply, so retrying would only add latency.
    const error = namedError('ResourceAlreadyExistsException', 'Only one open request is allowed per quota.');
    sqClient.on(RequestServiceQuotaIncreaseCommand).rejects(error);

    await expect(requestServiceQuotaIncrease(new ServiceQuotasClient({}), increaseRequest)).rejects.toBe(error);
    expect(sqClient.commandCalls(RequestServiceQuotaIncreaseCommand)).toHaveLength(1);
  });
});
