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
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  PutSubscriptionFilterCommand,
  DescribeSubscriptionFiltersCommand,
  PutRetentionPolicyCommand,
  AssociateKmsKeyCommand,
  DescribeAccountPoliciesCommand,
  PutAccountPolicyCommand,
  DeleteAccountPolicyCommand,
  PolicyType,
  Scope,
  DeleteSubscriptionFilterCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';
import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';
import { StaticInput } from './static-input';

const cloudWatchLogsMock = AcceleratorMockClient(CloudWatchLogsClient);

describe('update-subscription-policy lambda handler', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    cloudWatchLogsMock.reset();
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  test('Create event with LOG_GROUP subscription type', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [
        { logGroupName: 'test-log-group', retentionInDays: 7 },
        { logGroupName: 'aws-controltower' },
        { logGroupName: '/aws/lambda/excluded-function', retentionInDays: 365 },
      ],
    });
    cloudWatchLogsMock
      .on(DescribeSubscriptionFiltersCommand, { logGroupName: '/aws/lambda/new-excluded-function' })
      .resolves({
        subscriptionFilters: [{ destinationArn: StaticInput.newPropsNoExclusion.acceleratorCreatedLogDestinationArn }],
      });
    cloudWatchLogsMock.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [],
    });
    cloudWatchLogsMock.on(PutSubscriptionFilterCommand).resolves({});
    cloudWatchLogsMock.on(PutRetentionPolicyCommand).resolves({});
    cloudWatchLogsMock.on(AssociateKmsKeyCommand).resolves({});
    cloudWatchLogsMock.on(DeleteSubscriptionFilterCommand).resolves({});

    const response = await handler(event);
    expect(response).toEqual({ Status: 'SUCCESS' });
  });
  test('Create event with LOG_GROUP subscription type with excludeAll', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsExcludeAllLogGroup] });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [
        { logGroupName: 'test-log-group', retentionInDays: 7 },
        { logGroupName: 'aws-controltower' },
        { logGroupName: '/aws/lambda/excluded-function', retentionInDays: 365 },
      ],
    });
    cloudWatchLogsMock.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [{ destinationArn: StaticInput.newPropsNoExclusion.acceleratorCreatedLogDestinationArn }],
    });
    cloudWatchLogsMock.on(PutSubscriptionFilterCommand).resolves({});
    cloudWatchLogsMock.on(PutRetentionPolicyCommand).resolves({});
    cloudWatchLogsMock.on(AssociateKmsKeyCommand).resolves({});
    cloudWatchLogsMock.on(DeleteSubscriptionFilterCommand).resolves({});

    const response = await handler(event);
    expect(response).toEqual({ Status: 'SUCCESS' });
  });
  test('Create event with LOG_GROUP subscription type with no logExclusionOption ', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsNoExclusion] });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group', retentionInDays: 365 }, { logGroupName: 'aws-controltower' }],
    });
    cloudWatchLogsMock.on(DescribeSubscriptionFiltersCommand, { logGroupName: 'test-log-group' }).resolves({
      subscriptionFilters: [{ destinationArn: StaticInput.newPropsNoExclusion.acceleratorCreatedLogDestinationArn }],
    });

    cloudWatchLogsMock.on(PutSubscriptionFilterCommand).resolves({});
    cloudWatchLogsMock.on(PutRetentionPolicyCommand).resolves({});
    cloudWatchLogsMock.on(AssociateKmsKeyCommand).resolves({});

    const response = await handler(event);
    expect(response).toEqual({ Status: 'SUCCESS' });
  });

  test('Create event with LOG_GROUP subscription type with too many subscriptions', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'testError', retentionInDays: 365 }],
    });
    cloudWatchLogsMock.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [{ destinationArn: 'destination-arn1' }, { destinationArn: 'destination-arn2' }],
    });

    await expect(handler(event)).rejects.toThrow(StaticInput.subscriptionError);
  });

  test('Create event with ACCOUNT subscription type', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsAccount] });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group' }],
    });
    cloudWatchLogsMock.on(DescribeAccountPoliciesCommand).resolves({
      accountPolicies: [],
    });
    cloudWatchLogsMock.on(PutAccountPolicyCommand).resolves({});
    cloudWatchLogsMock.on(PutRetentionPolicyCommand).resolves({});
    cloudWatchLogsMock.on(AssociateKmsKeyCommand).resolves({});

    const response = await handler(event);
    expect(response).toEqual({ Status: 'SUCCESS' });
  });

  test('Delete event', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group' }],
    });
    cloudWatchLogsMock.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [
        {
          filterName: 'test-log-group',
          logGroupName: 'test-log-group',
          destinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
        },
      ],
    });
    cloudWatchLogsMock.on(DeleteSubscriptionFilterCommand).resolves({});

    const response = await handler(event);
    expect(response).toEqual({ Status: 'SUCCESS' });
  });
  test('Update event changing from LOG_GROUP to ACCOUNT subscription type', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.newPropsAccount],
      old: [StaticInput.oldPropsLogGroup],
    });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group-1' }, { logGroupName: 'test-log-group-2' }],
    });
    cloudWatchLogsMock.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [
        {
          filterName: 'test-log-group-1',
          logGroupName: 'test-log-group-1',
          destinationArn: StaticInput.oldPropsLogGroup.acceleratorCreatedLogDestinationArn,
        },
        {
          filterName: 'test-log-group-2',
          logGroupName: 'test-log-group-2',
          destinationArn: StaticInput.oldPropsLogGroup.acceleratorCreatedLogDestinationArn,
        },
      ],
    });
    cloudWatchLogsMock.on(DeleteSubscriptionFilterCommand).resolves({});
    cloudWatchLogsMock.on(DescribeAccountPoliciesCommand).resolves({
      accountPolicies: [],
    });
    cloudWatchLogsMock.on(PutAccountPolicyCommand).resolves({});
    cloudWatchLogsMock.on(PutRetentionPolicyCommand).resolves({});
    cloudWatchLogsMock.on(AssociateKmsKeyCommand).resolves({});

    const consoleSpy = jest.spyOn(console, 'info');

    const response = await handler(event);

    expect(response).toEqual({ Status: 'SUCCESS' });
    expect(consoleSpy).toHaveBeenCalledWith(
      `Subscription type changing from LOG_GROUP to ACCOUNT. Will remove log group subscriptions`,
    );
    consoleSpy.mockRestore();
  });
  test('Update event changing from ACCOUNT to LOG_GROUP subscription type', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.newPropsLogGroup],
      old: [StaticInput.oldPropsAccount],
    });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group-1' }, { logGroupName: 'test-log-group-2' }],
    });
    cloudWatchLogsMock.on(DescribeAccountPoliciesCommand).resolves({
      accountPolicies: [
        {
          policyName: StaticInput.policyName,
          policyDocument: JSON.stringify({
            destinationArn: StaticInput.oldPropsAccount.acceleratorCreatedLogDestinationArn,
            roleArn: StaticInput.oldPropsAccount.acceleratorLogSubscriptionRoleArn,
          }),
        },
      ],
    });
    cloudWatchLogsMock.on(DeleteAccountPolicyCommand).resolves({});
    cloudWatchLogsMock.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [],
    });
    cloudWatchLogsMock.on(PutSubscriptionFilterCommand).resolves({});
    cloudWatchLogsMock.on(PutRetentionPolicyCommand).resolves({});
    cloudWatchLogsMock.on(AssociateKmsKeyCommand).resolves({});

    const consoleSpy = jest.spyOn(console, 'info');

    const response = await handler(event);

    expect(response).toEqual({ Status: 'SUCCESS' });
    expect(consoleSpy).toHaveBeenCalledWith(
      `Subscription type changing from ACCOUNT to LOG_GROUP. Will remove account subscriptions`,
    );
    expect(cloudWatchLogsMock.commandCalls(DeleteAccountPolicyCommand)).toHaveLength(1);
    expect(cloudWatchLogsMock.commandCalls(DeleteAccountPolicyCommand)[0].args[0].input).toEqual({
      policyType: PolicyType.SUBSCRIPTION_FILTER_POLICY,
      policyName: StaticInput.policyName,
    });
    expect(cloudWatchLogsMock.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(2);

    consoleSpy.mockRestore();
  });
  test('No existing policy, create new policy', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsAccount] });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group-1' }, { logGroupName: 'test-log-group-2' }],
    });
    cloudWatchLogsMock.on(DescribeAccountPoliciesCommand).resolves({
      accountPolicies: [],
    });
    cloudWatchLogsMock.on(PutAccountPolicyCommand).resolves({});

    const consoleSpy = jest.spyOn(console, 'info');

    const response = await handler(event);

    expect(response).toEqual({ Status: 'SUCCESS' });
    expect(consoleSpy).toHaveBeenCalledWith(
      `No existing policy found, policy ${StaticInput.policyName} will be created.`,
    );
    expect(cloudWatchLogsMock.commandCalls(PutAccountPolicyCommand)).toHaveLength(1);
    expect(cloudWatchLogsMock.commandCalls(PutAccountPolicyCommand)[0].args[0].input).toEqual({
      policyName: StaticInput.policyName,
      policyDocument: expect.any(String),
      policyType: PolicyType.SUBSCRIPTION_FILTER_POLICY,
      selectionCriteria: StaticInput.newPropsAccount.selectionCriteria,
      scope: Scope.ALL,
    });

    consoleSpy.mockRestore();
  });

  test('Existing policy, override existing is false', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [{ ...StaticInput.newPropsAccount, overrideExisting: 'false' }],
      old: [StaticInput.oldPropsAccount],
    });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group-1' }, { logGroupName: 'test-log-group-2' }],
    });
    cloudWatchLogsMock.on(DescribeAccountPoliciesCommand).resolves({
      accountPolicies: [{ policyName: StaticInput.policyName }],
    });

    const consoleSpy = jest.spyOn(console, 'warn');

    const response = await handler(event);

    expect(response).toEqual({ Status: 'SUCCESS' });
    expect(consoleSpy).toHaveBeenCalledWith(
      `Existing policy ${StaticInput.policyName} found, and override existing flag is set to false, skip update of policy.`,
    );
    expect(cloudWatchLogsMock.commandCalls(DeleteAccountPolicyCommand)).toHaveLength(0);
    expect(cloudWatchLogsMock.commandCalls(PutAccountPolicyCommand)).toHaveLength(0);

    consoleSpy.mockRestore();
  });

  test('Existing policy, override existing is true', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.newPropsAccount],
      old: [StaticInput.oldPropsAccount],
    });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group-1' }, { logGroupName: 'test-log-group-2' }],
    });

    cloudWatchLogsMock.on(DescribeAccountPoliciesCommand).resolves({
      accountPolicies: [{ policyName: StaticInput.policyName }],
    });
    cloudWatchLogsMock.on(DeleteAccountPolicyCommand).resolves({});
    cloudWatchLogsMock.on(PutAccountPolicyCommand).resolves({});

    const consoleSpy = jest.spyOn(console, 'info');

    const response = await handler(event);

    expect(response).toEqual({ Status: 'SUCCESS' });
    expect(consoleSpy).toHaveBeenCalledWith(
      `Existing policy ${StaticInput.policyName} found, and override existing flag is set to true, policy will be overwritten.`,
    );
    expect(cloudWatchLogsMock.commandCalls(DeleteAccountPolicyCommand)).toHaveLength(1);
    expect(cloudWatchLogsMock.commandCalls(DeleteAccountPolicyCommand)[0].args[0].input).toEqual({
      policyName: StaticInput.policyName,
      policyType: PolicyType.SUBSCRIPTION_FILTER_POLICY,
    });
    expect(cloudWatchLogsMock.commandCalls(PutAccountPolicyCommand)).toHaveLength(1);

    consoleSpy.mockRestore();
  });
  test('removeReplaceDestination should remove matching subscription filter', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group' }],
    });

    // Mock subscription filters with a matching destination to be removed
    cloudWatchLogsMock.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [
        {
          filterName: 'test-filter',
          logGroupName: 'test-log-group',
          destinationArn: StaticInput.newProps.replaceLogDestinationArn, // This matches replaceLogDestinationArn
        },
      ],
    });

    cloudWatchLogsMock.on(DeleteSubscriptionFilterCommand).resolves({});
    cloudWatchLogsMock.on(PutSubscriptionFilterCommand).resolves({});
    cloudWatchLogsMock.on(PutRetentionPolicyCommand).resolves({});
    cloudWatchLogsMock.on(AssociateKmsKeyCommand).resolves({});

    const consoleSpy = jest.spyOn(console, 'info');

    const response = await handler(event);

    expect(response).toEqual({ Status: 'SUCCESS' });
    expect(consoleSpy).toHaveBeenCalledWith(
      `Removing subscription filter for test-log-group log group, current destination arn is ${StaticInput.newProps.replaceLogDestinationArn}`,
    );
    expect(cloudWatchLogsMock.commandCalls(DeleteSubscriptionFilterCommand)).toHaveLength(1);
    expect(cloudWatchLogsMock.commandCalls(DeleteSubscriptionFilterCommand)[0].args[0].input).toEqual({
      logGroupName: 'test-log-group',
      filterName: 'test-filter',
    });

    consoleSpy.mockRestore();
  });

  test('removeReplaceDestination should not remove non-matching subscription filter', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group' }],
    });

    // Mock subscription filters with a non-matching destination
    cloudWatchLogsMock.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [
        {
          filterName: 'test-filter',
          logGroupName: 'test-log-group',
          destinationArn: 'different-destination-arn', // This doesn't match replaceLogDestinationArn
        },
      ],
    });

    cloudWatchLogsMock.on(PutSubscriptionFilterCommand).resolves({});
    cloudWatchLogsMock.on(PutRetentionPolicyCommand).resolves({});
    cloudWatchLogsMock.on(AssociateKmsKeyCommand).resolves({});

    const consoleSpy = jest.spyOn(console, 'info');

    const response = await handler(event);

    expect(response).toEqual({ Status: 'SUCCESS' });
    expect(cloudWatchLogsMock.commandCalls(DeleteSubscriptionFilterCommand)).toHaveLength(0);

    consoleSpy.mockRestore();
  });

  test('removeReplaceDestination should handle case when replaceLogDestinationArn is undefined', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsNoExclusion] });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group' }],
    });

    cloudWatchLogsMock.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [
        {
          filterName: 'test-filter',
          logGroupName: 'test-log-group',
          destinationArn: 'some-destination-arn',
        },
      ],
    });

    cloudWatchLogsMock.on(PutSubscriptionFilterCommand).resolves({});
    cloudWatchLogsMock.on(PutRetentionPolicyCommand).resolves({});
    cloudWatchLogsMock.on(AssociateKmsKeyCommand).resolves({});

    const response = await handler(event);

    expect(response).toEqual({ Status: 'SUCCESS' });
    expect(cloudWatchLogsMock.commandCalls(DeleteSubscriptionFilterCommand)).toHaveLength(0);
  });
  test('isValidLogExclusionOption should handle invalid JSON string', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsInvalidLogExclusion] });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group' }],
    });
    cloudWatchLogsMock.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [],
    });
    cloudWatchLogsMock.on(PutSubscriptionFilterCommand).resolves({});
    cloudWatchLogsMock.on(PutRetentionPolicyCommand).resolves({});
    cloudWatchLogsMock.on(AssociateKmsKeyCommand).resolves({});

    const response = await handler(event);
    expect(response).toEqual({ Status: 'SUCCESS' });
  });
  test('getExistingSubscriptionPolicies should handle undefined accountPolicies', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsAccount] });

    // Mock DescribeAccountPoliciesCommand to return undefined accountPolicies
    cloudWatchLogsMock.on(DescribeAccountPoliciesCommand).resolves({
      // accountPolicies is intentionally undefined
    });

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group' }],
    });
    cloudWatchLogsMock.on(PutRetentionPolicyCommand).resolves({});
    cloudWatchLogsMock.on(AssociateKmsKeyCommand).resolves({});

    // The handler should throw an error
    await expect(handler(event)).rejects.toThrow(
      'Undefined accountPolicies property received from DescribeAccountPolicies API.',
    );
  });

  test('getExistingSubscriptionPolicies should handle API error', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsAccount] });

    // Mock DescribeAccountPoliciesCommand to throw an error
    cloudWatchLogsMock.on(DescribeAccountPoliciesCommand).rejects(new Error('API Error'));

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group' }],
    });
    cloudWatchLogsMock.on(PutRetentionPolicyCommand).resolves({});
    cloudWatchLogsMock.on(AssociateKmsKeyCommand).resolves({});

    // The handler should throw an error
    await expect(handler(event)).rejects.toThrow('API Error');
  });
  test('deleteSubscriptions should handle ACCOUNT type deletion', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newPropsAccount] });

    cloudWatchLogsMock.on(DescribeAccountPoliciesCommand).resolves({
      accountPolicies: [
        {
          policyName: StaticInput.policyName,
          policyDocument: JSON.stringify({
            destinationArn: StaticInput.newPropsAccount.acceleratorCreatedLogDestinationArn,
            roleArn: StaticInput.newPropsAccount.acceleratorLogSubscriptionRoleArn,
          }),
        },
      ],
    });
    cloudWatchLogsMock.on(DeleteAccountPolicyCommand).resolves({});

    const response = await handler(event);

    expect(response).toEqual({ Status: 'SUCCESS' });
    expect(cloudWatchLogsMock.commandCalls(DeleteAccountPolicyCommand)).toHaveLength(1);
    expect(cloudWatchLogsMock.commandCalls(DeleteAccountPolicyCommand)[0].args[0].input).toEqual({
      policyType: PolicyType.SUBSCRIPTION_FILTER_POLICY,
      policyName: StaticInput.policyName,
    });
  });

  test('deleteSubscriptions should handle ACCOUNT type deletion with different policy name', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newPropsAccount] });

    cloudWatchLogsMock.on(DescribeAccountPoliciesCommand).resolves({
      accountPolicies: [
        {
          policyName: 'DIFFERENT_POLICY_NAME',
          policyDocument: JSON.stringify({
            destinationArn: StaticInput.newPropsAccount.acceleratorCreatedLogDestinationArn,
            roleArn: StaticInput.newPropsAccount.acceleratorLogSubscriptionRoleArn,
          }),
        },
      ],
    });

    const response = await handler(event);

    expect(response).toEqual({ Status: 'SUCCESS' });
    expect(cloudWatchLogsMock.commandCalls(DeleteAccountPolicyCommand)).toHaveLength(0);
  });

  test('deleteSubscriptions should handle LOG_GROUP type deletion', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] }); // Using LOG_GROUP type

    cloudWatchLogsMock.on(DescribeLogGroupsCommand).resolves({
      logGroups: [{ logGroupName: 'test-log-group-1' }, { logGroupName: 'test-log-group-2' }],
    });

    cloudWatchLogsMock.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [
        {
          filterName: 'test-log-group-1',
          logGroupName: 'test-log-group-1',
          destinationArn: StaticInput.newProps.acceleratorCreatedLogDestinationArn,
        },
      ],
    });

    cloudWatchLogsMock.on(DeleteSubscriptionFilterCommand).resolves({});

    const response = await handler(event);

    expect(response).toEqual({ Status: 'SUCCESS' });
  });

  test('deleteSubscriptions should throw error for invalid subscription type', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, {
      new: [
        {
          ...StaticInput.newProps,
          subscriptionType: 'INVALID_TYPE',
        },
      ],
    });

    await expect(handler(event)).rejects.toThrow('Invalid subscription type INVALID_TYPE received from request.');
  });

  test('deleteSubscriptions should handle empty account policies', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newPropsAccount] });

    cloudWatchLogsMock.on(DescribeAccountPoliciesCommand).resolves({
      accountPolicies: [], // Empty array of policies
    });

    const response = await handler(event);

    expect(response).toEqual({ Status: 'SUCCESS' });
    expect(cloudWatchLogsMock.commandCalls(DeleteAccountPolicyCommand)).toHaveLength(0);
  });

  test('deleteSubscriptions should handle undefined account policies', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newPropsAccount] });

    cloudWatchLogsMock.on(DescribeAccountPoliciesCommand).resolves({
      accountPolicies: undefined,
    });

    await expect(handler(event)).rejects.toThrow(
      'Undefined accountPolicies property received from DescribeAccountPolicies API.',
    );
  });
});
