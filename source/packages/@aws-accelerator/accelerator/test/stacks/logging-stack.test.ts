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

/* eslint @typescript-eslint/no-explicit-any: 0 */

import { AssetBucketConfig, CentralLogBucketConfig } from '@aws-accelerator/config';
import { AcceleratorImportedBucketType } from '@aws-accelerator/utils';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import { LoggingStack } from '../../lib/stacks/logging-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { SpiedClass, SpiedFunction } from 'jest-mock';
import { AcceleratorStack } from '../../lib/stacks/accelerator-stack';

let app: cdk.App;
let loggingStack: LoggingStack;

beforeEach(() => {
  app = new cdk.App();
  jest.spyOn(LoggingStack.prototype as any, 'createReplicationProps');
  const props = createAcceleratorStackProps();
  loggingStack = new LoggingStack(app, 'unit-test-logging-stack', props);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('normalizeExtension', () => {
  test('should return undefined when input is undefined', () => {
    const result = loggingStack['normalizeExtension'](undefined);
    expect(result).toBeUndefined();
  });

  test('should add dot prefix when extension does not start with dot', () => {
    const result = loggingStack['normalizeExtension']('txt');
    expect(result).toBe('.txt');
  });

  test('should not modify extension that already starts with dot', () => {
    const result = loggingStack['normalizeExtension']('.pdf');
    expect(result).toBe('.pdf');
  });
});

describe('createImportedBucketKey', () => {
  let addToResourcePolicySpy: SpiedClass<any> | SpiedFunction<any>;

  beforeEach(() => {
    addToResourcePolicySpy = jest.spyOn(cdk.aws_kms.Key.prototype, 'addToResourcePolicy');
  });

  describe('ASSETS_BUCKET', () => {
    let bucketType: AcceleratorImportedBucketType;
    let bucketKey: cdk.aws_kms.Key;

    beforeEach(() => {
      bucketType = AcceleratorImportedBucketType.ASSETS_BUCKET;
      bucketKey = loggingStack['createImportedBucketKey'](bucketType);
    });

    it('key rotation should be enabled', () => {
      expect(bucketKey['enableKeyRotation']).toBeTruthy();
    });

    it('should return key', () => {
      expect(bucketKey).toBeInstanceOf(cdk.aws_kms.Key);
    });

    it('addToResourcePolicy was called once', () => {
      const policy = loggingStack['createImportBucketKeyPolicyStatement']();
      expect(addToResourcePolicySpy).toHaveBeenCalledWith(policy);
    });

    it('should set alias', () => {
      const aliasArray = bucketKey['aliases'];
      expect(aliasArray).toHaveLength(1);
      const alias = aliasArray[0];
      expect(alias).toBeInstanceOf(cdk.aws_kms.Alias);
    });
  });

  describe('CENTRAL_LOGS_BUCKET', () => {
    let bucketType: AcceleratorImportedBucketType;
    let bucketKey: cdk.aws_kms.Key;

    beforeEach(() => {
      bucketType = AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET;
      bucketKey = loggingStack['createImportedBucketKey'](bucketType);
    });

    it('key rotation should be enabled', () => {
      expect(bucketKey['enableKeyRotation']).toBeTruthy();
    });

    it('should return key', () => {
      expect(bucketKey).toBeInstanceOf(cdk.aws_kms.Key);
    });

    it('addToResourcePolicy was called once', () => {
      const policy = loggingStack['createImportBucketKeyPolicyStatement']();
      expect(addToResourcePolicySpy).toHaveBeenCalledWith(policy);
    });

    it('should set alias', () => {
      const aliasArray = bucketKey['aliases'];
      expect(aliasArray).toHaveLength(1);
      const alias = aliasArray[0];
      expect(alias).toBeInstanceOf(cdk.aws_kms.Alias);
    });
  });

  it('ELB_LOGS_BUCKET', () => {
    const bucketType = AcceleratorImportedBucketType.ELB_LOGS_BUCKET;
    const createImportedBucketKey = () => loggingStack['createImportedBucketKey'](bucketType);
    expect(createImportedBucketKey).toThrowError(
      new Error(`Invalid bucket type ${bucketType}, cannot create key for imported bucket`),
    );
  });

  it('SERVER_ACCESS_LOGS_BUCKET', () => {
    const bucketType = AcceleratorImportedBucketType.SERVER_ACCESS_LOGS_BUCKET;
    function createImportedBucketKey() {
      return loggingStack['createImportedBucketKey'](bucketType);
    }
    expect(createImportedBucketKey).toThrowError(
      new Error(`Invalid bucket type ${bucketType}, cannot create key for imported bucket`),
    );
  });
});

describe('updateImportedBucketEncryption', () => {
  const key = {
    addToResourcePolicy: jest.fn(),
  } as unknown as cdk.aws_kms.Key;
  let externalPolicyFilePathsSpy: SpiedClass<any> | SpiedFunction<any>;
  let importBucketKeySpy: SpiedClass<any> | SpiedFunction<any>;
  let externalPolicySpy: SpiedClass<any> | SpiedFunction<any>;
  let kmsPolicyStatementsSpy: SpiedClass<any> | SpiedFunction<any>;

  beforeEach(() => {
    externalPolicyFilePathsSpy = jest
      .spyOn(LoggingStack.prototype as any, 'getExternalPolicyFilePaths')
      .mockReturnValue(['1', '2']);
    importBucketKeySpy = jest.spyOn(LoggingStack.prototype as any, 'createImportedBucketKey').mockReturnValue(key);
    externalPolicySpy = jest
      .spyOn(LoggingStack.prototype as any, 'getExternalPolicyStatements')
      .mockReturnValue([new PolicyStatement()]);
    kmsPolicyStatementsSpy = jest
      .spyOn(LoggingStack.prototype as any, 'createImportedBucketKmsPolicyStatements')
      .mockReturnValue([new PolicyStatement()]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('ASSETS_BUCKET', () => {
    const bucketType = AcceleratorImportedBucketType.ASSETS_BUCKET;
    const options = createBucketConfig('aws-assets', bucketType);

    loggingStack['updateImportedBucketEncryption'](options);
    expect(externalPolicyFilePathsSpy).toHaveBeenCalledWith(undefined, undefined);
    expect(externalPolicyFilePathsSpy).toHaveBeenCalledTimes(1);
    expect(importBucketKeySpy).toHaveBeenCalledWith(bucketType);
    expect(externalPolicySpy).toHaveBeenCalledTimes(1);
    expect(kmsPolicyStatementsSpy).toHaveBeenCalledTimes(1);
    expect(key.addToResourcePolicy).toHaveBeenCalledTimes(2);
  });

  it('CENTRAL_LOGS_BUCKET', () => {
    const bucketType = AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET;
    const options = createBucketConfig('aws-central-log-bucket', bucketType);
    const keyLookupSpy = jest.spyOn(cdk.aws_kms.Key as any, 'fromKeyArn').mockReturnValue(key);

    loggingStack['updateImportedBucketEncryption'](options);
    expect(externalPolicyFilePathsSpy).toHaveBeenCalledWith(undefined, undefined);
    expect(externalPolicyFilePathsSpy).toHaveBeenCalledTimes(1);
    expect(importBucketKeySpy).toHaveBeenCalledWith(bucketType);
    expect(externalPolicySpy).toHaveBeenCalledTimes(1);
    expect(kmsPolicyStatementsSpy).toHaveBeenCalledTimes(1);
    expect(key.addToResourcePolicy).toHaveBeenCalledTimes(2);
    expect(keyLookupSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createS3KmsKey', () => {
  it('returns undefined if S3 CMK is enabled', () => {
    jest.spyOn(AcceleratorStack.prototype as any, 'isCmkEnabledS3Encryption').mockReturnValue(false);
    const props = createAcceleratorStackProps();
    const stack = new LoggingStack(app, 'unit-test-s3key-logging-stack', props);
    const result = stack['createS3KmsKey']();
    expect(result).toBeUndefined();
  });

  it('uses audit account logic for audit account', () => {
    jest.spyOn(AcceleratorStack.prototype as any, 'isCmkEnabledS3Encryption').mockReturnValue(true);
    const spy = jest.spyOn(LoggingStack.prototype as any, 'createAuditAccountS3Key').mockReturnValue(undefined);

    const props = createAcceleratorStackProps(undefined, '00000001');
    new LoggingStack(app, 'unit-test-s3key-logging-stack', props);
    expect(spy).toBeCalledTimes(1);
  });

  it('creates non audit key', () => {
    jest.spyOn(AcceleratorStack.prototype as any, 'isCmkEnabledS3Encryption').mockReturnValue(true);
    const spy = jest.spyOn(LoggingStack.prototype as any, 'createNonAuditS3Key').mockReturnValue({ keyArn: 'arn' });
    const props = createAcceleratorStackProps();
    new LoggingStack(app, 'unit-test-s3key-logging-stack', props);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

function createBucketConfig(name: string, bucketType: AcceleratorImportedBucketType): any {
  const importedBucket = {
    name: name,
    applyAcceleratorManagedBucketPolicy: true,
    createAcceleratorManagedKey: true,
  };
  const bucketConfig: CentralLogBucketConfig | AssetBucketConfig = {
    importedBucket,
  } as AssetBucketConfig;
  const options = {
    bucketConfig: bucketConfig,
    bucketType: bucketType,
    bucketItem: { bucket: {} as cdk.aws_s3.IBucket, bucketKmsArn: 'arn::' },
    principalOrgIdCondition: {} as any,
    centralLogsBucketPrincipalAndPrefixes: undefined,
    bucketKmsArnParameterName: 'kms_test_name',
    organizationId: undefined,
  };
  return options;
}
