import { PutPublicAccessBlockCommand, S3ControlClient } from '@aws-sdk/client-s3-control';
import { throttlingBackOff } from '@aws-accelerator/utils';

/**
 * list-roots - lambda handler
 *
 *
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const accountId: string = event.ResourceProperties['accountId'];
  const blockPublicAcls: boolean = event.ResourceProperties['blockPublicAcls'] ?? true;
  const blockPublicPolicy: boolean = event.ResourceProperties['blockPublicPolicy'] ?? true;
  const ignorePublicAcls: boolean = event.ResourceProperties['ignorePublicAcls'] ?? true;
  const restrictPublicBuckets: boolean = event.ResourceProperties['restrictPublicBuckets'] ?? true;

  const s3ControlClient = new S3ControlClient({});

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await throttlingBackOff(() =>
        s3ControlClient.send(
          new PutPublicAccessBlockCommand({
            AccountId: accountId,
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: blockPublicAcls,
              BlockPublicPolicy: blockPublicPolicy,
              IgnorePublicAcls: ignorePublicAcls,
              RestrictPublicBuckets: restrictPublicBuckets,
            },
          }),
        ),
      );
      return {
        PhysicalResourceId: `s3-bpa-${accountId}`,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do Nothing, we will leave any created OUs behind
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
