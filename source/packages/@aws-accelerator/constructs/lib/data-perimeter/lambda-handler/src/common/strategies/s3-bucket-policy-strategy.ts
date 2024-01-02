import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';

import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';

import { S3Client, GetBucketPolicyCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';

export class S3BucketPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly s3Client = new S3Client();

  evaluateResourcePolicyCompliance(
    configurationItem: ConfigurationItem,
    expectedPolicy: PolicyDocument,
  ): Promise<{ complianceType: string; annotation?: string | undefined }> {
    const currPolicyText = configurationItem.supplementaryConfiguration?.BucketPolicy?.policyText;

    return compareResourcePolicies(currPolicyText ? JSON.parse(currPolicyText) : undefined, expectedPolicy);
  }

  async updateResourceBasedPolicy(
    configurationItem: { resourceId: string; resourceType: string; resourceName: string },
    policy: PolicyDocument,
  ) {
    const bucketName = configurationItem.resourceName;
    let bucketPolicy: PolicyDocument = {
      Version: '2012-10-17',
      Statement: [],
    };
    try {
      const data = await this.s3Client.send(new GetBucketPolicyCommand({ Bucket: bucketName }));
      bucketPolicy = JSON.parse(data.Policy || '');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.name !== 'NoSuchBucketPolicy') {
        throw err;
      }
    }

    const currStatements = bucketPolicy.Statement;

    // Update or append the s3 standard policy customized by user
    for (const statement of policy?.Statement || []) {
      const idx = currStatements.findIndex(s => s.Sid === statement.Sid);
      const newStatement = {
        ...statement,
        Resource: [`arn:aws:s3:::${bucketName}`, `arn:aws:s3:::${bucketName}/*`],
      };

      if (idx >= 0) {
        currStatements[idx] = newStatement;
      } else {
        currStatements.push(newStatement);
      }
    }

    const params = {
      Bucket: bucketName,
      Policy: JSON.stringify(bucketPolicy),
    };

    await this.s3Client.send(new PutBucketPolicyCommand(params));
  }
}
