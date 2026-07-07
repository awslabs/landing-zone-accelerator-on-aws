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

import { describe, it, expect } from 'vitest';
import { MODULE_SESSION_POLICIES, getModuleSessionPolicy } from '../../lib/common/module-session-policies';

describe('ModuleSessionPolicies', () => {
  describe('Registry completeness', () => {
    it('should have policies for all 7 cross-account modules', () => {
      const expectedModules = [
        'stack-resources-retention',
        'invite-accounts-to-organizations',
        'create-stack-policy',
        'macie',
        'get-cloudformation-templates',
        'tgw-associations-and-propagations',
        'accounts',
      ];

      for (const moduleName of expectedModules) {
        expect(MODULE_SESSION_POLICIES[moduleName], `Missing policy for module: ${moduleName}`).toBeDefined();
      }
      expect(Object.keys(MODULE_SESSION_POLICIES)).toHaveLength(expectedModules.length);
    });
  });

  describe('Policy structure', () => {
    it('every policy should be valid JSON', () => {
      for (const [name, policy] of Object.entries(MODULE_SESSION_POLICIES)) {
        expect(() => JSON.parse(policy.policy), `Invalid JSON for module: ${name}`).not.toThrow();
      }
    });

    it('every policy should be under 2048 characters', () => {
      for (const [name, policy] of Object.entries(MODULE_SESSION_POLICIES)) {
        expect(
          policy.policy.length,
          `Policy for ${name} exceeds 2048 chars (${policy.policy.length})`,
        ).toBeLessThanOrEqual(2048);
      }
    });

    it('every policy should have Version 2012-10-17', () => {
      for (const [name, policy] of Object.entries(MODULE_SESSION_POLICIES)) {
        const parsed = JSON.parse(policy.policy);
        expect(parsed.Version, `Missing Version in ${name}`).toBe('2012-10-17');
      }
    });

    it('every policy should contain base state management statements', () => {
      for (const [name, policy] of Object.entries(MODULE_SESSION_POLICIES)) {
        const parsed = JSON.parse(policy.policy);
        const sids = parsed.Statement.map((s: { Sid?: string }) => s.Sid);
        expect(sids, `Missing LzaModuleStateTable in ${name}`).toContain('LzaModuleStateTable');
        expect(sids, `Missing LzaModuleSsmParameters in ${name}`).toContain('LzaModuleSsmParameters');
      }
    });

    it('base DynamoDB statement should be resource-scoped to Module-State tables', () => {
      for (const [name, policy] of Object.entries(MODULE_SESSION_POLICIES)) {
        const parsed = JSON.parse(policy.policy);
        const ddbStatement = parsed.Statement.find((s: { Sid?: string }) => s.Sid === 'LzaModuleStateTable');
        expect(ddbStatement.Resource, `DynamoDB not scoped in ${name}`).toEqual([
          'arn:*:dynamodb:*:*:table/*-Module-State-*',
        ]);
      }
    });

    it('base SSM statement should be resource-scoped to accelerator parameters', () => {
      for (const [name, policy] of Object.entries(MODULE_SESSION_POLICIES)) {
        const parsed = JSON.parse(policy.policy);
        const ssmStatement = parsed.Statement.find((s: { Sid?: string }) => s.Sid === 'LzaModuleSsmParameters');
        expect(ssmStatement.Resource, `SSM not scoped in ${name}`).toEqual(['arn:*:ssm:*:*:parameter/*accelerator*']);
      }
    });

    it('every policy should have a ModuleSpecificActions statement', () => {
      for (const [name, policy] of Object.entries(MODULE_SESSION_POLICIES)) {
        const parsed = JSON.parse(policy.policy);
        const moduleStatement = parsed.Statement.find((s: { Sid?: string }) => s.Sid === 'ModuleSpecificActions');
        expect(moduleStatement, `Missing ModuleSpecificActions in ${name}`).toBeDefined();
        expect(moduleStatement.Action.length, `No actions declared for ${name}`).toBeGreaterThan(0);
      }
    });
  });

  // NOTE: Session tags (sts:TagSession) are intentionally NOT implemented.
  // AWSControlTowerExecution trust policy only allows sts:AssumeRole.
  // Control Tower owns this role — we cannot modify its trust policy.
  // Session policies work without trust policy changes (restrict via intersection).

  describe('getModuleSessionPolicy', () => {
    it('should return policy for registered module', () => {
      const policy = getModuleSessionPolicy('macie');
      expect(policy).toBeDefined();
      expect(policy!.moduleName).toBe('macie');
    });

    it('should return undefined for unregistered module', () => {
      const policy = getModuleSessionPolicy('nonexistent-module');
      expect(policy).toBeUndefined();
    });
  });

  describe('Module-specific action validation', () => {
    it('TGW module should include ec2 and directconnect actions', () => {
      const parsed = JSON.parse(MODULE_SESSION_POLICIES['tgw-associations-and-propagations'].policy);
      const actions: string[] = parsed.Statement.find(
        (s: { Sid?: string }) => s.Sid === 'ModuleSpecificActions',
      ).Action;
      expect(actions.some(a => a.startsWith('ec2:'))).toBe(true);
      expect(actions.some(a => a.startsWith('directconnect:'))).toBe(true);
    });

    it('Macie module should include macie2 actions with wildcards for packed size', () => {
      const parsed = JSON.parse(MODULE_SESSION_POLICIES['macie'].policy);
      const actions: string[] = parsed.Statement.find(
        (s: { Sid?: string }) => s.Sid === 'ModuleSpecificActions',
      ).Action;
      expect(actions.some(a => a.startsWith('macie2:'))).toBe(true);
      expect(actions.some(a => a.includes('*'))).toBe(true);
    });

    it('Macie module should grant iam:CreateServiceLinkedRole', () => {
      // macie2:EnableMacie implicitly creates AWSServiceRoleForAmazonMacie on first enablement
      // in a member account; the clamped session must allow that or EnableMacie 400s.
      const parsed = JSON.parse(MODULE_SESSION_POLICIES['macie'].policy);
      const actions: string[] = parsed.Statement.find(
        (s: { Sid?: string }) => s.Sid === 'ModuleSpecificActions',
      ).Action;
      expect(actions).toContain('iam:CreateServiceLinkedRole');
    });
  });
});
