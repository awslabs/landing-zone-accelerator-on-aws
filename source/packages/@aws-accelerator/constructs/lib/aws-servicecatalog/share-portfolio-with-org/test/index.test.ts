import {
  CreatePortfolioShareCommand,
  DeletePortfolioShareCommand,
  DescribePortfolioShareStatusCommand,
  ServiceCatalogClient,
  UpdatePortfolioShareCommand,
} from '@aws-sdk/client-service-catalog';
import { describe, beforeEach, expect, test, jest } from '@jest/globals';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';

import { StaticInput } from './static-input';

import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

const scClient = AcceleratorMockClient(ServiceCatalogClient);

describe('Create Event', () => {
  jest.setTimeout(240000);
  beforeEach(() => {
    scClient.reset();
  });
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
  jest.setTimeout(240000);
  beforeEach(() => {
    scClient.reset();
  });

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
  jest.setTimeout(240000);
  beforeEach(() => {
    scClient.reset();
  });
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
