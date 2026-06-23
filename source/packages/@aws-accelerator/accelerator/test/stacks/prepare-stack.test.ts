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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// PrepareStack uploads the entire config directory via cdk.aws_s3_assets.Asset.
// Constructing a real Asset triggers CDK asset staging, which recursively copies
// configDirPath to disk. Other snapshot tests (V2 network) delete the
// configs/snapshot-only/synthesized-cfn-templates directory mid-run via
// copySynthesizedTemplates(), so the recursive copy intermittently fails with
// ENOENT. Mock the Asset construct so these tests never touch the filesystem.
// A Proxy is used because cdk's namespace accessors expose read-only getters
// that resolve the submodule lazily; mocking the submodule path alone does not
// intercept that internal require, so we override the whole entry point.
vi.mock('aws-cdk-lib', async () => {
  const actual = await vi.importActual<typeof import('aws-cdk-lib')>('aws-cdk-lib');
  const { Construct } = await import('constructs');

  class Asset extends Construct {
    public readonly s3BucketName = 'mock-config-asset-bucket';
    public readonly s3ObjectKey: string;
    public readonly s3ObjectUrl: string;
    public readonly httpUrl = 'https://mock-config-asset';
    public readonly assetHash = 'mockassethash';
    public readonly isFile = false;
    public readonly isZipArchive = true;

    constructor(scope: InstanceType<typeof Construct>, id: string) {
      super(scope, id);
      // Derive a stable, unique key per construct id so distinct assets remain
      // distinguishable in synthesized templates without reading the disk.
      this.s3ObjectKey = `mock-config-asset-key/${id}.zip`;
      this.s3ObjectUrl = `s3://${this.s3BucketName}/${this.s3ObjectKey}`;
    }

    public grantRead(): void {
      /* no-op: staging and IAM grants are not exercised by these unit tests */
    }
  }

  const mockedS3Assets = { ...(actual.aws_s3_assets as object), Asset };

  return new Proxy(actual, {
    get(target, prop, receiver) {
      if (prop === 'aws_s3_assets') {
        return mockedS3Assets;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
});

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';
import { PrepareStack } from '../../lib/stacks/prepare-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';
import { Create, memoize } from '../accelerator-test-helpers';
import { AcceleratorStage } from '../../lib/accelerator-stage';

const MANAGEMENT_ACCOUNT_ID = '234567890';
const WORKLOAD_ACCOUNT_ID = '111111111111';
const HOME_REGION = 'us-east-1';
const OTHER_REGION = 'us-west-2';

function buildPrepareProps(opts?: { account?: string; region?: string; homeRegion?: string }): AcceleratorStackProps {
  const base = createAcceleratorStackProps();
  return {
    ...base,
    env: {
      account: opts?.account ?? WORKLOAD_ACCOUNT_ID,
      region: opts?.region ?? OTHER_REGION,
    },
    globalConfig: {
      ...base.globalConfig,
      homeRegion: opts?.homeRegion ?? HOME_REGION,
    } as any,
  } as AcceleratorStackProps;
}

let app: cdk.App;

beforeEach(() => {
  app = new cdk.App();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PrepareStack - account and region gating (minimal props)', () => {
  test('creates no DynamoDB tables in a workload account (not management)', () => {
    const props = buildPrepareProps({ account: WORKLOAD_ACCOUNT_ID });
    const stack = new PrepareStack(app, 'test-prepare-workload', props);
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::DynamoDB::Table', 0);
  });

  test('creates no KMS keys in a workload account', () => {
    const props = buildPrepareProps({ account: WORKLOAD_ACCOUNT_ID });
    const stack = new PrepareStack(app, 'test-prepare-workload-keys', props);
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::KMS::Key', 0);
  });

  test('creates no DynamoDB tables outside home region in management account', () => {
    const props = buildPrepareProps({ account: MANAGEMENT_ACCOUNT_ID, region: OTHER_REGION });
    const stack = new PrepareStack(app, 'test-prepare-mgmt-other', props);
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::DynamoDB::Table', 0);
  });

  test('creates no KMS keys outside home region in management account', () => {
    const props = buildPrepareProps({ account: MANAGEMENT_ACCOUNT_ID, region: OTHER_REGION });
    const stack = new PrepareStack(app, 'test-prepare-mgmt-other-keys', props);
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::KMS::Key', 0);
  });

  test('creates no custom resources in workload account', () => {
    const props = buildPrepareProps({ account: WORKLOAD_ACCOUNT_ID });
    const stack = new PrepareStack(app, 'test-prepare-workload-custom', props);
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Lambda::Function', 0);
  });
});

describe('PrepareStack - management home region (real configs)', () => {
  test('creates Accelerator config DynamoDB table when organization is enabled', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.PREPARE);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const tables = template.findResources('AWS::DynamoDB::Table');
    const configTable = Object.values(tables).find((t: any) => JSON.stringify(t).includes('awsResourceKeys'));
    expect(configTable).toBeDefined();
  });

  test('creates management KMS key SSM parameter', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.PREPARE);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const ssmParams = template.findResources('AWS::SSM::Parameter');
    const mgmtKeyParam = Object.values(ssmParams).find(
      (p: any) => typeof p.Properties?.Name === 'string' && p.Properties.Name.endsWith('/management/kms/key-arn'),
    );
    expect(mgmtKeyParam).toBeDefined();
  });

  test('creates config table ARN SSM parameter', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.PREPARE);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const ssmParams = template.findResources('AWS::SSM::Parameter');
    const tableArnParam = Object.values(ssmParams).find(
      (p: any) =>
        typeof p.Properties?.Name === 'string' && p.Properties.Name.endsWith('/prepare-stack/configTable/arn'),
    );
    expect(tableArnParam).toBeDefined();
  });

  test('creates config table name SSM parameter', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.PREPARE);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const ssmParams = template.findResources('AWS::SSM::Parameter');
    const tableNameParam = Object.values(ssmParams).find(
      (p: any) =>
        typeof p.Properties?.Name === 'string' && p.Properties.Name.endsWith('/prepare-stack/configTable/name'),
    );
    expect(tableNameParam).toBeDefined();
  });

  test('creates AcceleratorMoveAccountRole IAM role', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.PREPARE);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const roles = template.findResources('AWS::IAM::Role');
    const moveAccountRoleExists = Object.values(roles).some(
      (r: any) => r.Properties?.RoleName && String(r.Properties.RoleName).includes('MoveAccountConfigRule-Role'),
    );
    expect(moveAccountRoleExists).toBe(true);
  });

  test('uses customer-managed KMS encryption for the config table', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.PREPARE);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const tables = template.findResources('AWS::DynamoDB::Table');
    const configTable = Object.values(tables).find((t: any) => JSON.stringify(t).includes('awsResourceKeys')) as any;
    expect(configTable.Properties.SSESpecification).toBeDefined();
    expect(configTable.Properties.SSESpecification.SSEEnabled).toBe(true);
    expect(configTable.Properties.SSESpecification.SSEType).toBe('KMS');
  });

  test('config table has PAY_PER_REQUEST billing mode', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.PREPARE);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const tables = template.findResources('AWS::DynamoDB::Table');
    const configTable = Object.values(tables).find((t: any) => JSON.stringify(t).includes('awsResourceKeys')) as any;
    expect(configTable.Properties.BillingMode).toBe('PAY_PER_REQUEST');
  });

  test('config table has point-in-time recovery enabled', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.PREPARE);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const tables = template.findResources('AWS::DynamoDB::Table');
    const configTable = Object.values(tables).find((t: any) => JSON.stringify(t).includes('awsResourceKeys')) as any;
    expect(configTable.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled).toBe(true);
  });

  test('creates AcceleratorResourceTable DynamoDB table', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.PREPARE);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const tables = template.findResources('AWS::DynamoDB::Table');
    const resourceTables = Object.values(tables).filter((t: any) => {
      const keys = (t.Properties?.KeySchema ?? []) as any[];
      return keys.length === 2 && keys.some(k => k.AttributeName === 'pk');
    });
    expect(resourceTables.length).toBeGreaterThanOrEqual(1);
  });

  test('creates resource table name SSM parameter', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.PREPARE);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const ssmParams = template.findResources('AWS::SSM::Parameter');
    const resourceTableParam = Object.values(ssmParams).find(
      (p: any) =>
        typeof p.Properties?.Name === 'string' && p.Properties.Name.endsWith('/prepare-stack/resourceTable/name'),
    );
    expect(resourceTableParam).toBeDefined();
  });

  test('management key has rotation enabled', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.PREPARE);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const keys = template.findResources('AWS::KMS::Key');
    const managementKey = Object.values(keys).find(
      (k: any) =>
        typeof k.Properties?.Description === 'string' && k.Properties.Description.toLowerCase().includes('management'),
    ) as any;
    expect(managementKey).toBeDefined();
    expect(managementKey.Properties.EnableKeyRotation).toBe(true);
  });
});

describe('PrepareStack - management home region resources (real configs)', () => {
  // Memoize the synthesized template. Create.stack builds a fresh CDK app and
  // synthesizes every PREPARE stack; doing that once and sharing the resulting
  // template keeps this suite fast without reintroducing any disk dependency.
  const getTemplate = memoize(() => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.PREPARE);
    expect(stack).toBeDefined();
    return Template.fromStack(stack!);
  });

  const findByName = (resources: Record<string, any>, suffix: string) =>
    Object.values(resources).find(
      (r: any) => typeof r.Properties?.Name === 'string' && r.Properties.Name.endsWith(suffix),
    );

  test('creates the AcceleratorResourceTable name SSM parameter', () => {
    const ssmParams = getTemplate().findResources('AWS::SSM::Parameter');
    expect(findByName(ssmParams, '/prepare-stack/resourceTable/name')).toBeDefined();
  });

  test('creates the NewOrgAccounts DynamoDB table', () => {
    const tables = getTemplate().findResources('AWS::DynamoDB::Table');
    const newOrgAccountsTable = Object.values(tables).find((t: any) => {
      const keys = (t.Properties?.KeySchema ?? []) as any[];
      return keys.length === 1 && keys.some(k => k.AttributeName === 'accountEmail' && k.KeyType === 'HASH');
    });
    expect(newOrgAccountsTable).toBeDefined();
  });

  test('creates the NewOrgAccountsTableName SSM parameter', () => {
    const ssmParams = getTemplate().findResources('AWS::SSM::Parameter');
    expect(findByName(ssmParams, '/prepare-stack/NewOrgAccountsTableName')).toBeDefined();
  });

  test('creates the prepare-stack validate SSM parameter', () => {
    const ssmParams = getTemplate().findResources('AWS::SSM::Parameter');
    expect(findByName(ssmParams, '/prepare-stack/validate')).toBeDefined();
  });

  test('NewOrgAccounts table uses customer-managed KMS encryption', () => {
    const tables = getTemplate().findResources('AWS::DynamoDB::Table');
    const newOrgAccountsTable = Object.values(tables).find((t: any) => {
      const keys = (t.Properties?.KeySchema ?? []) as any[];
      return keys.length === 1 && keys.some(k => k.AttributeName === 'accountEmail' && k.KeyType === 'HASH');
    }) as any;
    expect(newOrgAccountsTable).toBeDefined();
    expect(newOrgAccountsTable.Properties.SSESpecification.SSEEnabled).toBe(true);
    expect(newOrgAccountsTable.Properties.SSESpecification.SSEType).toBe('KMS');
  });

  test('creates management, cloudwatch, and lambda KMS keys', () => {
    // Three customer-managed keys are created in the management home region:
    // ManagementKey, AcceleratorManagementCloudWatchKey, AcceleratorManagementLambdaKey.
    getTemplate().resourceCountIs('AWS::KMS::Key', 3);
  });

  test('consumes the config directory asset bucket in the config loader custom resource', () => {
    // LoadAcceleratorConfigTable is a custom resource that receives the mocked
    // config asset bucket name. Confirm the mock value flows through synthesis.
    const customResources = getTemplate().findResources('Custom::LoadAcceleratorConfigTable');
    const loader = Object.values(customResources).find(
      (r: any) => r.Properties?.configS3Bucket === 'mock-config-asset-bucket',
    );
    expect(loader).toBeDefined();
  });

  test('creates Lambda-backed custom resources for org account management', () => {
    // The config table branch wires several custom-resource Lambdas
    // (LoadAcceleratorConfigTable, MoveAccounts, ValidateEnvironmentConfig, etc.).
    const functions = getTemplate().findResources('AWS::Lambda::Function');
    expect(Object.keys(functions).length).toBeGreaterThan(0);
  });

  test('config table arn parameter references the config table', () => {
    const ssmParams = getTemplate().findResources('AWS::SSM::Parameter');
    const arnParam = findByName(ssmParams, '/prepare-stack/configTable/arn') as any;
    expect(arnParam).toBeDefined();
    // Value is a CloudFormation intrinsic (Fn::GetAtt) pointing at the table ARN.
    expect(JSON.stringify(arnParam.Properties.Value)).toContain('Arn');
  });
});

describe('PrepareStack - organization disabled (minimal props)', () => {
  test('does not create the config table when organization is disabled', () => {
    const base = buildPrepareProps({ account: MANAGEMENT_ACCOUNT_ID, region: HOME_REGION });
    const props = {
      ...base,
      organizationConfig: {
        ...base.organizationConfig,
        enable: false,
      } as any,
    } as AcceleratorStackProps;

    const stack = new PrepareStack(app, 'test-prepare-org-disabled', props);
    const template = Template.fromStack(stack);

    // With organization disabled, the config table branch is skipped, but the
    // resource table and management keys are still created.
    const tables = template.findResources('AWS::DynamoDB::Table');
    const configTable = Object.values(tables).find((t: any) => JSON.stringify(t).includes('awsResourceKeys'));
    expect(configTable).toBeUndefined();
  });

  test('still creates the AcceleratorResourceTable when organization is disabled', () => {
    const base = buildPrepareProps({ account: MANAGEMENT_ACCOUNT_ID, region: HOME_REGION });
    const props = {
      ...base,
      organizationConfig: {
        ...base.organizationConfig,
        enable: false,
      } as any,
    } as AcceleratorStackProps;

    const stack = new PrepareStack(app, 'test-prepare-org-disabled-resource', props);
    const template = Template.fromStack(stack);

    const tables = template.findResources('AWS::DynamoDB::Table');
    const resourceTable = Object.values(tables).find((t: any) => {
      const keys = (t.Properties?.KeySchema ?? []) as any[];
      return keys.length === 2 && keys.some(k => k.AttributeName === 'pk');
    });
    expect(resourceTable).toBeDefined();
  });
});
