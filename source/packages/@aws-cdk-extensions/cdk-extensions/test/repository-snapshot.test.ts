import { SynthUtils } from '@aws-cdk/assert';
import { test, describe, expect } from '@jest/globals';
import * as CdkExtensions from '../index';
import * as TestConfig from './test-config';

describe('Initialized CodeCommit Repository', () => {
  /**
   * Snapshot Test - Initialzed Repository
   */
  test('Snapshot Test', () => {
    new CdkExtensions.Repository(TestConfig.stack, 'SnapshotTest', TestConfig.repositoryProps);
    expect(SynthUtils.toCloudFormation(TestConfig.stack)).toMatchSnapshot();
  });
});
