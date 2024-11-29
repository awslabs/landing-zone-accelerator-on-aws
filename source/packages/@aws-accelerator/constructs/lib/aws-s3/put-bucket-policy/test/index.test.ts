import { generateBucketPolicy } from '../index';
import { AcceleratorImportedBucketType, AwsPrincipalAccessesType } from '@aws-accelerator/utils/lib/common-resources';
import { describe, expect, test } from '@jest/globals';

describe('generateBucketPolicy', () => {
  let elbAccountId = '';
  const firewallRoles: string[] = [];
  const applyAcceleratorManagedPolicy = 'true';
  const partition = 'aws';
  const sourceAccount = '111111111111';
  const bucketType = AcceleratorImportedBucketType.ELB_LOGS_BUCKET;
  const bucketArn = 'arn:aws:s3:::test-bucket';
  const bucketPolicyFilePaths: string[] = [];
  const principalOrgIdCondition = { 'aws:PrincipalOrgID': '${ORG_ID}' };
  const awsPrincipalAccesses: AwsPrincipalAccessesType[] = [];

  test('should include ELB account in policy when elbAccountId is provided', () => {
    elbAccountId = '123456789012';

    const policy = generateBucketPolicy(
      firewallRoles,
      applyAcceleratorManagedPolicy,
      partition,
      sourceAccount,
      bucketType,
      bucketArn,
      bucketPolicyFilePaths,
      principalOrgIdCondition,
      awsPrincipalAccesses,
      elbAccountId,
    );

    const policyObj = JSON.parse(policy);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statementWithElbAccount = policyObj.Statement.find((statement: any) =>
      statement.Principal?.AWS?.includes(`arn:aws:iam::${elbAccountId}:root`),
    );

    expect(statementWithElbAccount).toBeDefined();
    expect(statementWithElbAccount.Effect).toBe('Allow');
    expect(statementWithElbAccount.Action).toContain('s3:PutObject');
    expect(statementWithElbAccount.Resource).toContain(bucketArn);
  });

  test('should not include ELB account in policy when elbAccountId is not provided', () => {
    const bucketType = AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET;
    elbAccountId = '';

    const policy = generateBucketPolicy(
      firewallRoles,
      applyAcceleratorManagedPolicy,
      partition,
      sourceAccount,
      bucketType,
      bucketArn,
      bucketPolicyFilePaths,
      principalOrgIdCondition,
      awsPrincipalAccesses,
      elbAccountId,
    );

    const policyObj = JSON.parse(policy);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statementWithElbAccount = policyObj.Statement.find((statement: any) => {
      if (Array.isArray(statement.Principal?.AWS)) {
        return statement.Principal.AWS.some((principal: string) => principal.includes(':root'));
      } else if (typeof statement.Principal?.AWS === 'string') {
        return statement.Principal.AWS.includes(':root');
      }
      return false;
    });

    expect(statementWithElbAccount).toBeUndefined();
  });
});
