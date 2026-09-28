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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import {
  ListPoliciesCommand,
  ListPoliciesForTargetCommand,
  ListTagsForResourceCommand,
  OrganizationsClient,
  PolicySummary,
} from '@aws-sdk/client-organizations';
import { validateServiceControlPolicyCount } from '../../lib/lambdas/validate-environment';

const POLICY_TAG_KEY = 'lzaManaged';

type ScpConfig = Parameters<typeof validateServiceControlPolicyCount>[1][number];

const fullAwsAccess: PolicySummary = {
  Id: 'p-FullAWSAccess',
  Name: 'FullAWSAccess',
  Type: 'SERVICE_CONTROL_POLICY',
  AwsManaged: true,
};

function lzaPolicy(name: string): PolicySummary {
  return { Id: `p-${name}`, Name: name, Type: 'SERVICE_CONTROL_POLICY', AwsManaged: false };
}

function ctGuardrail(ouName: string): PolicySummary {
  return {
    Id: `p-guardrail-${ouName}`,
    Name: `aws-guardrails-${ouName}`,
    Type: 'SERVICE_CONTROL_POLICY',
    AwsManaged: false,
  };
}

/**
 * Builds an org-config style SCP list: `scpCount` LZA policies, each targeting every OU in `ouNames`.
 */
function buildConfig(scpNames: string[], ouNames: string[], strategy = 'deny-list'): ScpConfig[] {
  return scpNames.map(name => ({
    name,
    targetType: 'ou' as const,
    strategy,
    targets: ouNames.map(ou => ({ name: ou, id: `ou-${ou}` })),
  }));
}

describe('validate-environment SCP count validation', () => {
  let orgsMock: AwsClientStub<OrganizationsClient>;
  let orgClient: OrganizationsClient;

  beforeEach(() => {
    orgsMock = mockClient(OrganizationsClient);
    orgClient = new OrganizationsClient({});
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    orgsMock.restore();
    vi.restoreAllMocks();
  });

  /** Wire ListTagsForResource so every `p-<lza scp>` id reports lzaManaged=Yes and everything else reports no tag. */
  function mockTags(lzaScpNames: string[]) {
    orgsMock.on(ListTagsForResourceCommand).callsFake(input => {
      const isLza = lzaScpNames.some(name => input.ResourceId === `p-${name}`);
      return { Tags: isLza ? [{ Key: POLICY_TAG_KEY, Value: 'Yes' }] : [] };
    });
  }

  it('never calls ListPolicies and looks up tags at most once per distinct policy id', async () => {
    // Shape of LZA-1735: many targets, the same 8 LZA SCPs attached to each, plus FullAWSAccess and a
    // Control Tower guardrail SCP unique to each OU. Previously this cost targets x attached x pages calls.
    const scpNames = Array.from({ length: 8 }, (_, i) => `Scp${i}`);
    const ouNames = Array.from({ length: 42 }, (_, i) => `ou${i}`);
    const config = buildConfig(scpNames, ouNames);

    orgsMock.on(ListPoliciesForTargetCommand).callsFake(input => {
      const ouName = String(input.TargetId).replace(/^ou-/, '');
      return { Policies: [fullAwsAccess, ctGuardrail(ouName), ...scpNames.map(lzaPolicy)] };
    });
    mockTags(scpNames);

    const errors = await validateServiceControlPolicyCount(orgClient, config, POLICY_TAG_KEY, 10, 10);

    expect(errors).toEqual([]);
    expect(orgsMock.commandCalls(ListPoliciesCommand).length).toBe(0);
    // one ListPoliciesForTarget per distinct target, regardless of how many SCPs list that target
    expect(orgsMock.commandCalls(ListPoliciesForTargetCommand).length).toBe(ouNames.length);
    // 8 shared LZA policies + 42 unique guardrails; FullAWSAccess is AwsManaged and never tag-checked
    const tagCalls = orgsMock.commandCalls(ListTagsForResourceCommand);
    expect(tagCalls.length).toBe(scpNames.length + ouNames.length);
    const tagIds = tagCalls.map(call => call.args[0].input.ResourceId);
    expect(new Set(tagIds).size).toBe(tagIds.length);
  });

  it('reports a target that would exceed the limit after adding new config SCPs', async () => {
    // 9 attached (FullAWSAccess + 8 LZA), config adds 2 more that are not yet attached -> 11 > 10
    const attached = Array.from({ length: 8 }, (_, i) => `Scp${i}`);
    const config = buildConfig([...attached, 'NewA', 'NewB'], ['workloads']);

    orgsMock.on(ListPoliciesForTargetCommand).resolves({ Policies: [fullAwsAccess, ...attached.map(lzaPolicy)] });
    mockTags([...attached, 'NewA', 'NewB']);

    const errors = await validateServiceControlPolicyCount(orgClient, config, POLICY_TAG_KEY, 10, 10);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Max Allowed SCPs for ou "workloads" is 10, found total 11 scps/);
  });

  it('does not count an LZA managed SCP that is attached but no longer targets this OU in config', async () => {
    // Stale LZA policy attached from a previous config: it will be detached, so it must not count.
    const config = buildConfig(['Keep1', 'Keep2'], ['workloads']);
    const attached = [fullAwsAccess, lzaPolicy('Keep1'), lzaPolicy('Keep2'), lzaPolicy('Stale')];
    // pad with 7 non-LZA (customer managed) policies so the stale one is the deciding factor: 10 vs 11
    const customer = Array.from({ length: 7 }, (_, i) => ({
      Id: `p-cust${i}`,
      Name: `Customer${i}`,
      Type: 'SERVICE_CONTROL_POLICY',
      AwsManaged: false,
    })) as PolicySummary[];

    orgsMock.on(ListPoliciesForTargetCommand).resolves({ Policies: [...attached, ...customer] });
    mockTags(['Keep1', 'Keep2', 'Stale']);

    const errors = await validateServiceControlPolicyCount(orgClient, config, POLICY_TAG_KEY, 10, 10);

    expect(errors).toEqual([]);
  });

  it('counts a customer managed (non-LZA, non-AWS) SCP that is attached out of band', async () => {
    const config = buildConfig(
      Array.from({ length: 9 }, (_, i) => `Scp${i}`),
      ['workloads'],
    );
    const attached: PolicySummary[] = [
      fullAwsAccess,
      { Id: 'p-external', Name: 'ExternalScp', Type: 'SERVICE_CONTROL_POLICY', AwsManaged: false },
    ];
    orgsMock.on(ListPoliciesForTargetCommand).resolves({ Policies: attached });
    mockTags(config.map(item => item.name));

    const errors = await validateServiceControlPolicyCount(orgClient, config, POLICY_TAG_KEY, 10, 10);

    // FullAWSAccess + ExternalScp + 9 new = 11
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/found total 11 scps/);
  });

  it('reduces the count by one for allow-list strategy when FullAWSAccess is attached', async () => {
    const scps = Array.from({ length: 10 }, (_, i) => `Scp${i}`);
    const config = buildConfig(scps, ['workloads'], 'allow-list');
    orgsMock.on(ListPoliciesForTargetCommand).resolves({ Policies: [fullAwsAccess] });
    mockTags(scps);

    // 10 new + FullAWSAccess = 11, but allow-list detaches FullAWSAccess -> 10, within limit
    const errors = await validateServiceControlPolicyCount(orgClient, config, POLICY_TAG_KEY, 10, 10);
    expect(errors).toEqual([]);
  });

  it('treats FullAWSAccess as AWS managed even when the AwsManaged flag is absent', async () => {
    // ListPoliciesForTarget is the only source of policy metadata now, so the allow-list adjustment must not
    // depend on AwsManaged being populated. p-FullAWSAccess is recognised by id.
    const scps = Array.from({ length: 10 }, (_, i) => `Scp${i}`);
    const config = buildConfig(scps, ['workloads'], 'allow-list');
    orgsMock.on(ListPoliciesForTargetCommand).resolves({
      Policies: [{ Id: 'p-FullAWSAccess', Name: 'FullAWSAccess', Type: 'SERVICE_CONTROL_POLICY' }],
    });
    mockTags(scps);

    const errors = await validateServiceControlPolicyCount(orgClient, config, POLICY_TAG_KEY, 10, 10);

    expect(errors).toEqual([]);
    // never tag-checked, because it is recognised as AWS managed by id
    expect(orgsMock.commandCalls(ListTagsForResourceCommand).length).toBe(0);
  });

  it('lists new config SCPs before existing attached SCPs in the error message', async () => {
    // Message content is customer facing and is asserted here so the ordering does not drift.
    const config = buildConfig(['NewA', 'NewB'], ['workloads']);
    orgsMock
      .on(ListPoliciesForTargetCommand)
      .resolves({ Policies: [fullAwsAccess, lzaPolicy('Old1'), lzaPolicy('Old2')] });
    mockTags(['NewA', 'NewB']);

    const errors = await validateServiceControlPolicyCount(orgClient, config, POLICY_TAG_KEY, 4, 4);

    expect(errors).toEqual([
      'Max Allowed SCPs for ou "workloads" is 4, found total 5 scps in updated list to attach. ' +
        'Updated list of scps for attachment is NewA,NewB,FullAWSAccess,Old1,Old2',
    ]);
  });

  it('validates an OU and an account that share a name independently', async () => {
    // Target names are only unique within a target type, so an OU and an account may both be called "Security".
    // Each must be validated against its own limit rather than the second being skipped as already processed.
    const scps = Array.from({ length: 6 }, (_, i) => `Scp${i}`);
    const config: ScpConfig[] = [
      ...scps.map(name => ({
        name,
        targetType: 'ou' as const,
        strategy: 'deny-list',
        targets: [{ name: 'Security', id: 'ou-security' }],
      })),
      ...scps.map(name => ({
        name,
        targetType: 'account' as const,
        strategy: 'deny-list',
        targets: [{ name: 'Security', id: '111111111111' }],
      })),
    ];

    orgsMock.on(ListPoliciesForTargetCommand).resolves({ Policies: [fullAwsAccess] });
    mockTags(scps);

    // 6 new + FullAWSAccess = 7 for both targets: within the OU limit of 10, over the account limit of 5
    const errors = await validateServiceControlPolicyCount(orgClient, config, POLICY_TAG_KEY, 10, 5);

    expect(orgsMock.commandCalls(ListPoliciesForTargetCommand).length).toBe(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Max Allowed SCPs for account "Security" is 5, found total 7 scps/);
  });

  it('paginates ListPoliciesForTarget and handles targets with no attached policies', async () => {
    const config = buildConfig(['A', 'B'], ['workloads']);
    orgsMock
      .on(ListPoliciesForTargetCommand)
      .resolvesOnce({ Policies: [fullAwsAccess], NextToken: 'next' })
      .resolvesOnce({ Policies: [lzaPolicy('A')] });
    mockTags(['A', 'B']);

    const errors = await validateServiceControlPolicyCount(orgClient, config, POLICY_TAG_KEY, 10, 10);

    expect(errors).toEqual([]);
    expect(orgsMock.commandCalls(ListPoliciesForTargetCommand).length).toBe(2);
    expect(orgsMock.commandCalls(ListTagsForResourceCommand).length).toBe(1);
  });
});
