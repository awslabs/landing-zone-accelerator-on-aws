import { describe, it, expect } from 'vitest';
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

  it('adds Accelerator tag to IAM ManagedPolicy', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    new cdk.aws_iam.ManagedPolicy(stack, 'TestPolicy', {
      managedPolicyName: 'AWSAccelerator-TestPolicy',
      document: new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:GetObject'],
            resources: ['*'],
          }),
        ],
      }),
    });

    addAcceleratorTags(stack, 'aws', [], 'AWSAccelerator');

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
      Tags: Match.arrayWith([Match.objectLike({ Key: 'Accelerator', Value: 'AWSAccelerator' })]),
    });
  });
});
