import { describe, test, afterEach, beforeEach } from '@jest/globals';
import { handler } from './index';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { DynamoDBClient, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SSMClient } from '@aws-sdk/client-ssm';

let cfnClient: AwsClientStub<CloudFormationClient>;
let ssmClient: AwsClientStub<SSMClient>;
let dynamoDBClient: AwsClientStub<DynamoDBClient>;
let dynamoDBDocumentClient: AwsClientStub<DynamoDBDocumentClient>;

describe('handler validate-environment', () => {
  beforeEach(() => {
    cfnClient = mockClient(CloudFormationClient);
    ssmClient = mockClient(SSMClient);
    dynamoDBClient = mockClient(DynamoDBClient);
    dynamoDBDocumentClient = mockClient(DynamoDBDocumentClient);
  });

  afterEach(() => {
    cfnClient?.reset();
    ssmClient?.reset();
    dynamoDBClient?.reset();
    dynamoDBDocumentClient?.reset();
  });

  test('should run', async () => {
    cfnClient
      .on(DescribeStacksCommand)
      .resolves({ Stacks: [{ StackStatus: 'UPDATE_ROLLBACK_IN_PROGRESS', StackName: '', CreationTime: new Date() }] });
    dynamoDBClient.on(QueryCommand).resolves({ Items: [] });
    dynamoDBClient.on(ScanCommand).resolves({ Items: [] });
    dynamoDBDocumentClient.on(QueryCommand).resolves({ Items: [] });
    dynamoDBDocumentClient.on(ScanCommand).resolves({ Items: [] });

    const event: CloudFormationCustomResourceEvent = {
      LogicalResourceId: '',
      OldResourceProperties: {},
      ResourceProperties: {
        ServiceToken: '',
      },
      PhysicalResourceId: '',
      RequestId: '',
      RequestType: 'Update',
      ResourceType: '',
      ResponseURL: '',
      ServiceToken: '',
      StackId: '',
    };
    await handler(event);
  });
});
