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

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  DeleteBucketReplicationCommand,
  EncryptionConfiguration,
  PutBucketReplicationCommand,
  ReplicationRule,
  S3Client,
  SseKmsEncryptedObjectsStatus,
} from '@aws-sdk/client-s3';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * put-public-access-block - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const sourceBucketName: string = event.ResourceProperties['sourceBucketName'];
  const solutionId = process.env['SOLUTION_ID'];

  const s3Client = new S3Client({
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const replicationRoleArn: string = event.ResourceProperties['replicationRoleArn'];
      const prefix: string = event.ResourceProperties['prefix'];

      const destinationBucketArn: string = event.ResourceProperties['destinationBucketArn'];
      const destinationBucketKeyArn: string = event.ResourceProperties['destinationBucketKeyArn'];
      const destinationAccountId: string = event.ResourceProperties['destinationAccountId'];

      let replicateEncryptedObjectsStatus: SseKmsEncryptedObjectsStatus = SseKmsEncryptedObjectsStatus.Disabled;
      let encryptionConfiguration: EncryptionConfiguration | undefined;

      if (destinationBucketKeyArn) {
        replicateEncryptedObjectsStatus = SseKmsEncryptedObjectsStatus.Enabled;
        encryptionConfiguration = {
          ReplicaKmsKeyID: destinationBucketKeyArn,
        };
      }

      const replicationRules: ReplicationRule[] = [
        {
          ID: `${sourceBucketName}-replication-rule`,
          Status: 'Enabled',
          Prefix: prefix,
          SourceSelectionCriteria: {
            SseKmsEncryptedObjects: {
              Status: replicateEncryptedObjectsStatus,
            },
          },
          Destination: {
            Bucket: destinationBucketArn,
            Account: destinationAccountId,
            EncryptionConfiguration: encryptionConfiguration,
            StorageClass: 'STANDARD',
            AccessControlTranslation: {
              Owner: 'Destination',
            },
          },
        },
      ];

      await throttlingBackOff(() =>
        s3Client.send(
          new PutBucketReplicationCommand({
            Bucket: sourceBucketName,
            ReplicationConfiguration: { Role: replicationRoleArn, Rules: replicationRules },
          }),
        ),
      );

      return {
        PhysicalResourceId: `s3-replication-${sourceBucketName}`,
        Status: 'SUCCESS',
      };

    case 'Delete':
      try {
        await throttlingBackOff(() =>
          s3Client.send(
            new DeleteBucketReplicationCommand({
              Bucket: sourceBucketName,
            }),
          ),
        );
      } catch (error) {
        console.error(JSON.stringify(error));
      }
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
