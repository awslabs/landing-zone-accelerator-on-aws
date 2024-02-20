import { mockClient } from 'aws-sdk-client-mock';
import path from 'path';

/**
 * AWS SDK Mock API client
 * @param awsClient
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AcceleratorMockClient = (awsClient: any) => mockClient(awsClient);

/**
 * Accelerator all enable config directory path
 */
export const AllEnabledConfigPath = path.join(__dirname, '../../../../accelerator/test/configs/all-enabled');

/**
 * Partition
 */
export const Partition = 'aws';

/**
 * AWS Account Id
 */
export const AccountId = '111111111111';
/**
 * Global Region
 */
export const GlobalRegion = 'us-east-1';

/**
 * AWS Region
 */
export const Region = 'us-east-1';

/**
 * Solution id
 */
export const SolutionId = ' AwsSolution/SO0199';

/**
 * CloudFormation event
 */
export enum EventType {
  'CREATE' = 'Create',
  'UPDATE' = 'Update',
  'DELETE' = 'Delete',
}

/**
 * Make static role arn
 * @param name string
 * @param partition string | undefined
 * @param accountId string | undefined
 * @returns arn string
 */
export const MakeRoleArn = (name: string, partition?: string, accountId?: string) =>
  `arn:${partition ?? Partition}:iam::${accountId ?? AccountId}:role/${name}`;

/**
 * Make kms key arn
 * @param name string
 * @param partition string | undefined
 * @param accountId string | undefined
 * @param region string | undefined
 * @returns arn string
 */
export const MakeKeyArn = (name: string, partition?: string, accountId?: string, region?: string) =>
  `arn:${partition ?? Partition}:kms:${region ?? Region}:${accountId ?? AccountId}:key/${name}`;

/**
 * Make Log group Arn
 * @param name string
 * @param partition string | undefined
 * @param accountId string | undefined
 * @param region string | undefined
 * @returns arn string
 */
export const MakeLogGroupArn = (name: string, partition?: string, accountId?: string, region?: string) =>
  `arn:${partition ?? Partition}:logs:${region ?? Region}:${accountId ?? AccountId}:log-group:${name}`;
