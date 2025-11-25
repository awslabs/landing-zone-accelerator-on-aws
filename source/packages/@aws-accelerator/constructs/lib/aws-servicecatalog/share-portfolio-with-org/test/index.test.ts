import {
  CreatePortfolioShareCommand,
  DeletePortfolioShareCommand,
  DescribePortfolioShareStatusCommand,
  ServiceCatalogClient,
  UpdatePortfolioShareCommand,
} from '@aws-sdk/client-service-catalog';
import { describe, beforeEach, afterEach, expect, test, vi } from 'vitest';

// Mock console output
vi.spyOn(console, 'log').mockImplementation(() => {
  /* mock implementation */
});
vi.spyOn(console, 'error').mockImplementation(() => {
  /* mock implementation */
});
vi.spyOn(console, 'warn').mockImplementation(() => {
  /* mock implementation */
});
vi.spyOn(console, 'info').mockImplementation(() => {
  /* mock implementation */
});
import * as indexModule from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';

const { handler } = indexModule;

import { StaticInput } from './static-input';

import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

describe('share-portfolio-with-org', () => {
  const scClient = AcceleratorMockClient(ServiceCatalogClient);
  vi.setConfig({ testTimeout: 240000 });

  beforeEach(() => {
    scClient.reset();
    vi.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Create Event', () => {
    test('Create share portfolio with org', async () => {
      const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsOrgShare] });
      scClient
        .on(CreatePortfolioShareCommand, {
          PortfolioId: StaticInput.newPropsOrgShare.portfolioId,
          OrganizationNode: { Type: 'ORGANIZATION', Value: StaticInput.newPropsOrgShare.organizationId },
          ShareTagOptions: StaticInput.newPropsOrgShare.tagShareOptions === 'true',
        })
        .resolves({ PortfolioShareToken: 'PortfolioShareToken' });
      scClient
        .on(DescribePortfolioShareStatusCommand, { PortfolioShareToken: 'PortfolioShareToken' })
        .resolvesOnce({ Status: 'NOT_STARTED' })
        .resolvesOnce({ Status: 'IN_PROGRESS' })
        .resolvesOnce({ Status: 'COMPLETED' });

      const response = await handler(event);
      expect(response?.Status).toBe('SUCCESS');
    });

    test('Create share portfolio with org - CreatePortfolioShare API fails', async () => {
      const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsOrgShare] });
      scClient
        .on(CreatePortfolioShareCommand, {
          PortfolioId: StaticInput.newPropsOrgShare.portfolioId,
          OrganizationNode: { Type: 'ORGANIZATION', Value: StaticInput.newPropsOrgShare.organizationId },
          ShareTagOptions: StaticInput.newPropsOrgShare.tagShareOptions === 'true',
        })
        .rejects({});

      const response = await handler(event);
      expect(response?.Status).toBe('FAILED');
    });
  });

  describe('Update Event', () => {
    test('Update share portfolio - both orgId and Org Unit specified', async () => {
      const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.orgIdOrgError] });
      const response = await handler(event);
      expect(response?.Status).toBe('FAILED');
    });

    test('Update share portfolio - no orgId and Org Unit specified', async () => {
      const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.noOrgIdOrgError] });
      const response = await handler(event);
      expect(response?.Status).toBe('FAILED');
    });

    test('Update share portfolio - UpdatePortfolioShare error', async () => {
      const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.newPropsOuShare] });
      scClient.on(UpdatePortfolioShareCommand).rejects({});
      const response = await handler(event);
      expect(response?.Status).toBe('FAILED');
    });

    test('Update share portfolio - successful update', async () => {
      const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.newPropsOuShare] });
      scClient
        .on(UpdatePortfolioShareCommand, {
          PortfolioId: StaticInput.newPropsOuShare.portfolioId,
          OrganizationNode: { Type: 'ORGANIZATIONAL_UNIT', Value: StaticInput.newPropsOuShare.organizationalUnitId },
          ShareTagOptions: StaticInput.newPropsOuShare.tagShareOptions === 'true',
        })
        .resolves({ PortfolioShareToken: 'PortfolioShareToken' });
      scClient
        .on(DescribePortfolioShareStatusCommand, { PortfolioShareToken: 'PortfolioShareToken' })
        .resolvesOnce({ Status: 'NOT_STARTED' })
        .resolvesOnce({ Status: 'IN_PROGRESS' })
        .resolvesOnce({ Status: 'COMPLETED' });
      const response = await handler(event);
      expect(response?.Status).toBe('SUCCESS');
    });
  });

  describe('Delete Event', () => {
    test('Delete share portfolio - DeletePortfolioShare fails', async () => {
      const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newPropsOrgShare] });
      scClient.on(DeletePortfolioShareCommand).rejects({});
      const response = await handler(event);
      expect(response?.Status).toBe('FAILED');
    });

    test('Delete share portfolio - successful delete', async () => {
      const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newPropsOrgShare] });
      scClient
        .on(DeletePortfolioShareCommand, {
          PortfolioId: StaticInput.newPropsOrgShare.portfolioId,
          OrganizationNode: { Type: 'ORGANIZATION', Value: StaticInput.newPropsOrgShare.organizationId },
        })
        .resolves({ PortfolioShareToken: 'PortfolioShareToken' });
      scClient
        .on(DescribePortfolioShareStatusCommand, { PortfolioShareToken: 'PortfolioShareToken' })
        .resolvesOnce({ Status: 'NOT_STARTED' })
        .resolvesOnce({ Status: 'IN_PROGRESS' })
        .resolvesOnce({ Status: 'COMPLETED' });
      const response = await handler(event);
      expect(response?.Status).toBe('SUCCESS');
    });

    test('Delete share portfolio - DescribePortfolioShareStatus fails', async () => {
      const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newPropsOrgShare] });
      scClient
        .on(DeletePortfolioShareCommand, {
          PortfolioId: StaticInput.newPropsOrgShare.portfolioId,
          OrganizationNode: { Type: 'ORGANIZATION', Value: StaticInput.newPropsOrgShare.organizationId },
        })
        .resolves({ PortfolioShareToken: 'PortfolioShareToken' });
      scClient.on(DescribePortfolioShareStatusCommand, { PortfolioShareToken: 'PortfolioShareToken' }).rejects({});
      const response = await handler(event);
      expect(response?.Status).toBe('FAILED');
    });
  });
});
