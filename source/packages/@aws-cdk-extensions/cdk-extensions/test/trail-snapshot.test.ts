import { SynthUtils } from '@aws-cdk/assert';
import { test, describe, expect } from '@jest/globals';
import * as CdkExtensions from '../index';
import * as TestConfig from './test-config';

describe('CloudTrailExtension', () => {
  /**
   * Snapshot Test - CloudTrail
   */
  test('Snapshot Test', () => {
    new CdkExtensions.Trail(TestConfig.stack, 'SnapshotTest', TestConfig.trailProps);
    expect(SynthUtils.toCloudFormation(TestConfig.stack)).toMatchSnapshot();
  });
});
