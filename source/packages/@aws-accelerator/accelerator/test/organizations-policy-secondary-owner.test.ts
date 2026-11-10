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

/**
 * Policies that more than one stack declares must only be detached or deleted by the stack that owns them.
 *
 * - Tag policies are declared by the OrganizationsStack in every enabled region. The home region owns them.
 * - SCPs, RCPs and declarative policies are declared by both the AccountsStack and the FinalizeStack in the
 *   global region. The AccountsStack owns them.
 *
 * Secondary owner stacks get SKIP_ORGANIZATIONS_POLICY_DELETE on the create-policy and attach-policy provider
 * Lambdas. The custom resources themselves must not change, so no customer stack receives Update events.
 */

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, test } from 'vitest';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { OrganizationsStack } from '../lib/stacks/organizations-stack';
import { cloneWithOverrides, Create, memoize } from './accelerator-test-helpers';
import { snapShotTest } from './snapshot-test';

const SKIP_ENV = 'SKIP_ORGANIZATIONS_POLICY_DELETE';
const CREATE_POLICY_PROVIDER = 'CustomOrganizationsCreatePolicyCustomResourceProviderHandler';
const ATTACH_POLICY_PROVIDER = 'CustomOrganizationsAttachPolicyCustomResourceProviderHandler';
const POLICY_PROVIDERS = [CREATE_POLICY_PROVIDER, ATTACH_POLICY_PROVIDER];

const getOrganizationsStacks = memoize(Create.stacksProvider(AcceleratorStage.ORGANIZATIONS));
const getHomeOrganizationsStack = () => getOrganizationsStacks().stacks.get('Management-us-east-1')!;
const getNonHomeOrganizationsStack = () => getOrganizationsStacks().stacks.get('Management-us-west-2')!;
const getAccountsStack = memoize(Create.stackProvider('Management-us-east-1', AcceleratorStage.ACCOUNTS));
const getFinalizeStack = memoize(Create.stackProvider('Management-us-east-1', AcceleratorStage.FINALIZE));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CfnResource = { Type: string; Properties?: any };

function resources(stack: cdk.Stack): Record<string, CfnResource> {
  return Template.fromStack(stack).toJSON()['Resources'] as Record<string, CfnResource>;
}

/**
 * Returns the environment variables of the provider Lambda whose logical ID starts with the given prefix.
 * Fails if the stack does not contain exactly one such Lambda.
 */
function providerVariables(stack: cdk.Stack, logicalIdPrefix: string): Record<string, unknown> | undefined {
  const matches = Object.entries(resources(stack)).filter(
    ([logicalId, resource]) => logicalId.startsWith(logicalIdPrefix) && resource.Type === 'AWS::Lambda::Function',
  );
  expect(matches).toHaveLength(1);
  return matches[0][1].Properties?.Environment?.Variables;
}

function customResourcePropertyNames(stack: cdk.Stack, type: string): string[][] {
  return Object.values(resources(stack))
    .filter(resource => resource.Type === type)
    .map(resource => Object.keys(resource.Properties ?? {}).sort());
}

describe('OrganizationsStack policy ownership', () => {
  test.each(POLICY_PROVIDERS)('home region %s does not skip deletes', provider => {
    expect(providerVariables(getHomeOrganizationsStack(), provider)?.[SKIP_ENV]).toBeUndefined();
  });

  test.each(POLICY_PROVIDERS)('non-home region %s skips deletes', provider => {
    expect(providerVariables(getNonHomeOrganizationsStack(), provider)?.[SKIP_ENV]).toStrictEqual('true');
  });

  test('non-home region declares only tag policies through the shared providers', () => {
    const policyTypes = Object.values(resources(getNonHomeOrganizationsStack()))
      .filter(resource => ['Custom::CreatePolicy', 'Custom::AttachPolicy'].includes(resource.Type))
      .map(resource => resource.Properties.type);

    expect(policyTypes.length).toBeGreaterThan(0);
    expect(new Set(policyTypes)).toStrictEqual(new Set(['TAG_POLICY']));
  });

  test('non-home region keeps every tag policy resource and logical ID the home region declares', () => {
    const tagResourceIds = (stack: cdk.Stack) =>
      Object.entries(resources(stack))
        .filter(
          ([, resource]) =>
            ['Custom::CreatePolicy', 'Custom::AttachPolicy'].includes(resource.Type) &&
            resource.Properties.type === 'TAG_POLICY',
        )
        .map(([logicalId]) => logicalId)
        .sort();

    expect(tagResourceIds(getNonHomeOrganizationsStack())).toStrictEqual(tagResourceIds(getHomeOrganizationsStack()));
  });

  test.each(['Custom::CreatePolicy', 'Custom::AttachPolicy'])(
    'non-home region %s resources carry no new properties',
    type => {
      const homeTagPropertyNames = customResourcePropertyNames(getHomeOrganizationsStack(), type);
      for (const propertyNames of customResourcePropertyNames(getNonHomeOrganizationsStack(), type)) {
        expect(homeTagPropertyNames).toContainEqual(propertyNames);
        expect(propertyNames).not.toContain('secondaryOwner');
        expect(propertyNames).not.toContain(SKIP_ENV);
      }
    },
  );

  test('non-home region does not skip deletes when the home region is not an enabled region', () => {
    const acceleratorTestStacks = getOrganizationsStacks();
    const props = acceleratorTestStacks['props'] as AcceleratorStackProps;
    const globalConfig = cloneWithOverrides(props.globalConfig, { enabledRegions: ['us-west-2'] });

    const stack = new OrganizationsStack(new cdk.App(), 'OrganizationsStackHomeRegionNotEnabled', {
      ...props,
      globalConfig,
      env: { account: props.accountsConfig.getManagementAccountId(), region: 'us-west-2' },
    });

    for (const provider of POLICY_PROVIDERS) {
      expect(providerVariables(stack, provider)?.[SKIP_ENV]).toBeUndefined();
    }
  });
});

describe('Global region policy ownership', () => {
  test.each(POLICY_PROVIDERS)('AccountsStack %s does not skip deletes', provider => {
    expect(providerVariables(getAccountsStack()!, provider)?.[SKIP_ENV]).toBeUndefined();
  });

  test.each(POLICY_PROVIDERS)('FinalizeStack %s skips deletes', provider => {
    expect(providerVariables(getFinalizeStack()!, provider)?.[SKIP_ENV]).toStrictEqual('true');
  });

  /**
   * The FinalizeStack skips every policy delete because the AccountsStack removes the same policies and
   * attachments. That only holds if both stacks declare exactly the same resources.
   */
  test('FinalizeStack declares exactly the policies and attachments the AccountsStack declares', () => {
    const declared = (stack: cdk.Stack) =>
      Object.fromEntries(
        Object.entries(resources(stack))
          .filter(([, resource]) => ['Custom::CreatePolicy', 'Custom::AttachPolicy'].includes(resource.Type))
          .map(([logicalId, resource]) => [
            logicalId,
            {
              resourceType: resource.Type,
              name: resource.Properties.name,
              type: resource.Properties.type,
              targetId: resource.Properties.targetId,
              policyId: resource.Properties.policyId,
            },
          ]),
      );

    const accountsDeclared = declared(getAccountsStack()!);
    const finalizeDeclared = declared(getFinalizeStack()!);

    const policyTypes = new Set(Object.values(finalizeDeclared).map(resource => resource.type));
    expect(policyTypes).toContain('SERVICE_CONTROL_POLICY');
    expect(Object.values(finalizeDeclared).some(resource => resource.resourceType === 'Custom::AttachPolicy')).toBe(
      true,
    );
    expect(finalizeDeclared).toStrictEqual(accountsDeclared);
  });
});

describe('OrganizationsStack non-home region', () => {
  snapShotTest('Construct(OrganizationsStack us-west-2): ', getNonHomeOrganizationsStack);
});
