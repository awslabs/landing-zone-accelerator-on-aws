import { handler } from '../index';
import { mockClient } from 'aws-sdk-client-mock';
import {
  ConfigServiceClient,
  DescribeConfigurationRecordersCommand,
  DescribeDeliveryChannelStatusCommand,
  PutDeliveryChannelCommand,
  DeleteDeliveryChannelCommand,
  DeleteConfigurationRecorderCommand,
  StopConfigurationRecorderCommand,
  PutConfigurationRecorderCommand,
} from '@aws-sdk/client-config-service';

const configMock = mockClient(ConfigServiceClient);

it('create event without existing resources', async () => {
  configMock.on(DescribeConfigurationRecordersCommand).resolves({
    ConfigurationRecorders: [],
  });
  configMock.on(DescribeDeliveryChannelStatusCommand).resolves({
    DeliveryChannelsStatus: [],
  });

  configMock.on(PutConfigurationRecorderCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  configMock.on(PutDeliveryChannelCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  const result = await handler({
    RequestType: 'Create',
    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
    ResponseURL: '...',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/AWSAccelerator-Stack',
    RequestId: 'ef092572-5cb7-4a7b-9ca7-dfe495ba877a',
    LogicalResourceId: 'LogicalId',
    ResourceType: 'Custom::Resource',
    ResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-us-east-1-123456789012',
    },
  });

  expect(result.Status).toEqual('SUCCESS');
});

it('create event existing config recorder', async () => {
  configMock.on(DescribeConfigurationRecordersCommand).resolves({
    ConfigurationRecorders: [{ name: 'default' }],
  });
  configMock.on(DescribeDeliveryChannelStatusCommand).resolves({
    DeliveryChannelsStatus: [],
  });

  configMock.on(PutConfigurationRecorderCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  configMock.on(PutDeliveryChannelCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  const result = await handler({
    RequestType: 'Create',
    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
    ResponseURL: '...',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/AWSAccelerator-Stack',
    RequestId: 'ef092572-5cb7-4a7b-9ca7-dfe495ba877a',
    LogicalResourceId: 'LogicalId',
    ResourceType: 'Custom::Resource',
    ResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-us-east-1-123456789012',
    },
  });

  expect(result.Status).toEqual('SUCCESS');
});

it('create event existing delivery channel', async () => {
  configMock.on(DescribeConfigurationRecordersCommand).resolves({
    ConfigurationRecorders: [],
  });
  configMock.on(DescribeDeliveryChannelStatusCommand).resolves({
    DeliveryChannelsStatus: [{ name: 'default' }],
  });

  configMock.on(PutConfigurationRecorderCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  configMock.on(PutDeliveryChannelCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  const result = await handler({
    RequestType: 'Create',
    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
    ResponseURL: '...',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/AWSAccelerator-Stack',
    RequestId: 'ef092572-5cb7-4a7b-9ca7-dfe495ba877a',
    LogicalResourceId: 'LogicalId',
    ResourceType: 'Custom::Resource',
    ResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-us-east-1-123456789012',
      s3BucketKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/166692b1-0f01-4261-8dcc-7ff477df12a9',
      recorderRoleArn: 'arn:aws:iam::23456789012:role/AWSAccelerator-SecurityRe-ConfigRecorderRoleC4E33A-X0DGQJYIMPU3',
    },
  });

  expect(result.Status).toEqual('SUCCESS');
});

it('create event both recorder and delivery channel exist', async () => {
  configMock.on(DescribeConfigurationRecordersCommand).resolves({
    ConfigurationRecorders: [{ name: 'default' }],
  });
  configMock.on(DescribeDeliveryChannelStatusCommand).resolves({
    DeliveryChannelsStatus: [{ name: 'default' }],
  });

  configMock.on(PutConfigurationRecorderCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  configMock.on(PutDeliveryChannelCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  const result = await handler({
    RequestType: 'Create',
    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
    ResponseURL: '...',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/AWSAccelerator-Stack',
    RequestId: 'ef092572-5cb7-4a7b-9ca7-dfe495ba877a',
    LogicalResourceId: 'LogicalId',
    ResourceType: 'Custom::Resource',
    ResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-us-east-1-123456789012',
      s3BucketKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/166692b1-0f01-4261-8dcc-7ff477df12a9',
      recorderRoleArn: 'arn:aws:iam::23456789012:role/AWSAccelerator-SecurityRe-ConfigRecorderRoleC4E33A-X0DGQJYIMPU3',
    },
  });

  expect(result.Status).toEqual('SUCCESS');
});

it('update event both recorder and delivery channel exist', async () => {
  configMock.on(DescribeConfigurationRecordersCommand).resolves({
    ConfigurationRecorders: [{ name: 'default' }],
  });
  configMock.on(DescribeDeliveryChannelStatusCommand).resolves({
    DeliveryChannelsStatus: [{ name: 'default' }],
  });

  configMock.on(PutDeliveryChannelCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  configMock.on(PutConfigurationRecorderCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  const result = await handler({
    RequestType: 'Update',
    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
    ResponseURL: '...',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/AWSAccelerator-Stack',
    RequestId: 'ef092572-5cb7-4a7b-9ca7-dfe495ba877a',
    LogicalResourceId: 'LogicalId',
    ResourceType: 'Custom::Resource',
    PhysicalResourceId: 'efffffff-aaaa-bbbb-cccc-dddddddddddddd',
    OldResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-orig-us-east-1-123456789012',
      s3BucketKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/166692b1-0f01-4261-8dcc-7ff477df12a9',
      recorderRoleArn: 'arn:aws:iam::23456789012:role/AWSAccelerator-SecurityRe-ConfigRecorderRoleC4E33A-X0DGQJYIMPU3',
    },
    ResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-us-east-1-123456789012',
      s3BucketKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/166692b1-0f01-4261-8dcc-7ff477df12a9',
      recorderRoleArn: 'arn:aws:iam::23456789012:role/AWSAccelerator-SecurityRe-ConfigRecorderRoleC4E33A-X0DGQJYIMPU3',
    },
  });

  expect(result.Status).toEqual('SUCCESS');
});

it('update event recorder exists', async () => {
  configMock.on(DescribeConfigurationRecordersCommand).resolves({
    ConfigurationRecorders: [{ name: 'default' }],
  });
  configMock.on(DescribeDeliveryChannelStatusCommand).resolves({
    DeliveryChannelsStatus: [],
  });

  configMock.on(PutDeliveryChannelCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  configMock.on(PutConfigurationRecorderCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  const result = await handler({
    RequestType: 'Update',
    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
    ResponseURL: '...',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/AWSAccelerator-Stack',
    RequestId: 'ef092572-5cb7-4a7b-9ca7-dfe495ba877a',
    LogicalResourceId: 'LogicalId',
    ResourceType: 'Custom::Resource',
    PhysicalResourceId: 'efffffff-aaaa-bbbb-cccc-dddddddddddddd',
    OldResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-orig-us-east-1-123456789012',
    },
    ResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-us-east-1-123456789012',
      s3BucketKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/166692b1-0f01-4261-8dcc-7ff477df12a9',
      recorderRoleArn: 'arn:aws:iam::23456789012:role/AWSAccelerator-SecurityRe-ConfigRecorderRoleC4E33A-X0DGQJYIMPU3',
    },
  });

  expect(result.Status).toEqual('SUCCESS');
});

it('update event delivery channel exists', async () => {
  configMock.on(DescribeConfigurationRecordersCommand).resolves({
    ConfigurationRecorders: [],
  });
  configMock.on(DescribeDeliveryChannelStatusCommand).resolves({
    DeliveryChannelsStatus: [{ name: 'default' }],
  });

  configMock.on(PutDeliveryChannelCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  configMock.on(PutConfigurationRecorderCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  const result = await handler({
    RequestType: 'Update',
    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
    ResponseURL: '...',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/AWSAccelerator-Stack',
    RequestId: 'ef092572-5cb7-4a7b-9ca7-dfe495ba877a',
    LogicalResourceId: 'LogicalId',
    ResourceType: 'Custom::Resource',
    PhysicalResourceId: 'efffffff-aaaa-bbbb-cccc-dddddddddddddd',
    OldResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-orig-us-east-1-123456789012',
      s3BucketKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/166692b1-0f01-4261-8dcc-7ff477df12a9',
      recorderRoleArn: 'arn:aws:iam::23456789012:role/AWSAccelerator-SecurityRe-ConfigRecorderRoleC4E33A-X0DGQJYIMPU3',
    },
    ResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-us-east-1-123456789012',
      s3BucketKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/166692b1-0f01-4261-8dcc-7ff477df12a9',
      recorderRoleArn: 'arn:aws:iam::23456789012:role/AWSAccelerator-SecurityRe-ConfigRecorderRoleC4E33A-X0DGQJYIMPU3',
    },
  });

  expect(result.Status).toEqual('SUCCESS');
});

it('delete event no existing delivery channel', async () => {
  configMock.on(DescribeConfigurationRecordersCommand).resolves({
    ConfigurationRecorders: [{ name: 'default' }],
  });
  configMock.on(DescribeDeliveryChannelStatusCommand).resolves({
    DeliveryChannelsStatus: [],
  });

  configMock.on(DeleteDeliveryChannelCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  const result = await handler({
    RequestType: 'Delete',
    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
    ResponseURL: '...',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/AWSAccelerator-Stack',
    RequestId: 'ef092572-5cb7-4a7b-9ca7-dfe495ba877a',
    LogicalResourceId: 'LogicalId',
    ResourceType: 'Custom::Resource',
    PhysicalResourceId: 'efffffff-aaaa-bbbb-cccc-dddddddddddddd',
    ResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-us-east-1-123456789012',
      s3BucketKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/166692b1-0f01-4261-8dcc-7ff477df12a9',
      recorderRoleArn: 'arn:aws:iam::23456789012:role/AWSAccelerator-SecurityRe-ConfigRecorderRoleC4E33A-X0DGQJYIMPU3',
    },
  });

  expect(result.Status).toEqual('SUCCESS');
});

it('delete event both recorder and delivery channel exist', async () => {
  configMock.on(DescribeDeliveryChannelStatusCommand).resolves({
    DeliveryChannelsStatus: [{ name: 'default' }],
  });
  configMock.on(DescribeConfigurationRecordersCommand).resolves({
    ConfigurationRecorders: [{ name: 'default' }],
  });

  configMock.on(StopConfigurationRecorderCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  configMock.on(DeleteConfigurationRecorderCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  configMock.on(DeleteDeliveryChannelCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  const result = await handler({
    RequestType: 'Delete',
    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
    ResponseURL: '...',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/AWSAccelerator-Stack',
    RequestId: 'ef092572-5cb7-4a7b-9ca7-dfe495ba877a',
    LogicalResourceId: 'LogicalId',
    ResourceType: 'Custom::Resource',
    PhysicalResourceId: 'efffffff-aaaa-bbbb-cccc-dddddddddddddd',
    ResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-us-east-1-123456789012',
      s3BucketKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/166692b1-0f01-4261-8dcc-7ff477df12a9',
      recorderRoleArn: 'arn:aws:iam::23456789012:role/AWSAccelerator-SecurityRe-ConfigRecorderRoleC4E33A-X0DGQJYIMPU3',
    },
  });

  expect(result.Status).toEqual('SUCCESS');
});

it('delete event delivery channel exist', async () => {
  configMock.on(DescribeDeliveryChannelStatusCommand).resolves({
    DeliveryChannelsStatus: [{ name: 'default' }],
  });
  configMock.on(DescribeConfigurationRecordersCommand).resolves({
    ConfigurationRecorders: [],
  });

  configMock.on(StopConfigurationRecorderCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  configMock.on(DeleteDeliveryChannelCommand).resolves({
    $metadata: {
      attempts: 1,
      httpStatusCode: 200,
    },
  });

  const result = await handler({
    RequestType: 'Delete',
    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
    ResponseURL: '...',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/AWSAccelerator-Stack',
    RequestId: 'ef092572-5cb7-4a7b-9ca7-dfe495ba877a',
    LogicalResourceId: 'LogicalId',
    ResourceType: 'Custom::Resource',
    PhysicalResourceId: 'efffffff-aaaa-bbbb-cccc-dddddddddddddd',
    ResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:AWSAccelerator-CustomFunction',
      s3BucketName: 'centralLogBucket-us-east-1-123456789012',
      s3BucketKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/166692b1-0f01-4261-8dcc-7ff477df12a9',
      recorderRoleArn: 'arn:aws:iam::23456789012:role/AWSAccelerator-SecurityRe-ConfigRecorderRoleC4E33A-X0DGQJYIMPU3',
    },
  });

  expect(result.Status).toEqual('SUCCESS');
});
