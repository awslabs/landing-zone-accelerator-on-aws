import { describe, it, expect, afterEach } from 'vitest';
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
