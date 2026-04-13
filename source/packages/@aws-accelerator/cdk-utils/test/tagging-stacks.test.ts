import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { addAcceleratorTags } from '../lib/tagging-stacks';

describe('addAcceleratorTags', () => {
  it('adds Accelerator tag to S3 buckets', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    new s3.Bucket(stack, 'Bucket');

    addAcceleratorTags(stack, 'aws', [], 'AWSAccelerator');

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      Tags: Match.arrayWith([Match.objectLike({ Key: 'Accelerator', Value: 'AWSAccelerator' })]),
    });
  });

  it('does not throw when stack contains untaggable resources (e.g. EC2 Route)', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'UntagStack');

    const vpc = new ec2.Vpc(stack, 'Vpc', { natGateways: 0 });
    new ec2.CfnRoute(stack, 'Route', {
      routeTableId: vpc.publicSubnets[0].routeTable.routeTableId,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: vpc.internetGatewayId!,
    });

    expect(() => addAcceleratorTags(stack, 'aws', [], 'AWSAccelerator')).not.toThrow();
  });

  it('skips TransitGateway tagging in non-aws partitions', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'GovStack');

    new ec2.CfnTransitGateway(stack, 'Tgw', {});

    addAcceleratorTags(stack, 'aws-us-gov', [], 'AWSAccelerator');

    const template = Template.fromStack(stack);
    const tgws = template.findResources('AWS::EC2::TransitGateway');

    for (const logicalId of Object.keys(tgws)) {
      expect(tgws[logicalId]['Properties']?.Tags).toBeUndefined();
    }
  });
});

describe('ACCELERATOR_ENABLE_TAG env variable', () => {
  const originalEnv = process.env['ACCELERATOR_ENABLE_TAG'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['ACCELERATOR_ENABLE_TAG'];
    } else {
      process.env['ACCELERATOR_ENABLE_TAG'] = originalEnv;
    }
  });

  it('skips tagging for aws-iso partition when env var is not set', () => {
    delete process.env['ACCELERATOR_ENABLE_TAG'];
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'IsoStack');
    new s3.Bucket(stack, 'Bucket');

    addAcceleratorTags(stack, 'aws-iso', [], 'AWSAccelerator');

    const template = Template.fromStack(stack);
    template.hasResourceProperties(
      'AWS::S3::Bucket',
      Match.objectLike({
        Tags: Match.absent(),
      }),
    );
  });

  it('skips tagging for aws-iso-b partition when env var is not set', () => {
    delete process.env['ACCELERATOR_ENABLE_TAG'];
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'IsoBStack');
    new s3.Bucket(stack, 'Bucket');

    addAcceleratorTags(stack, 'aws-iso-b', [], 'AWSAccelerator');

    const template = Template.fromStack(stack);
    template.hasResourceProperties(
      'AWS::S3::Bucket',
      Match.objectLike({
        Tags: Match.absent(),
      }),
    );
  });

  it('applies tags for aws-iso partition when ACCELERATOR_ENABLE_TAG is true', () => {
    process.env['ACCELERATOR_ENABLE_TAG'] = 'true';
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'IsoEnabledStack');
    new s3.Bucket(stack, 'Bucket');

    addAcceleratorTags(stack, 'aws-iso', [], 'AWSAccelerator');

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      Tags: Match.arrayWith([Match.objectLike({ Key: 'Accelerator', Value: 'AWSAccelerator' })]),
    });
  });

  it('applies tags for aws-iso-b partition when ACCELERATOR_ENABLE_TAG is true', () => {
    process.env['ACCELERATOR_ENABLE_TAG'] = 'true';
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'IsoBEnabledStack');
    new s3.Bucket(stack, 'Bucket');

    addAcceleratorTags(stack, 'aws-iso-b', [], 'AWSAccelerator');

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      Tags: Match.arrayWith([Match.objectLike({ Key: 'Accelerator', Value: 'AWSAccelerator' })]),
    });
  });

  it('does not override partition check when ACCELERATOR_ENABLE_TAG is not "true"', () => {
    process.env['ACCELERATOR_ENABLE_TAG'] = 'false';
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'IsoFalseStack');
    new s3.Bucket(stack, 'Bucket');

    addAcceleratorTags(stack, 'aws-iso', [], 'AWSAccelerator');

    const template = Template.fromStack(stack);
    template.hasResourceProperties(
      'AWS::S3::Bucket',
      Match.objectLike({
        Tags: Match.absent(),
      }),
    );
  });
});

describe('CustomResourceProvider tagging', () => {
  const handlerDir = path.join(__dirname, 'handler');

  beforeAll(() => {
    fs.mkdirSync(handlerDir, { recursive: true });
    fs.writeFileSync(path.join(handlerDir, 'index.js'), 'exports.handler = async () => ({});');
  });

  afterAll(() => {
    fs.rmSync(handlerDir, { recursive: true, force: true });
  });

  it('tags CustomResourceProvider Lambda handler and Role', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'CrpStack');

    cdk.CustomResourceProvider.getOrCreateProvider(stack, 'Custom::TestResource', {
      codeDirectory: handlerDir,
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_22_X,
    });

    addAcceleratorTags(stack, 'aws', [{ key: 'Env', value: 'Test' }], 'AWSAccelerator');

    const template = Template.fromStack(stack);

    // Verify the Lambda handler gets tag overrides
    template.hasResource('AWS::Lambda::Function', {
      Properties: Match.objectLike({
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Accelerator', Value: 'AWSAccelerator' }),
          Match.objectLike({ Key: 'Env', Value: 'Test' }),
        ]),
      }),
    });

    // Verify the IAM Role gets tag overrides
    template.hasResource('AWS::IAM::Role', {
      Properties: Match.objectLike({
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Accelerator', Value: 'AWSAccelerator' }),
          Match.objectLike({ Key: 'Env', Value: 'Test' }),
        ]),
      }),
    });
  });
});

describe('SecurityGroup tagging', () => {
  it('adds Accel-P tag to SecurityGroup resources', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'SgStack');

    const vpc = new ec2.Vpc(stack, 'Vpc', { natGateways: 0 });
    new ec2.SecurityGroup(stack, 'Sg', { vpc });

    addAcceleratorTags(stack, 'aws', [], 'AWSAccelerator');

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      Tags: Match.arrayWith([
        Match.objectLike({ Key: 'Accel-P', Value: 'AWSAccelerator' }),
        Match.objectLike({ Key: 'Accelerator', Value: 'AWSAccelerator' }),
      ]),
    });
  });
});

describe('SsmPutParameterValue tagging', () => {
  it('does not throw when tagging Custom::SsmPutParameterValue resource', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'SsmStack');

    new cdk.CfnResource(stack, 'SsmParam', {
      type: 'Custom::SsmPutParameterValue',
      properties: {
        ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:test',
        parameters: [
          { name: '/test/param1', value: 'value1' },
          { name: '/test/param2', value: 'value2', tags: { ExistingTag: 'keep' } },
        ],
      },
    });

    // Should not throw and should still apply standard tags
    expect(() => addAcceleratorTags(stack, 'aws', [{ key: 'Env', value: 'Test' }], 'AWSAccelerator')).not.toThrow();

    const template = Template.fromStack(stack);
    template.hasResource('Custom::SsmPutParameterValue', {
      Properties: Match.objectLike({
        ServiceToken: Match.anyValue(),
      }),
    });
  });
});
