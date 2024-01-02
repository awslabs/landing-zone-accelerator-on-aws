import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';
import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import { EFSClient, DescribeFileSystemPolicyCommand, PutFileSystemPolicyCommand } from '@aws-sdk/client-efs';

export class EfsFileSystemPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly client = new EFSClient();

  async evaluateResourcePolicyCompliance(configurationItem: ConfigurationItem, expectedPolicy?: PolicyDocument) {
    const currPolicy = configurationItem.configuration?.FileSystemPolicy;
    if (!currPolicy) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: 'Resource Policy is empty',
      };
    }

    return compareResourcePolicies(currPolicy, expectedPolicy);
  }

  async updateResourceBasedPolicy(
    configurationItem: { resourceId: string; resourceType: string },
    policy: PolicyDocument,
  ) {
    const fileSystemId = configurationItem.resourceId;
    const currPolicyStr = await this.getResourceById(fileSystemId);

    let currPolicyDocument: PolicyDocument;
    if (currPolicyStr) {
      currPolicyDocument = JSON.parse(currPolicyStr);
    } else {
      currPolicyDocument = {
        Version: '2012-10-17',
        Statement: [],
        Id: 'ResourcePolicyForDataPerimeter',
      };
    }

    const currStatements = currPolicyDocument.Statement;

    for (const statement of policy?.Statement || []) {
      const idx = currStatements.findIndex(s => s.Sid === statement.Sid);

      if (idx >= 0) {
        currStatements[idx] = statement;
      } else {
        currStatements.push(statement);
      }
    }

    await this.client.send(
      new PutFileSystemPolicyCommand({
        FileSystemId: fileSystemId,
        Policy: JSON.stringify(currPolicyDocument),
      }),
    );
  }

  private async getResourceById(fileSystemId: string): Promise<string | undefined> {
    try {
      const response = await this.client.send(new DescribeFileSystemPolicyCommand({ FileSystemId: fileSystemId }));
      return response.Policy;
    } catch (e: unknown) {
      if ((e as { name: string }).name === 'PolicyNotFound') {
        return undefined;
      }
      throw e;
    }
  }
}
