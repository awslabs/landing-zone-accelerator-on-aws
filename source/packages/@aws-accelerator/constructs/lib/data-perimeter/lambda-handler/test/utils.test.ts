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

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { compareResourcePolicies } from '../src/common/utils';
import { PolicyDocument, PolicyStatementType } from '../src/common/common-resources';

const mandatedPolicy: PolicyDocument = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'DenyExternalPrincipals',
      Effect: 'Deny',
      Principal: '*',
      Action: 's3:*',
      Resource: ['arn:aws:s3:::example', 'arn:aws:s3:::example/*'],
      Condition: {
        StringNotEquals: {
          'aws:PrincipalOrgID': 'o-example',
        },
      },
    },
  ],
};

describe('compareResourcePolicies (no SourceAccount allowlist configured — baseline-only)', () => {
  it('returns COMPLIANT when the current policy exactly matches the mandated baseline', async () => {
    const result = await compareResourcePolicies(mandatedPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns COMPLIANT when the current policy carries legitimate extras alongside the mandated baseline', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'AllowLegitimateConsumer',
          Effect: 'Allow',
          Principal: { AWS: 'arn:aws:iam::111111111111:role/DataConsumer' },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
        },
        {
          Effect: 'Allow',
          Principal: { AWS: 'arn:aws:iam::222222222222:root' },
          Action: 's3:ListBucket',
          Resource: ['arn:aws:s3:::example'],
        },
      ],
    };

    const result = await compareResourcePolicies(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns NON_COMPLIANT when the current policy is missing a mandated statement', async () => {
    const currPolicy: PolicyDocument = { Version: '2012-10-17', Statement: [] };

    const result = await compareResourcePolicies(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('DenyExternalPrincipals');
  });

  it('returns NON_COMPLIANT when a mandated statement has been mutated', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          ...mandatedPolicy.Statement[0],
          Effect: 'Allow',
        },
      ],
    };

    const result = await compareResourcePolicies(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('not identical');
  });

  it('returns NON_COMPLIANT when the current policy is undefined', async () => {
    const result = await compareResourcePolicies(undefined, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toBe('Resource policy is empty');
  });

  it('returns NON_COMPLIANT when the mandated policy is undefined', async () => {
    const result = await compareResourcePolicies(mandatedPolicy, undefined);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toBe('Mandatory resource policy is empty');
  });

  it('returns NON_COMPLIANT when a mandated Sid appears more than once in the current policy', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          ...mandatedPolicy.Statement[0],
          Effect: 'Allow',
          Principal: { AWS: 'arn:aws:iam::999999999999:root' },
        },
      ],
    };

    const result = await compareResourcePolicies(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('appears more than once');
  });

  it('returns COMPLIANT regardless of the order of mandated statements in the current policy', async () => {
    const multiMandated: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'DenyInsecureTransport',
          Effect: 'Deny',
          Principal: '*',
          Action: 's3:*',
          Resource: ['arn:aws:s3:::example', 'arn:aws:s3:::example/*'],
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        },
      ],
    };
    const reordered: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [multiMandated.Statement[1], multiMandated.Statement[0]],
    };

    const result = await compareResourcePolicies(reordered, multiMandated);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns COMPLIANT when both policies have empty Statement arrays', async () => {
    const empty: PolicyDocument = { Version: '2012-10-17', Statement: [] };

    const result = await compareResourcePolicies(empty, empty);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns NON_COMPLIANT when only one of several mandated statements is missing', async () => {
    const multiMandated: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'DenyInsecureTransport',
          Effect: 'Deny',
          Principal: '*',
          Action: 's3:*',
          Resource: ['arn:aws:s3:::example', 'arn:aws:s3:::example/*'],
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        },
      ],
    };
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [multiMandated.Statement[0]],
    };

    const result = await compareResourcePolicies(currPolicy, multiMandated);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('DenyInsecureTransport');
  });

  it('treats a policy whose Statement is undefined as having no statements', async () => {
    const currPolicy = { Version: '2012-10-17' } as unknown as PolicyDocument;

    const result = await compareResourcePolicies(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('DenyExternalPrincipals');
  });
});

describe('compareResourcePolicies (SourceAccount allowlist configured — statement-level check)', () => {
  let compare: typeof compareResourcePolicies;

  beforeAll(async () => {
    vi.stubEnv('SourceAccount', '111111111111,222222222222');
    vi.stubEnv('ORG_ID', 'o-example');
    vi.stubEnv('ACCOUNT_ID', '333333333333');
    vi.resetModules();
    ({ compareResourcePolicies: compare } = await import('../src/common/utils'));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns COMPLIANT when the only extra statement is an Allow to an account in the SourceAccount allowlist', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'AllowListedAccount',
          Effect: 'Allow',
          Principal: { AWS: 'arn:aws:iam::111111111111:role/DataConsumer' },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns COMPLIANT when the only extra statement is scoped by aws:PrincipalOrgID to this org', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'AllowInOrgOnly',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
          Condition: { StringEquals: { 'aws:PrincipalOrgID': 'o-example' } },
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns COMPLIANT when the only extra statement grants access to the resource account itself', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'EnableRootAccess',
          Effect: 'Allow',
          Principal: { AWS: 'arn:aws:iam::333333333333:root' },
          Action: 'kms:*',
          Resource: '*',
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns NON_COMPLIANT for a backdoor Allow to an in-org account outside the allowlist', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'BackdoorAllow',
          Effect: 'Allow',
          Principal: { AWS: 'arn:aws:iam::999999999999:root' },
          Action: 's3:*',
          Resource: ['arn:aws:s3:::example/*'],
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('BackdoorAllow');
    expect(result.annotation).toContain('SourceAccount allowlist');
  });

  it('returns NON_COMPLIANT for an extra statement scoped by aws:PrincipalOrgID to a different org', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'AllowForeignOrg',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
          Condition: { StringEquals: { 'aws:PrincipalOrgID': 'o-foreign' } },
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('AllowForeignOrg');
  });

  it('returns NON_COMPLIANT for an appended statement with no Sid granting an unlisted account', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Effect: 'Allow',
          Principal: { AWS: 'arn:aws:iam::444444444444:root' },
          Action: 's3:ListBucket',
          Resource: ['arn:aws:s3:::example'],
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('(no Sid)');
  });

  it('returns NON_COMPLIANT for an array Principal.AWS of ARNs containing an unlisted account', async () => {
    // An array-valued Principal.AWS is valid in resource policies. Each element must be
    // evaluated individually: a single-string cast throws, and a comma-joined compare
    // matches neither regex so a mixed array would pass silently.
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'ArrayArns',
          Effect: 'Allow',
          Principal: { AWS: ['arn:aws:iam::111111111111:role/Ok', 'arn:aws:iam::999999999999:root'] },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('ArrayArns');
  });

  it('returns NON_COMPLIANT for an array Principal.AWS of bare account ids containing an unlisted account', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'ArrayBareIds',
          Effect: 'Allow',
          Principal: { AWS: ['111111111111', '999999999999'] },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('ArrayBareIds');
  });

  it('returns COMPLIANT for an array Principal.AWS where every account is allowlisted', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'ArrayAllListed',
          Effect: 'Allow',
          Principal: { AWS: ['111111111111', 'arn:aws:iam::222222222222:root'] },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns NON_COMPLIANT for an array aws:SourceArn condition containing an unlisted account', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'ArraySourceArn',
          Effect: 'Allow',
          Principal: { Service: 'sns.amazonaws.com' },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
          Condition: {
            StringEquals: { 'aws:SourceArn': ['arn:aws:sns:us-east-1:999999999999:topic'] },
          },
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('ArraySourceArn');
  });

  it('returns COMPLIANT when a customer Deny names an account outside the allowlist', async () => {
    // A Deny restricts access rather than granting it, so the account it names being
    // unlisted is not a finding. Flagging it would fail resources that are stricter than
    // the mandated baseline.
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'CustomerDenyUnlistedAccount',
          Effect: 'Deny',
          Principal: { AWS: '999999999999' },
          Action: 's3:*',
          Resource: ['arn:aws:s3:::example/*'],
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns COMPLIANT when a wildcard principal is scoped by aws:PrincipalOrgPaths to an OU in this org', async () => {
    // PrincipalOrgPaths narrows access to an OU inside the org, so it is stricter than
    // PrincipalOrgID. It is conventionally written with ForAnyValue:StringLike rather than
    // StringEquals, so the operator name must not be assumed.
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'AllowWorkloadsOuOnly',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
          Condition: {
            'ForAnyValue:StringLike': { 'aws:PrincipalOrgPaths': ['o-example/r-abc1/ou-abc1-workloads/*'] },
          },
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns NON_COMPLIANT when aws:PrincipalOrgPaths points at a different org', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'AllowForeignOrgOu',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
          Condition: {
            'ForAnyValue:StringLike': { 'aws:PrincipalOrgPaths': ['o-attacker/r-abc1/ou-abc1-workloads/*'] },
          },
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('AllowForeignOrgOu');
  });

  it('returns NON_COMPLIANT when only one of several aws:PrincipalOrgPaths values is in this org', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'AllowMixedOrgPaths',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
          Condition: {
            'ForAnyValue:StringLike': {
              'aws:PrincipalOrgPaths': ['o-example/r-abc1/ou-abc1-workloads/*', 'o-attacker/r-xyz9/*'],
            },
          },
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('AllowMixedOrgPaths');
  });

  it('returns NON_COMPLIANT for an org ID that merely prefixes this org in aws:PrincipalOrgPaths', async () => {
    // 'o-example2' must not pass a startsWith check against 'o-example'.
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'AllowPrefixOrg',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
          Condition: {
            'ForAnyValue:StringLike': { 'aws:PrincipalOrgPaths': ['o-example2/r-abc1/*'] },
          },
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('AllowPrefixOrg');
  });

  it('returns COMPLIANT for a customer Deny naming a wildcard principal', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'CustomerDenyInsecureTransport',
          Effect: 'Deny',
          Principal: '*',
          Action: 's3:*',
          Resource: ['arn:aws:s3:::example/*'],
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns NON_COMPLIANT for a wildcard Principal that is not scoped to this org', async () => {
    // '*' yields no account to compare against the allowlist, so without an explicit
    // wildcard check this grant to every principal would pass while a single named
    // unauthorized account is flagged.
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'OpenAccess',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('OpenAccess');
  });

  it('returns NON_COMPLIANT for a wildcard Principal given as { AWS: "*" }', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'OpenAccessObj',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('OpenAccessObj');
  });

  it('returns COMPLIANT for a wildcard Principal scoped to an allowlisted account by aws:SourceAccount', async () => {
    // Principal '*' narrowed by aws:SourceAccount is the documented pattern for service
    // integrations such as S3 -> SNS. The condition restricts the grant, so it must not
    // be rejected merely for naming a wildcard.
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'ScopedWildcard',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: 'SNS:Publish',
          Condition: { StringEquals: { 'aws:SourceAccount': '111111111111' } },
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns NON_COMPLIANT for a wildcard Principal scoped to an account outside the allowlist', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'ScopedWildcardUnlisted',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: 'SNS:Publish',
          Condition: { StringEquals: { 'aws:SourceAccount': '999999999999' } },
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('ScopedWildcardUnlisted');
  });

  it('returns COMPLIANT for a wildcard Principal scoped to this org by aws:PrincipalOrgID', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'WildcardInOrg',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
          Condition: { StringEquals: { 'aws:PrincipalOrgID': 'o-example' } },
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('returns NON_COMPLIANT for a statement granting an unauthenticated Lambda function URL', async () => {
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'PublicFunctionUrl',
          Effect: 'Allow',
          Principal: { AWS: '111111111111' },
          Action: 'lambda:InvokeFunctionUrl',
          Condition: { StringEquals: { 'lambda:FunctionUrlAuthType': 'NONE' } },
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('PublicFunctionUrl');
  });

  it('still reports mandated-baseline drift ahead of the statement-level check', async () => {
    // A missing mandated statement is a stronger signal than an extra Allow being fine.
    // Confirm the mandated-baseline loop still fires first even when the allowlist is configured.
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowListedAccount',
          Effect: 'Allow',
          Principal: { AWS: 'arn:aws:iam::111111111111:role/DataConsumer' },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('DenyExternalPrincipals');
  });
});

describe("compareResourcePolicies (SourceAccount 'ALL' — unrestricted opt-in)", () => {
  let compare: typeof compareResourcePolicies;

  beforeAll(async () => {
    vi.stubEnv('SourceAccount', 'ALL');
    vi.stubEnv('ORG_ID', 'o-example');
    vi.stubEnv('ACCOUNT_ID', '333333333333');
    vi.resetModules();
    ({ compareResourcePolicies: compare } = await import('../src/common/utils'));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns COMPLIANT for statements that would otherwise fail the allowlist check', async () => {
    // 'ALL' is a documented opt-in to unrestricted access. If this short-circuit is ever
    // broken by a refactor, a wave of resources would be wrongly driven into remediation.
    const currPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        mandatedPolicy.Statement[0],
        {
          Sid: 'UnlistedAccount',
          Effect: 'Allow',
          Principal: { AWS: '999999999999' },
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
        },
        {
          Sid: 'WildcardOpen',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: ['arn:aws:s3:::example/*'],
        },
      ],
    };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('COMPLIANT');
  });

  it('still flags mandated-baseline drift when SourceAccount is ALL', async () => {
    const currPolicy: PolicyDocument = { Version: '2012-10-17', Statement: [] };

    const result = await compare(currPolicy, mandatedPolicy);

    expect(result.complianceType).toBe('NON_COMPLIANT');
    expect(result.annotation).toContain('DenyExternalPrincipals');
  });
});

describe('checkStatementCompliance (added strictness is opt-in)', () => {
  let check: (statement: PolicyStatementType, options?: Record<string, boolean>) => boolean;
  let subsetOptions: Record<string, boolean>;
  const orgScoped = (value: string | string[], operator = 'StringLike'): PolicyStatementType => ({
    Sid: 'OrgScoped',
    Effect: 'Allow',
    Principal: { AWS: '*' },
    Action: 's3:GetObject',
    Condition: { [operator]: { 'aws:PrincipalOrgID': value } },
  });

  beforeAll(async () => {
    vi.stubEnv('SourceAccount', '111111111111');
    vi.stubEnv('ORG_ID', 'o-example');
    vi.stubEnv('ACCOUNT_ID', '333333333333');
    vi.resetModules();
    ({ checkStatementCompliance: check, SUBSET_CHECK_OPTIONS: subsetOptions } = await import(
      '../src/common/statement-compliance'
    ));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const unscopedWildcard: PolicyStatementType = {
    Sid: 'PublicInvoke',
    Effect: 'Allow',
    Principal: { AWS: '*' },
    Action: 'lambda:InvokeFunction',
  };

  it('accepts an unscoped wildcard by default, preserving Lambda / Private CA behavior', () => {
    // The Allowed-Only strategies remediate by rewriting the statement, and Lambda cannot
    // narrow a wildcard in place. Rejecting it here would make remediation delete and
    // re-add the same statement on every evaluation without ever converging.
    expect(check(unscopedWildcard)).toBe(true);
  });

  it('rejects an unscoped wildcard when the caller opts in', () => {
    expect(check(unscopedWildcard, { rejectUnscopedWildcard: true })).toBe(false);
  });

  it('accepts a wildcard narrowed by aws:SourceAccount to an allowlisted account even when opted in', () => {
    const scoped: PolicyStatementType = {
      ...unscopedWildcard,
      Condition: { StringEquals: { 'aws:SourceAccount': '111111111111' } },
    };

    expect(check(scoped, { rejectUnscopedWildcard: true })).toBe(true);
  });

  const notPrincipalAllow: PolicyStatementType = {
    Sid: 'Backdoor',
    Effect: 'Allow',
    NotPrincipal: { AWS: 'arn:aws:iam::333333333333:role/placeholder' },
    Action: 's3:*',
  };

  it('accepts a NotPrincipal statement by default, preserving Lambda / Private CA behavior', () => {
    expect(check(notPrincipalAllow)).toBe(true);
  });

  it('rejects a NotPrincipal Allow when the caller opts in', () => {
    // NotPrincipal means "everyone except", so it grants every account outside the named
    // set. Without this, the tampering this check exists to catch is evadable by writing
    // the backdoor with NotPrincipal instead of Principal.
    expect(check(notPrincipalAllow, { rejectNotPrincipal: true })).toBe(false);
  });

  it('accepts a NotPrincipal statement that is still scoped to this org', () => {
    const orgScoped: PolicyStatementType = {
      ...notPrincipalAllow,
      Condition: { StringEquals: { 'aws:PrincipalOrgID': 'o-example' } },
    };

    expect(check(orgScoped, subsetOptions)).toBe(true);
  });

  it.each([
    ['ArnEquals', { ArnEquals: { 'aws:SourceArn': 'arn:aws:sns:us-east-1:333333333333:topic' } }],
    ['ArnLike', { ArnLike: { 'aws:SourceArn': 'arn:aws:sns:us-east-1:333333333333:topic' } }],
    ['StringLike', { StringLike: { 'aws:SourceArn': 'arn:aws:sns:us-east-1:333333333333:*' } }],
    ['StringEquals', { StringEquals: { 'aws:SourceArn': 'arn:aws:sns:us-east-1:333333333333:topic' } }],
  ])('accepts a wildcard scoped by aws:SourceArn under %s to this account', (_operator, Condition) => {
    // This is the queue policy AWS generates when subscribing SQS to SNS. Reading only a
    // fixed operator would flag a correct, same-account policy.
    expect(
      check(
        { Sid: 'SnsToSqs', Effect: 'Allow', Principal: { AWS: '*' }, Action: 'SQS:SendMessage', Condition },
        subsetOptions,
      ),
    ).toBe(true);
  });

  it('still rejects a wildcard scoped by aws:SourceArn under ArnEquals to an unlisted account', () => {
    const foreign: PolicyStatementType = {
      Sid: 'SnsToSqsForeign',
      Effect: 'Allow',
      Principal: { AWS: '*' },
      Action: 'SQS:SendMessage',
      Condition: { ArnEquals: { 'aws:SourceArn': 'arn:aws:sns:us-east-1:999999999999:topic' } },
    };

    expect(check(foreign, subsetOptions)).toBe(false);
  });

  it.each([
    ['exact value', 'o-example'],
    ['trailing wildcard after the full org id', 'o-example*'],
    ['path-style wildcard after the full org id', 'o-example/*'],
  ])('accepts a wildcard scoped to this org by aws:PrincipalOrgID StringLike as an %s', (_label, value) => {
    const orgScoped: PolicyStatementType = {
      ...unscopedWildcard,
      Condition: { StringLike: { 'aws:PrincipalOrgID': value } },
    };

    expect(check(orgScoped, subsetOptions)).toBe(true);
  });

  it.each([
    [['o-example', 'o-attacker'], false, 'a mixed array grants either org, so it is not org scoping'],
    [['o-example', 'o-example/*'], true, 'every value names this org'],
    [[], false, 'an empty array scopes nothing — [].every() is vacuously true'],
  ])('array-valued aws:PrincipalOrgID %s -> %s', (value, want) => {
    const stmt: PolicyStatementType = {
      Sid: 'MultiOrgId',
      Effect: 'Allow',
      Principal: { AWS: '999999999999' },
      Action: 's3:GetObject',
      Condition: { StringEquals: { 'aws:PrincipalOrgID': value as string[] } },
    };

    expect(check(stmt, subsetOptions)).toBe(want);
  });

  it('accepts an array-valued aws:PrincipalOrgID naming this org', () => {
    // A StringEquals condition value may legitimately be an array. Comparing an array to a
    // string is always unequal, so the strict reject must apply only to scalar values.
    const arrayOrgId: PolicyStatementType = {
      Sid: 'ArrayOrgId',
      Effect: 'Allow',
      Principal: { AWS: '999999999999' },
      Action: 's3:GetObject',
      Condition: { StringEquals: { 'aws:PrincipalOrgID': ['o-example'] } },
    };

    expect(check(arrayOrgId, subsetOptions)).toBe(true);
  });

  it.each([
    ['a different org', 'o-attacker*'],
    ['only a different org, via a longer divergent prefix', 'o-exampleX*'],
    ['every org', '*'],
    ['every org id, via a bare prefix', 'o-*'],
    ['a prefix shorter than this org id', 'o-exam*'],
  ])('rejects a wildcard whose aws:PrincipalOrgID StringLike pattern also matches %s', (_label, value) => {
    // A pattern whose literal prefix is shorter than the org id matches other orgs too, so
    // it is not org scoping. 'o-exam*' matches 'o-example' AND 'o-examfoo'.
    const pattern: PolicyStatementType = {
      ...unscopedWildcard,
      Condition: { StringLike: { 'aws:PrincipalOrgID': value } },
    };

    expect(check(pattern, subsetOptions)).toBe(false);
  });

  it.each([
    ['aws:PrincipalOrgID', { StringNotEquals: { 'aws:PrincipalOrgID': 'o-example' } }],
    ['aws:PrincipalOrgPaths', { StringNotLike: { 'aws:PrincipalOrgPaths': 'o-example/r-abc1/*' } }],
    ['aws:SourceAccount', { StringNotEquals: { 'aws:SourceAccount': '111111111111' } }],
  ])('rejects a wildcard whose only %s condition uses a negation operator', (_label, Condition) => {
    // A negation operator inverts the value: "not this org" grants everyone outside it.
    // Reading the value as scoping would turn a cross-org grant into evidence of safety.
    expect(check({ ...unscopedWildcard, Condition }, subsetOptions)).toBe(false);
  });

  it('rejects a wildcard listed alongside an allowlisted account in Principal.AWS', () => {
    // An account named next to '*' narrows nothing — the '*' still grants everyone. Only a
    // condition can scope a wildcard, so the guard must ignore principal-derived accounts.
    const wildcardPlusAccount: PolicyStatementType = {
      Sid: 'WildcardWithFriend',
      Effect: 'Allow',
      Principal: { AWS: ['*', '111111111111'] },
      Action: 's3:GetObject',
    };

    expect(check(wildcardPlusAccount, subsetOptions)).toBe(false);
  });

  it('rejects a Federated principal whose ARN names an unlisted account', () => {
    const federated: PolicyStatementType = {
      Sid: 'FederatedBackdoor',
      Effect: 'Allow',
      Principal: { Federated: 'arn:aws:iam::999999999999:saml-provider/x' },
      Action: 'sts:AssumeRoleWithSAML',
    };

    expect(check(federated, subsetOptions)).toBe(false);
  });

  it('rejects an account named under a misspelled principal key', () => {
    // A lookup on Principal.AWS alone silently ignores any other key, so a grant written
    // under 'aws' would never be assessed.
    const misspelled: PolicyStatementType = {
      Sid: 'LowercaseKey',
      Effect: 'Allow',
      Principal: { aws: 'arn:aws:iam::999999999999:root' } as unknown as Record<string, string>,
      Action: 's3:GetObject',
    };

    expect(check(misspelled, subsetOptions)).toBe(false);
  });

  it('still accepts a service principal, which names a service rather than an account', () => {
    const service: PolicyStatementType = {
      Sid: 'ServiceOnly',
      Effect: 'Allow',
      Principal: { Service: 'cloudtrail.amazonaws.com' },
      Action: 's3:PutObject',
    };

    expect(check(service, subsetOptions)).toBe(true);
  });

  // (1) Exhaustive enumeration of the aws:PrincipalOrgID pattern space, rather than examples.
  // ORG_ID is 'o-example'. A trailing-wildcard pattern scopes to this org only when its
  // literal prefix is the org id, or the org id followed by '/'. Every other prefix relation
  // matches a different organization.
  describe('aws:PrincipalOrgID pattern space', () => {
    const IN_ORG = [
      'o-example', // exact, no wildcard
      'o-example*', // prefix equals the org id
      'o-example/*', // prefix is the org id plus a separator
      'o-example/r-abc1*', // prefix descends into this org
    ];
    const NOT_IN_ORG = [
      '*', // empty prefix: every org
      'o-*', // short prefix: every org id
      'o-exam*', // short prefix: this org and its prefix-siblings
      'o-exampl*', // short prefix, one char off
      'o-exampleX*', // longer divergent prefix: only other orgs, never this one
      'o-example2*', // prefix-sibling org
      'o-attacker*', // unrelated org
      'o-attacker', // unrelated org, exact
      'example*', // org id not at the start
      'x-o-example*', // org id embedded, not at the start
      '', // empty value
    ];

    it.each(IN_ORG)('accepts %s as in-org', value => {
      expect(check(orgScoped(value), subsetOptions)).toBe(true);
    });

    it.each(NOT_IN_ORG)('rejects %s as not in-org', value => {
      expect(check(orgScoped(value), subsetOptions)).toBe(false);
    });
  });

  // (2) Every option must default to off. Derived from the option profile itself, so adding a
  // new option without a default-off test fails here rather than silently reaching Lambda/PCA.
  describe('every strictness option defaults to off', () => {
    it('SUBSET_CHECK_OPTIONS enables at least one option per known key', () => {
      expect(Object.values(subsetOptions).every(v => v === true)).toBe(true);
      expect(Object.keys(subsetOptions).length).toBeGreaterThan(0);
    });

    it.each([
      ['rejectUnscopedWildcard', { Sid: 'A', Effect: 'Allow', Principal: { AWS: '*' }, Action: 's3:GetObject' }],
      [
        'rejectNotPrincipal',
        { Sid: 'A', Effect: 'Allow', NotPrincipal: { AWS: 'arn:aws:iam::333333333333:root' }, Action: 's3:GetObject' },
      ],
      [
        'acceptOrgScoping',
        {
          Sid: 'A',
          Effect: 'Allow',
          Principal: { AWS: '999999999999' },
          Action: 's3:GetObject',
          Condition: { StringLike: { 'aws:PrincipalOrgID': 'o-example*' } },
        },
      ],
      [
        // A service principal, so the wildcard guard is not involved: with the option off the
        // ArnEquals condition is unread and no account is found, so the statement passes; with
        // it on, the unlisted account it names is found and the statement fails.
        'operatorAgnosticConditions',
        {
          Sid: 'A',
          Effect: 'Allow',
          Principal: { Service: 'sns.amazonaws.com' },
          Action: 's3:GetObject',
          Condition: { ArnEquals: { 'aws:SourceArn': 'arn:aws:sns:us-east-1:999999999999:t' } },
        },
      ],
      [
        'scanAllPrincipalFields',
        {
          Sid: 'A',
          Effect: 'Allow',
          Principal: { Federated: 'arn:aws:iam::999999999999:saml-provider/x' },
          Action: 'sts:AssumeRoleWithSAML',
        },
      ],
    ])('%s changes the verdict only when explicitly enabled', (option, statement) => {
      const withDefaults = check(statement as PolicyStatementType);
      const withOption = check(statement as PolicyStatementType, { [option]: true });
      expect(Object.keys(subsetOptions)).toContain(option);
      expect(withDefaults).not.toBe(withOption);
    });
  });

  // Service-to-service scoping keys. These sit alongside the principal-scoped keys and are
  // what AWS itself writes: aws:SourceOwner is the key in the DEFAULT SNS topic policy.
  describe('service-to-service scoping condition keys', () => {
    const wildcardWith = (Condition: Record<string, unknown>): PolicyStatementType => ({
      Sid: '__default_statement_ID',
      Effect: 'Allow',
      Principal: { AWS: '*' },
      Action: ['SNS:Publish', 'SNS:Subscribe'],
      Condition: Condition as PolicyStatementType['Condition'],
    });

    it.each([
      [
        'AWS:SourceOwner naming the resource account (default SNS policy)',
        { StringEquals: { 'AWS:SourceOwner': '333333333333' } },
        true,
      ],
      ['aws:SourceOwner naming an allowlisted account', { StringEquals: { 'aws:SourceOwner': '111111111111' } }, true],
      ['aws:SourceOwner naming an unlisted account', { StringEquals: { 'aws:SourceOwner': '999999999999' } }, false],
      ['aws:SourceOrgID naming this org', { StringEquals: { 'aws:SourceOrgID': 'o-example' } }, true],
      ['aws:SourceOrgID naming another org', { StringEquals: { 'aws:SourceOrgID': 'o-attacker' } }, false],
      [
        'aws:SourceOrgPaths under this org',
        { 'ForAnyValue:StringLike': { 'aws:SourceOrgPaths': 'o-example/r-abc1/*' } },
        true,
      ],
      [
        'aws:SourceOrgPaths under another org',
        { 'ForAnyValue:StringLike': { 'aws:SourceOrgPaths': 'o-attacker/r-abc1/*' } },
        false,
      ],
      [
        'StringNotEquals aws:SourceOwner (negated, grants everyone else)',
        { StringNotEquals: { 'aws:SourceOwner': '333333333333' } },
        false,
      ],
    ])('%s', (_label, Condition, want) => {
      expect(check(wildcardWith(Condition as Record<string, unknown>), subsetOptions)).toBe(want);
    });

    it.each([
      ['StringEqualsIfExists aws:SourceAccount', { StringEqualsIfExists: { 'aws:SourceAccount': '111111111111' } }],
      [
        'ArnLikeIfExists aws:SourceArn',
        { ArnLikeIfExists: { 'aws:SourceArn': 'arn:aws:sns:us-east-1:111111111111:t' } },
      ],
      ['StringEqualsIfExists aws:PrincipalOrgID', { StringEqualsIfExists: { 'aws:PrincipalOrgID': 'o-example' } }],
      ['StringEqualsIfExists aws:SourceOwner', { StringEqualsIfExists: { 'aws:SourceOwner': '333333333333' } }],
    ])('rejects a wildcard whose only scoping is %s', (_label, Condition) => {
      // ...IfExists is satisfied whenever the key is absent from the request context, so it
      // constrains nothing: a direct-principal request carries no aws:SourceAccount and the
      // condition evaluates true, leaving Principal: '*' granting everyone.
      expect(check(wildcardWith(Condition as Record<string, unknown>), subsetOptions)).toBe(false);
    });

    it.each([
      [
        'ForAllValues:StringLike aws:PrincipalOrgID',
        { 'ForAllValues:StringLike': { 'aws:PrincipalOrgID': 'o-example' } },
      ],
      [
        'ForAllValues:StringEquals aws:SourceAccount',
        { 'ForAllValues:StringEquals': { 'aws:SourceAccount': '111111111111' } },
      ],
      ['an operator this module does not recognise', { SomeFutureOperator: { 'aws:SourceAccount': '111111111111' } }],
      ['Null aws:SourceAccount', { Null: { 'aws:SourceAccount': 'false' } }],
    ])('rejects a wildcard whose only scoping is %s', (_label, Condition) => {
      // Only operators that genuinely constrain a request count as scoping. ForAllValues is
      // vacuously true when the request carries no value for the key, and an unrecognised
      // operator must fail closed rather than be trusted.
      expect(check(wildcardWith(Condition as Record<string, unknown>), subsetOptions)).toBe(false);
    });

    it('accepts ForAnyValue, which fails closed on an absent key', () => {
      expect(
        check(
          wildcardWith({ 'ForAnyValue:StringLike': { 'aws:PrincipalOrgPaths': 'o-example/r-abc1/*' } }),
          subsetOptions,
        ),
      ).toBe(true);
    });

    it('leaves the Lambda / Private CA path unchanged for aws:SourceOwner', () => {
      // Default options must not read the key, so this statement passes there as before.
      expect(check(wildcardWith({ StringEquals: { 'aws:SourceOwner': '999999999999' } }))).toBe(true);
    });
  });

  // (3) Every condition key the check reads may arrive as a scalar or an array.
  describe('condition values accepted as scalar or array', () => {
    it.each([
      ['aws:PrincipalOrgID', 'StringEquals', 'o-example', true],
      ['aws:PrincipalOrgID', 'StringLike', 'o-example*', true],
      ['aws:PrincipalOrgPaths', 'ForAnyValue:StringLike', 'o-example/r-abc1/*', true],
      ['aws:SourceAccount', 'StringEquals', '111111111111', true],
      ['aws:SourceAccount', 'StringEquals', '999999999999', false],
      ['aws:SourceArn', 'ArnLike', 'arn:aws:sns:us-east-1:111111111111:t', true],
      ['aws:SourceArn', 'ArnLike', 'arn:aws:sns:us-east-1:999999999999:t', false],
    ])('%s under %s behaves the same scalar or array-wrapped', (key, operator, value, want) => {
      const build = (v: string | string[]): PolicyStatementType => ({
        Sid: 'ScalarOrArray',
        Effect: 'Allow',
        Principal: { AWS: '*' },
        Action: 's3:GetObject',
        Condition: { [operator as string]: { [key as string]: v } },
      });

      expect(check(build(value as string), subsetOptions)).toBe(want);
      expect(check(build([value as string]), subsetOptions)).toBe(want);
    });
  });

  describe('default options — the extraction path Lambda / Private CA use', () => {
    it.each([
      ['ArnLike aws:SourceArn', { ArnLike: { 'aws:SourceArn': 'arn:aws:sns:us-east-1:999999999999:topic' } }],
      ['StringEquals aws:SourceArn', { StringEquals: { 'aws:SourceArn': 'arn:aws:sns:us-east-1:999999999999:topic' } }],
      ['StringEquals aws:SourceAccount', { StringEquals: { 'aws:SourceAccount': '999999999999' } }],
      [
        'an array-valued aws:SourceArn',
        {
          StringEquals: {
            'aws:SourceArn': ['arn:aws:sns:us-east-1:111111111111:a', 'arn:aws:sns:us-east-1:999999999999:b'],
          },
        },
      ],
    ])('rejects a service principal scoped by %s to an unlisted account', (_label, Condition) => {
      const statement: PolicyStatementType = {
        Sid: 'ServiceIntegration',
        Effect: 'Allow',
        Principal: { Service: 'sns.amazonaws.com' },
        Action: 'lambda:InvokeFunction',
        Condition,
      };

      expect(check(statement)).toBe(false);
    });

    it.each([
      ['ArnLike aws:SourceArn', { ArnLike: { 'aws:SourceArn': 'arn:aws:sns:us-east-1:111111111111:topic' } }],
      ['StringEquals aws:SourceAccount', { StringEquals: { 'aws:SourceAccount': '111111111111' } }],
    ])('accepts a service principal scoped by %s to an allowlisted account', (_label, Condition) => {
      const statement: PolicyStatementType = {
        Sid: 'ServiceIntegration',
        Effect: 'Allow',
        Principal: { Service: 'sns.amazonaws.com' },
        Action: 'lambda:InvokeFunction',
        Condition,
      };

      expect(check(statement)).toBe(true);
    });
  });
});
