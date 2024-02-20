import {
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceCreateEvent,
} from '@aws-accelerator/utils/lib/common-types';

import { AccountId, EventType, Partition, Region } from './common/resources';

/**
 * CloudFormation event resource property type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PropertyType = { [Key: string]: any };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventPropertiesType = { new?: PropertyType[]; old?: PropertyType[] };

/**
 * An abstract class for accelerator custom resource AWS Lambda unit test.
 *
 * @remarks
 * The purpose of this class is to create static event data that is required for unit testing. Unit test functions can use this class to create the required event data.
 *
 * @example
 * Here is how you can use this class to obtain event data for testing purposes
 *
 * An example of create CloudFormation event data without resource properties
 * ```
 * const event = AcceleratorUnitTest.getEvent(EventType.CREATE);
 * ```
 *
 * An example of create CloudFormation event data with NEW resource properties only
 * ```
 * const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [{property: value, property: value}] });
 * ```
 * 
 * An example of create CloudFormation event data with NEW and OLD resource properties
 * 
 * ```
 * const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [{property: value, property: value}],
      old: [{property: value, property: value}],
    });
 * ```
 */
export abstract class AcceleratorUnitTest {
  private static prepareResourceProperties(properties?: PropertyType[]): PropertyType | undefined {
    const resourcePropertyList:
      | {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [key: string]: any;
        }[] = properties ?? [];

    const resourceProperties: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    } = {};

    for (const resourceProperty of resourcePropertyList) {
      for (const [key, value] of Object.entries(resourceProperty)) {
        resourceProperties[key] = value;
      }
    }

    return resourcePropertyList.length > 0 ? resourceProperties : undefined;
  }

  /**
   * Function to get CloudFormation event to unit test Custom Resource Lambda
   * @param eventType {@link EventType}
   * @param properties {@link EventPropertiesType}
   * @returns eventData {@link CloudFormationCustomResourceCreateEvent} | {@link CloudFormationCustomResourceDeleteEvent} | {@link CloudFormationCustomResourceUpdateEvent}
   */
  public static getEvent(
    eventType: EventType,
    properties?: EventPropertiesType,
  ):
    | CloudFormationCustomResourceCreateEvent
    | CloudFormationCustomResourceDeleteEvent
    | CloudFormationCustomResourceUpdateEvent {
    const newProperties = this.prepareResourceProperties(properties?.new);
    const oldProperties = this.prepareResourceProperties(properties?.old);

    switch (eventType) {
      case EventType.CREATE:
        return {
          RequestType: eventType,
          ServiceToken: `arn:${Partition}:lambda:${Region}:${AccountId}:function:fake-function-name`,
          ResponseURL: '...',
          StackId: `arn:${Partition}:cloudformation:${Region}:${AccountId}:stack/fake-stack-id`,
          RequestId: 'fake-request-id',
          LogicalResourceId: 'fake-logical-resource-id',
          ResourceType: 'Custom::FakeResource',
          ResourceProperties: {
            ServiceToken: `arn:${Partition}:lambda:${Region}:${AccountId}:function:fake-function-name`,
            ...newProperties,
          },
        };
      case EventType.UPDATE:
        return {
          RequestType: eventType,
          PhysicalResourceId: 'PhysicalResourceId',
          ServiceToken: `arn:${Partition}:lambda:${Region}:${AccountId}:function:fake-function-name`,
          ResponseURL: '...',
          StackId: `arn:${Partition}:cloudformation:${Region}:${AccountId}:stack/fake-stack-id`,
          RequestId: 'fake-request-id',
          LogicalResourceId: 'fake-logical-resource-id',
          ResourceType: 'Custom::FakeResource',
          ResourceProperties: {
            ServiceToken: `arn:${Partition}:lambda:${Region}:${AccountId}:function:fake-function-name`,
            ...newProperties,
          },
          OldResourceProperties: {
            ServiceToken: `arn:${Partition}:lambda:${Region}:${AccountId}:function:fake-function-name`,
            ...oldProperties,
          },
        };
      case EventType.DELETE:
        return {
          RequestType: eventType,
          PhysicalResourceId: 'PhysicalResourceId',
          ServiceToken: `arn:${Partition}:lambda:${Region}:${AccountId}:function:fake-function-name`,
          ResponseURL: '...',
          StackId: `arn:${Partition}:cloudformation:${Region}:${AccountId}:stack/fake-stack-id`,
          RequestId: 'fake-request-id',
          LogicalResourceId: 'fake-logical-resource-id',
          ResourceType: 'Custom::FakeResource',
          ResourceProperties: {
            ServiceToken: `arn:${Partition}:lambda:${Region}:${AccountId}:function:fake-function-name`,
            ...newProperties,
          },
        };
    }
  }
}
