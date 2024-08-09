import {
  AccountClient,
  GetRegionOptStatusCommand,
  EnableRegionCommand,
  GetRegionOptStatusCommandOutput,
} from '@aws-sdk/client-account';
import { describe, beforeEach, afterEach, expect, test, jest } from '@jest/globals';
import { handler } from '../index';
import { StaticInput } from './static-input';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';
import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

const accountClient = AcceleratorMockClient(AccountClient);

describe('Opt-In Regions Handler', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    accountClient.reset();
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });
  afterEach(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  test('should not complete since opt-in regions are DISABLED', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [StaticInput.input],
    });

    StaticInput.input.props.accountIds.forEach(accountId => {
      accountClient
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          GetRegionOptStatusCommand as any,
          {
            RegionName: StaticInput.input.props.enabledRegions[0],
            AccountId: accountId,
          },
        )
        .resolves({ RegionOptStatus: 'DISABLED' } as GetRegionOptStatusCommandOutput);

      accountClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on(EnableRegionCommand as any, {
          RegionName: StaticInput.input.props.enabledRegions[0],
          AccountId: accountId,
        })
        .resolves({});
    });

    accountClient
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        GetRegionOptStatusCommand as any,
        {
          RegionName: StaticInput.input.props.enabledRegions[0],
        },
      )
      .resolves({ RegionOptStatus: 'DISABLED' } as GetRegionOptStatusCommandOutput);

    accountClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(EnableRegionCommand as any, {
        RegionName: StaticInput.input.props.enabledRegions[0],
      })
      .resolves({});

    const response = await handler(event);
    expect(response).toEqual({ IsComplete: false });
  });

  test('should not complete since opt-in regions are DISABLING', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [StaticInput.input],
    });

    StaticInput.input.props.accountIds.forEach(accountId => {
      accountClient
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          GetRegionOptStatusCommand as any,
          {
            RegionName: StaticInput.input.props.enabledRegions[0],
            AccountId: accountId,
          },
        )
        .resolves({ RegionOptStatus: 'DISABLING' } as GetRegionOptStatusCommandOutput);

      accountClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on(EnableRegionCommand as any, {
          RegionName: StaticInput.input.props.enabledRegions[0],
          AccountId: accountId,
        })
        .resolves({});
    });

    accountClient
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        GetRegionOptStatusCommand as any,
        {
          RegionName: StaticInput.input.props.enabledRegions[0],
        },
      )
      .resolves({ RegionOptStatus: 'DISABLING' } as GetRegionOptStatusCommandOutput);

    accountClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(EnableRegionCommand as any, {
        RegionName: StaticInput.input.props.enabledRegions[0],
      })
      .resolves({});

    const response = await handler(event);
    expect(response).toEqual({ IsComplete: false });
  });

  test('should not complete since opt-in regions are ENABLING', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [StaticInput.input],
    });

    StaticInput.input.props.accountIds.forEach(accountId => {
      accountClient
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          GetRegionOptStatusCommand as any,
          {
            RegionName: StaticInput.input.props.enabledRegions[0],
            AccountId: accountId,
          },
        )
        .resolves({ RegionOptStatus: 'ENABLING' } as GetRegionOptStatusCommandOutput);

      accountClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on(EnableRegionCommand as any, {
          RegionName: StaticInput.input.props.enabledRegions[0],
          AccountId: accountId,
        })
        .resolves({});
    });

    accountClient
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        GetRegionOptStatusCommand as any,
        {
          RegionName: StaticInput.input.props.enabledRegions[0],
        },
      )
      .resolves({ RegionOptStatus: 'ENABLING' } as GetRegionOptStatusCommandOutput);

    accountClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(EnableRegionCommand as any, {
        RegionName: StaticInput.input.props.enabledRegions[0],
      })
      .resolves({});

    const response = await handler(event);
    expect(response).toEqual({ IsComplete: false });
  });

  test('should complete since opt-in regions are ENABLED', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [StaticInput.input],
    });

    StaticInput.input.props.accountIds.forEach(accountId => {
      accountClient
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          GetRegionOptStatusCommand as any,
          {
            RegionName: StaticInput.input.props.enabledRegions[0],
            AccountId: accountId,
          },
        )
        .resolves({ RegionOptStatus: 'ENABLED' } as GetRegionOptStatusCommandOutput);

      accountClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on(EnableRegionCommand as any, {
          RegionName: StaticInput.input.props.enabledRegions[0],
          AccountId: accountId,
        })
        .resolves({});
    });

    accountClient
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        GetRegionOptStatusCommand as any,
        {
          RegionName: StaticInput.input.props.enabledRegions[0],
        },
      )
      .resolves({ RegionOptStatus: 'ENABLED' } as GetRegionOptStatusCommandOutput);

    accountClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(EnableRegionCommand as any, {
        RegionName: StaticInput.input.props.enabledRegions[0],
      })
      .resolves({});

    const response = await handler(event);
    expect(response).toEqual({ IsComplete: true });
  });
});
