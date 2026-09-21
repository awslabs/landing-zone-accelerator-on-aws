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
import {
  MODULE_SESSION_POLICIES,
  getModuleSessionPolicy,
  scopeActionsToResource,
} from '../../lib/common/module-session-policies';

describe('ModuleSessionPolicies', () => {
  describe('Registry completeness', () => {
    it('should have policies for all 8 cross-account modules', () => {
      const expectedModules = [
        'stack-resources-retention',
        'invite-accounts-to-organizations',
        'create-stack-policy',
        'macie',
        'guardduty',
        'config-rule-tagging',
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

    it('every policy should contain only the module and base state management statements', () => {
      const expectedSids = ['ModuleSpecificActions', 'LzaModuleStateTable', 'LzaModuleSsmParameters'];

      for (const [name, policy] of Object.entries(MODULE_SESSION_POLICIES)) {
        const parsed = JSON.parse(policy.policy);
        const sids = parsed.Statement.map((s: { Sid?: string }) => s.Sid);
        expect(sids, `Unexpected statements in ${name}`).toEqual(expectedSids);
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
        expect(moduleStatement.Resource, `Module actions should use wildcard resource in ${name}`).toBe('*');
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

    it('GuardDuty module should include guardduty actions with wildcards', () => {
      const parsed = JSON.parse(MODULE_SESSION_POLICIES['guardduty'].policy);
      const actions: string[] = parsed.Statement.find(
        (s: { Sid?: string }) => s.Sid === 'ModuleSpecificActions',
      ).Action;
      expect(actions.some(a => a.startsWith('guardduty:'))).toBe(true);
      expect(actions.some(a => a.includes('*'))).toBe(true);
    });

    it('GuardDuty module should grant S3 permissions for CreatePublishingDestination', () => {
      const parsed = JSON.parse(MODULE_SESSION_POLICIES['guardduty'].policy);
      const actions: string[] = parsed.Statement.find(
        (s: { Sid?: string }) => s.Sid === 'ModuleSpecificActions',
      ).Action;
      expect(actions).toContain('s3:GetBucketLocation');
      expect(actions).toContain('s3:PutObject');
      expect(actions).toContain('s3:GetObject');
      expect(actions).toContain('s3:ListBucket');
    });

    it('GuardDuty module should grant iam:GetRole and iam:CreateServiceLinkedRole for malware protection SLR', () => {
      // UpdateDetector with EBS_MALWARE_PROTECTION requires iam:GetRole to validate
      // AWSServiceRoleForAmazonGuardDutyMalwareProtection exists.
      // See: https://docs.aws.amazon.com/guardduty/latest/ug/troubleshooting-guardduty-malware-protection-issues.html
      const parsed = JSON.parse(MODULE_SESSION_POLICIES['guardduty'].policy);
      const actions: string[] = parsed.Statement.find(
        (s: { Sid?: string }) => s.Sid === 'ModuleSpecificActions',
      ).Action;
      expect(actions).toContain('iam:GetRole');
      expect(actions).toContain('iam:CreateServiceLinkedRole');
    });

    it('GuardDuty module should grant Organizations trusted-access actions for EBS malware protection', () => {
      // ensureOrganizationsTrustedAccess enables malware-protection.guardduty.amazonaws.com trusted access
      // before regional EC2 Malware Protection configuration.
      const parsed = JSON.parse(MODULE_SESSION_POLICIES['guardduty'].policy);
      const actions: string[] = parsed.Statement.find(
        (s: { Sid?: string }) => s.Sid === 'ModuleSpecificActions',
      ).Action;
      expect(actions).toContain('organizations:ListAWSServiceAccessForOrganization');
      expect(actions).toContain('organizations:EnableAWSServiceAccess');
    });

    it('Config rule tagging should use least-privilege Config actions', () => {
      const parsed = JSON.parse(MODULE_SESSION_POLICIES['config-rule-tagging'].policy);
      const actions: string[] = parsed.Statement.find(
        (s: { Sid?: string }) => s.Sid === 'ModuleSpecificActions',
      ).Action;
      expect(actions).toEqual([
        'config:DescribeConfigRules',
        'config:ListTagsForResource',
        'config:TagResource',
        'config:UntagResource',
        'ssm:GetParameters',
      ]);
    });

    it('only Config rule tagging should include read-only batched SSM parameter access', () => {
      for (const [name, policy] of Object.entries(MODULE_SESSION_POLICIES)) {
        const parsed = JSON.parse(policy.policy);
        const actions: string[] = parsed.Statement.find(
          (item: { Sid?: string }) => item.Sid === 'ModuleSpecificActions',
        ).Action;

        if (name === 'config-rule-tagging') {
          expect(actions).toContain('ssm:GetParameters');
        } else {
          expect(actions, `Unexpected ssm:GetParameters in ${name}`).not.toContain('ssm:GetParameters');
        }
      }
    });
  });

  describe('scopeActionsToResource', () => {
    const S3_OBJECT_ACTIONS = ['s3:PutObject', 's3:GetObject'];
    const SID = 'GuardDutyFindingsExportObjects';

    const wildcardActions = (policy: string): string[] =>
      JSON.parse(policy).Statement.find((s: { Sid?: string }) => s.Sid === 'ModuleSpecificActions')?.Action ?? [];
    const scopedStatement = (policy: string) =>
      JSON.parse(policy).Statement.find((s: { Sid?: string }) => s.Sid === SID);

    it('should move object actions to a statement scoped to the given resource', () => {
      const result = scopeActionsToResource(
        MODULE_SESSION_POLICIES['guardduty'].policy,
        S3_OBJECT_ACTIONS,
        'arn:aws:s3:::aws-accelerator-central-logs-111111111111-us-east-1/guardduty/*',
        SID,
      );

      expect(wildcardActions(result)).not.toContain('s3:PutObject');
      expect(wildcardActions(result)).not.toContain('s3:GetObject');
      expect(scopedStatement(result)).toEqual({
        Sid: SID,
        Effect: 'Allow',
        Action: ['s3:PutObject', 's3:GetObject'],
        Resource: 'arn:aws:s3:::aws-accelerator-central-logs-111111111111-us-east-1/guardduty/*',
      });
    });

    it('should leave non-targeted actions on the wildcard statement', () => {
      const result = scopeActionsToResource(
        MODULE_SESSION_POLICIES['guardduty'].policy,
        S3_OBJECT_ACTIONS,
        'arn:aws:s3:::bucket/guardduty/*',
        SID,
      );

      // Bucket-level S3 and all guardduty/iam actions must be untouched
      expect(wildcardActions(result)).toContain('s3:GetBucketLocation');
      expect(wildcardActions(result)).toContain('s3:ListBucket');
      expect(wildcardActions(result)).toContain('guardduty:*Detector*');
      expect(wildcardActions(result)).toContain('iam:CreateServiceLinkedRole');
      expect(wildcardActions(result)).toContain('iam:GetRole');
    });

    it('should preserve the base state-table and SSM statements', () => {
      const original = JSON.parse(MODULE_SESSION_POLICIES['guardduty'].policy);
      const result = JSON.parse(
        scopeActionsToResource(
          MODULE_SESSION_POLICIES['guardduty'].policy,
          S3_OBJECT_ACTIONS,
          'arn:aws:s3:::bucket/guardduty/*',
          SID,
        ),
      );

      for (const sid of ['LzaModuleStateTable', 'LzaModuleSsmParameters']) {
        expect(result.Statement.find((s: { Sid?: string }) => s.Sid === sid)).toEqual(
          original.Statement.find((s: { Sid?: string }) => s.Sid === sid),
        );
      }
      expect(result.Version).toEqual(original.Version);
    });

    it('should return the policy unchanged when no resource is supplied', () => {
      const policy = MODULE_SESSION_POLICIES['guardduty'].policy;
      expect(scopeActionsToResource(policy, S3_OBJECT_ACTIONS, '', SID)).toEqual(policy);
    });

    it('should return the policy unchanged when none of the actions are present', () => {
      const policy = MODULE_SESSION_POLICIES['macie'].policy;
      expect(scopeActionsToResource(policy, ['s3:PutObject', 's3:GetObject'], 'arn:aws:s3:::bucket/*', SID)).toEqual(
        policy,
      );
    });

    it('should stay within the STS 2048 character limit', () => {
      const result = scopeActionsToResource(
        MODULE_SESSION_POLICIES['guardduty'].policy,
        S3_OBJECT_ACTIONS,
        'arn:aws-us-gov:s3:::aws-accelerator-central-logs-111111111111-us-gov-west-1/guardduty/*',
        SID,
      );
      expect(result.length).toBeLessThanOrEqual(2048);
    });

    it('should produce valid JSON with a non-empty wildcard statement', () => {
      const result = scopeActionsToResource(
        MODULE_SESSION_POLICIES['guardduty'].policy,
        S3_OBJECT_ACTIONS,
        'arn:aws:s3:::bucket/guardduty/*',
        SID,
      );
      expect(() => JSON.parse(result)).not.toThrow();
      expect(wildcardActions(result).length).toBeGreaterThan(0);
    });

    it('should drop the wildcard statement if every action is scoped away', () => {
      const single = JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Sid: 'ModuleSpecificActions', Effect: 'Allow', Action: ['s3:PutObject'], Resource: '*' }],
      });
      const result = JSON.parse(scopeActionsToResource(single, ['s3:PutObject'], 'arn:aws:s3:::bucket/*', SID));

      expect(result.Statement.find((s: { Sid?: string }) => s.Sid === 'ModuleSpecificActions')).toBeUndefined();
      expect(result.Statement).toHaveLength(1);
      expect(result.Statement[0].Resource).toEqual('arn:aws:s3:::bucket/*');
    });

    it('should throw if the narrowed policy exceeds the STS limit', () => {
      const long = JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'ModuleSpecificActions',
            Effect: 'Allow',
            Action: ['s3:PutObject', ...Array.from({ length: 60 }, (_, i) => `service:LongishActionName${i}`)],
            Resource: '*',
          },
        ],
      });
      expect(() => scopeActionsToResource(long, ['s3:PutObject'], `arn:aws:s3:::${'b'.repeat(300)}/*`, SID)).toThrow(
        /exceeds STS 2048 character limit/,
      );
    });
  });
});
