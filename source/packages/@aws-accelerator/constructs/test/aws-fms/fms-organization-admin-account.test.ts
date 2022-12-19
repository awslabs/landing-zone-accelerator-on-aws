import * as cdk from 'aws-cdk-lib';
import { FMSOrganizationAdminAccount } from '../../lib/aws-fms/fms-organization-admin-account';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(FMSOrganizationAdminAccount): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

const adminAccountId = '111111111111';
const assumeRole = 'testRole';
new FMSOrganizationAdminAccount(stack, 'FMSOrganizationAdminAccount', {
  adminAccountId,
  assumeRole,
  logRetentionInDays: 10,
  kmsKey: new cdk.aws_kms.Key(stack, 'fmsTestKey'),
});
/**
 * FMSOrganizationAdminAccount construct test
 */
describe('FMSOrganizationAdminAccount', () => {
  snapShotTest(testNamePrefix, stack);
});
