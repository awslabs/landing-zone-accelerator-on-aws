/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { throttlingBackOff } from '@aws-accelerator/utils';
import {
  ConfigServiceClient,
  DeleteDeliveryChannelCommand,
  DeleteConfigurationRecorderCommand,
  DescribeConfigurationRecordersCommand,
  DescribeDeliveryChannelStatusCommand,
  PutDeliveryChannelCommand,
  PutDeliveryChannelCommandInput,
  PutConfigurationRecorderCommand,
  PutConfigurationRecorderCommandInput,
  StartConfigurationRecorderCommand,
  StopConfigurationRecorderCommand,
} from '@aws-sdk/client-config-service';
import { v4 as uuidv4 } from 'uuid';
let configClient: ConfigServiceClient;

/**
 * configservice-delivery-channel - lambda handler
 *
 * @param event
 * @returns
 */
export const handler = onEvent;

export async function onEvent(
  event: AWSLambda.CloudFormationCustomResourceEvent,
): Promise<{ PhysicalResourceId: string | undefined; StatusCode: number; Status: string }> {
  //console.debug(`Event: ${JSON.stringify(event)}`);
  const solutionId = process.env['SOLUTION_ID'];
  configClient = new ConfigServiceClient({ customUserAgent: solutionId });
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

export async function onCreate(event: AWSLambda.CloudFormationCustomResourceCreateEvent) {
  const s3BucketName = event.ResourceProperties['s3BucketName'];
  const s3BucketKmsKeyArn = event.ResourceProperties['s3BucketKmsKeyArn'];
  const recorderRoleArn = event.ResourceProperties['recorderRoleArn'];

  console.log('check config recorders');
  const configRecorders = await configClient.send(new DescribeConfigurationRecordersCommand({}));
  console.log(`${JSON.stringify(configRecorders)}`);

  let existingConfigRecorderName: string | undefined = undefined;
  if (configRecorders.ConfigurationRecorders?.length === 1) {
    existingConfigRecorderName = configRecorders.ConfigurationRecorders[0].name;
  }

  if (existingConfigRecorderName) {
    console.info('Stopping config recorder');
    await configClient.send(
      new StopConfigurationRecorderCommand({ ConfigurationRecorderName: existingConfigRecorderName }),
    );
  }

  let configRecorderName = existingConfigRecorderName;

  configRecorderName = await createUpdateRecorder(recorderRoleArn);

  await createUpdateDeliveryChannel(s3BucketName, s3BucketKmsKeyArn);

  console.info('Starting config recorder');
  await configClient.send(new StartConfigurationRecorderCommand({ ConfigurationRecorderName: configRecorderName }));

  return {
    PhysicalResourceId: uuidv4(),
    StatusCode: 200,
    Status: 'SUCCESS',
  };
}

async function onUpdate(event: AWSLambda.CloudFormationCustomResourceUpdateEvent) {
  const s3BucketName = event.ResourceProperties['s3BucketName'];
  const s3BucketKmsKeyArn = event.ResourceProperties['s3BucketKmsKeyArn'];
  const recorderRoleArn = event.ResourceProperties['recorderRoleArn'];

  const configRecorders = await configClient.send(new DescribeConfigurationRecordersCommand({}));
  let existingConfigRecorderName: string | undefined = undefined;

  if (configRecorders.ConfigurationRecorders?.length === 1) {
    existingConfigRecorderName = configRecorders.ConfigurationRecorders[0].name;
  }

  if (existingConfigRecorderName) {
    console.info('Stopping config recorder');
    await configClient.send(
      new StopConfigurationRecorderCommand({ ConfigurationRecorderName: existingConfigRecorderName }),
    );
  }

  let configRecorderName = existingConfigRecorderName;
  configRecorderName = await createUpdateRecorder(recorderRoleArn);

  await createUpdateDeliveryChannel(s3BucketName, s3BucketKmsKeyArn);

  console.info('Starting config recorder');
  await configClient.send(new StartConfigurationRecorderCommand({ ConfigurationRecorderName: configRecorderName }));

  return {
    PhysicalResourceId: event.PhysicalResourceId,
    StatusCode: 200,
    Status: 'SUCCESS',
  };
}

async function onDelete(event: AWSLambda.CloudFormationCustomResourceDeleteEvent) {
  const configRecorders = await configClient.send(new DescribeConfigurationRecordersCommand({}));
  let existingConfigRecorderName: string | undefined = undefined;

  if (configRecorders.ConfigurationRecorders?.length === 1) {
    existingConfigRecorderName = configRecorders.ConfigurationRecorders[0].name;
  }

  if (existingConfigRecorderName) {
    console.info('Stopping config recorder');
    await configClient.send(
      new StopConfigurationRecorderCommand({ ConfigurationRecorderName: existingConfigRecorderName }),
    );
  }

  await deleteDeliveryChannel();

  await deleteConfigRecorder();

  return {
    PhysicalResourceId: event.PhysicalResourceId,
    StatusCode: 200,
    Status: 'SUCCESS',
  };
}

async function createUpdateDeliveryChannel(s3BucketName: string, s3BucketKmsKeyArn: string): Promise<void> {
  console.log('In create update delivery channel');
  const deliveryChannels = await configClient.send(new DescribeDeliveryChannelStatusCommand({}));
  console.info(`Delivery channels: ${JSON.stringify(deliveryChannels)}`);
  let existingDeliveryChannelName: string | undefined = undefined;
  // should return one or none
  if (deliveryChannels.DeliveryChannelsStatus?.length === 1) {
    existingDeliveryChannelName = deliveryChannels.DeliveryChannelsStatus[0].name;
  }

  console.log(`Existing delivery channel name ${existingDeliveryChannelName}\n`);

  const params: PutDeliveryChannelCommandInput = {
    DeliveryChannel: {
      name: existingDeliveryChannelName ?? 'default',
      s3BucketName,
      configSnapshotDeliveryProperties: {
        deliveryFrequency: 'One_Hour',
      },
      s3KeyPrefix: 'config',
      s3KmsKeyArn: s3BucketKmsKeyArn,
    },
  };

  console.info(`Params: ${JSON.stringify(params)}`);
  try {
    const response = await throttlingBackOff(() => configClient.send(new PutDeliveryChannelCommand(params)));
    console.debug(`PutDeliveryChannel Response: ${JSON.stringify(response)}`);
  } catch (error) {
    console.error(JSON.stringify(error));
    throw new Error('PutDeliveryChannel Failed');
  }
}

async function deleteConfigRecorder(): Promise<void> {
  console.log('In delete config recorder');
  const configRecorders = await configClient.send(new DescribeConfigurationRecordersCommand({}));
  let existingConfigRecorderName: string | undefined = undefined;

  if (configRecorders.ConfigurationRecorders?.length === 1) {
    existingConfigRecorderName = configRecorders.ConfigurationRecorders[0].name;
  }

  if (existingConfigRecorderName) {
    try {
      const response = await throttlingBackOff(() =>
        configClient.send(
          new DeleteConfigurationRecorderCommand({ ConfigurationRecorderName: existingConfigRecorderName }),
        ),
      );
      console.debug(`Delete config recorder response: ${JSON.stringify(response)}`);
    } catch (error) {
      console.error(JSON.stringify(error));
      throw new Error(`Failed to delete configuration recorder ${existingConfigRecorderName}`);
    }
  }
}

async function deleteDeliveryChannel() {
  console.log('In delete delivery channel');
  const deliveryChannels = await configClient.send(new DescribeDeliveryChannelStatusCommand({}));
  let existingDeliveryChannelName: string | undefined = undefined;

  if (deliveryChannels.DeliveryChannelsStatus?.length === 1) {
    existingDeliveryChannelName = deliveryChannels.DeliveryChannelsStatus[0].name;
  }

  if (existingDeliveryChannelName) {
    try {
      const response = await throttlingBackOff(() =>
        configClient.send(new DeleteDeliveryChannelCommand({ DeliveryChannelName: existingDeliveryChannelName })),
      );
      console.debug(`Delete delivery channel response: ${JSON.stringify(response)}`);
    } catch (error) {
      console.error(JSON.stringify(error));
      throw new Error(`Failed to delete delivery channel ${existingDeliveryChannelName}`);
    }
  }
}

async function createUpdateRecorder(recorderRoleArn: string): Promise<string> {
  console.log('In create update recorder');
  const configRecorders = await configClient.send(new DescribeConfigurationRecordersCommand({}));
  let existingConfigRecorderName: string | undefined = undefined;
  if (configRecorders.ConfigurationRecorders?.length === 1) {
    existingConfigRecorderName = configRecorders.ConfigurationRecorders[0].name;
  }

  const params: PutConfigurationRecorderCommandInput = {
    ConfigurationRecorder: {
      name: existingConfigRecorderName ?? 'default',
      roleARN: recorderRoleArn,
      recordingGroup: {
        allSupported: true,
        includeGlobalResourceTypes: true,
      },
    },
  };

  console.info(`Recorder Params: ${JSON.stringify(params)}`);
  try {
    const response = await throttlingBackOff(() => configClient.send(new PutConfigurationRecorderCommand(params)));
    console.debug(`PutConfigurationRecorder Response: ${JSON.stringify(response)}`);
  } catch (error) {
    console.error(JSON.stringify(error));
    throw new Error(`Create/Update Recorder failed: ${JSON.stringify(params)}`);
  }

  return params.ConfigurationRecorder!.name!;
}
