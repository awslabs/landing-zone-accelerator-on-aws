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
import { beforeEach, describe, expect, vi, test, afterEach, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { LoggingStack } from '../../lib/stacks/logging-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { MockedClass, MockedFunction } from 'vitest';
import { AcceleratorStack } from '../../lib/stacks/accelerator-stack';

let app: cdk.App;
let loggingStack: LoggingStack;

beforeEach(() => {
  app = new cdk.App();
  vi.spyOn(LoggingStack.prototype as any, 'createReplicationProps');
  const props = createAcceleratorStackProps();
  loggingStack = new LoggingStack(app, 'unit-test-logging-stack', props);
});

afterEach(() => {
  vi.clearAllMocks();
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
  let addToResourcePolicySpy: MockedClass<any> | MockedFunction<any>;

  beforeEach(() => {
    addToResourcePolicySpy = vi.spyOn(cdk.aws_kms.Key.prototype, 'addToResourcePolicy');
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
    addToResourcePolicy: vi.fn(),
  } as unknown as cdk.aws_kms.Key;
  let externalPolicyFilePathsSpy: MockedClass<any> | MockedFunction<any>;
  let importBucketKeySpy: MockedClass<any> | MockedFunction<any>;
  let externalPolicySpy: MockedClass<any> | MockedFunction<any>;
  let kmsPolicyStatementsSpy: MockedClass<any> | MockedFunction<any>;

  beforeEach(() => {
    externalPolicyFilePathsSpy = vi
      .spyOn(LoggingStack.prototype as any, 'getExternalPolicyFilePaths')
      .mockReturnValue(['1', '2']);
    importBucketKeySpy = vi.spyOn(LoggingStack.prototype as any, 'createImportedBucketKey').mockReturnValue(key);
    externalPolicySpy = vi
      .spyOn(LoggingStack.prototype as any, 'getExternalPolicyStatements')
      .mockReturnValue([new PolicyStatement()]);
    kmsPolicyStatementsSpy = vi
      .spyOn(LoggingStack.prototype as any, 'createImportedBucketKmsPolicyStatements')
      .mockReturnValue([new PolicyStatement()]);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    const keyLookupSpy = vi.spyOn(cdk.aws_kms.Key as any, 'fromKeyArn').mockReturnValue(key);

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
    vi.spyOn(AcceleratorStack.prototype as any, 'isCmkEnabledS3Encryption').mockReturnValue(false);
    const props = createAcceleratorStackProps();
    const stack = new LoggingStack(app, 'unit-test-s3key-logging-stack', props);
    const result = stack['createS3KmsKey']();
    expect(result).toBeUndefined();
  });

  it('uses audit account logic for audit account', () => {
    vi.spyOn(AcceleratorStack.prototype as any, 'isCmkEnabledS3Encryption').mockReturnValue(true);
    const spy = vi.spyOn(LoggingStack.prototype as any, 'createAuditAccountS3Key').mockReturnValue(undefined);

    const props = createAcceleratorStackProps(undefined, '00000001');
    new LoggingStack(app, 'unit-test-s3key-logging-stack', props);
    expect(spy).toBeCalledTimes(1);
  });

  it('creates non audit key', () => {
    vi.spyOn(AcceleratorStack.prototype as any, 'isCmkEnabledS3Encryption').mockReturnValue(true);
    const spy = vi.spyOn(LoggingStack.prototype as any, 'createNonAuditS3Key').mockReturnValue({ keyArn: 'arn' });
    const props = createAcceleratorStackProps();
    new LoggingStack(app, 'unit-test-s3key-logging-stack', props);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('createElbAccessLogsBucket', () => {
  it('should use service principal for ELB access logging, not account principal', () => {
    const props = createAcceleratorStackProps();
    // Stack must run as the log archive account for the ELB bucket to be created
    const stack = new LoggingStack(app, 'test-elb-principal', {
      ...props,
      env: { region: 'us-west-2', account: '345678901' },
    });
    const template = cdk.assertions.Template.fromStack(stack);

    const bucketPolicies = template.findResources('AWS::S3::BucketPolicy');
    const elbPolicy = Object.values(bucketPolicies).find((policy: any) =>
      policy.Properties?.PolicyDocument?.Statement?.some(
        (s: any) => s.Sid === 'Allow write access for ELB Account principal',
      ),
    );

    expect(elbPolicy).toBeDefined();
    const statement = (elbPolicy as any).Properties.PolicyDocument.Statement.find(
      (s: any) => s.Sid === 'Allow write access for ELB Account principal',
    );
    expect(statement.Principal.Service).toBe('logdelivery.elasticloadbalancing.amazonaws.com');
    expect(statement.Principal.AWS).toBeUndefined();
  });
});

describe('accelerator metadata read-only access grants', () => {
  const roleArn = 'arn:aws:iam::111111111111:role/test-access-role';

  function synthesizeMetadataTemplate(readOnlyAccessRoleArns?: string[]) {
    const props = createAcceleratorStackProps();
    vi.mocked(props.accountsConfig.getAccountId).mockReturnValue(props.env!.account!);
    (props.globalConfig as any).acceleratorMetadata = {
      enable: true,
      account: 'LogArchive',
      ...(readOnlyAccessRoleArns === undefined ? {} : { readOnlyAccessRoleArns }),
    };

    const stack = new LoggingStack(new cdk.App(), `metadata-${readOnlyAccessRoleArns?.length ?? 'omitted'}`, props);
    return cdk.assertions.Template.fromStack(stack).toJSON();
  }

  function getMetadataLogicalIds(template: any): string[] {
    return Object.keys(template.Resources)
      .filter(logicalId => logicalId.startsWith('AcceleratorMetadata'))
      .sort();
  }

  function getRoleGrantResources(template: any): { logicalId: string; type: string }[] {
    return Object.entries(template.Resources)
      .filter(([, resource]) => JSON.stringify(resource).includes(roleArn))
      .map(([logicalId, resource]: [string, any]) => ({ logicalId, type: resource.Type }))
      .sort((a, b) => a.logicalId.localeCompare(b.logicalId));
  }

  it('removes obsolete KMS and S3 grants without replacing metadata resources', () => {
    const populatedTemplate = synthesizeMetadataTemplate([roleArn]);
    const omittedTemplate = synthesizeMetadataTemplate();
    const emptyTemplate = synthesizeMetadataTemplate([]);

    expect(getRoleGrantResources(populatedTemplate).map(resource => resource.type)).toEqual([
      'AWS::KMS::Key',
      'AWS::S3::BucketPolicy',
    ]);
    expect(getRoleGrantResources(omittedTemplate)).toEqual([]);
    expect(getRoleGrantResources(emptyTemplate)).toEqual([]);

    const populatedLogicalIds = getMetadataLogicalIds(populatedTemplate);
    expect(populatedLogicalIds).toHaveLength(4);
    expect(getMetadataLogicalIds(omittedTemplate)).toEqual(populatedLogicalIds);
    expect(getMetadataLogicalIds(emptyTemplate)).toEqual(populatedLogicalIds);
  });
});

describe('cloudwatchLogCreatingAccount ACCOUNT subscription recursion guard (issue #4913)', () => {
  // getLogArchiveAccountId() is mocked to return this id in the props helper
  const logArchiveAccountId = '345678901';
  // prefixes.accelerator is 'unit-test' in the props helper
  const firehoseProcessorExclusion = 'LogGroupName NOT IN ["/aws/lambda/unit-test-FirehoseRecordsProcessor"]';

  function synthSubscriptionFilter(
    subscription: { type: string; selectionCriteria?: string } | undefined,
    account: string,
  ): cdk.assertions.Template {
    const props = createAcceleratorStackProps();
    props.env = { region: 'us-east-1', account };
    // enabledRegions and retention are required by the subscription-filter wiring
    (props.globalConfig as any).enabledRegions = ['us-east-1'];
    (props.globalConfig as any).cloudwatchLogRetentionInDays = 3653;
    // enable:false lets the constructor skip the replication wiring; we invoke the method directly
    (props.globalConfig.logging.cloudwatchLogs as any) = { enable: false, subscription };
    const stack = new LoggingStack(new cdk.App(), `sub-${account}-${JSON.stringify(subscription)}`, props);
    stack['cloudwatchLogCreatingAccount']();
    return cdk.assertions.Template.fromStack(stack);
  }

  it('defaults selectionCriteria to exclude the Firehose records-processor log group when ACCOUNT mode omits it in the Log Archive account', () => {
    const template = synthSubscriptionFilter({ type: 'ACCOUNT' }, logArchiveAccountId);
    template.hasResourceProperties('Custom::UpdateSubscriptionFilter', {
      subscriptionType: 'ACCOUNT',
      selectionCriteria: firehoseProcessorExclusion,
    });
  });

  it('passes an operator-provided selectionCriteria through unchanged', () => {
    const operatorCriteria = 'LogGroupName NOT IN ["/aws/lambda/custom", "AppA"]';
    const template = synthSubscriptionFilter(
      { type: 'ACCOUNT', selectionCriteria: operatorCriteria },
      logArchiveAccountId,
    );
    template.hasResourceProperties('Custom::UpdateSubscriptionFilter', {
      subscriptionType: 'ACCOUNT',
      selectionCriteria: operatorCriteria,
    });
  });

  it('does not inject selectionCriteria for ACCOUNT mode outside the Log Archive account', () => {
    const template = synthSubscriptionFilter({ type: 'ACCOUNT' }, '00000001');
    template.hasResourceProperties('Custom::UpdateSubscriptionFilter', {
      subscriptionType: 'ACCOUNT',
      selectionCriteria: cdk.assertions.Match.absent(),
    });
  });

  it('does not inject selectionCriteria in LOG_GROUP mode', () => {
    const template = synthSubscriptionFilter({ type: 'LOG_GROUP' }, logArchiveAccountId);
    template.hasResourceProperties('Custom::UpdateSubscriptionFilter', {
      subscriptionType: 'LOG_GROUP',
      selectionCriteria: cdk.assertions.Match.absent(),
    });
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
