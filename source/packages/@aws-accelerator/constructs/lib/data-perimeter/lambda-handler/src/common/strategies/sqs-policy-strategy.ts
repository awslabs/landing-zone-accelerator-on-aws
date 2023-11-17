import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';

import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import {
  SQSClient,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
  QueueAttributeName,
} from '@aws-sdk/client-sqs';

export class SqsPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly client = new SQSClient();

  async evaluateResourcePolicyCompliance(configurationItem: ConfigurationItem, expectedPolicy?: PolicyDocument) {
    const currPolicy = configurationItem.configuration?.Policy;
    if (!currPolicy) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: 'Resource Policy is empty',
      };
    }

    return compareResourcePolicies(JSON.parse(currPolicy), expectedPolicy);
  }

  async updateResourceBasedPolicy(
    configurationItem: { resourceId: string; resourceType: string; resourceName: string },
    policy: PolicyDocument,
  ) {
    const queueUrl = configurationItem.resourceName;
    const response = await this.client.send(
      new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: [QueueAttributeName.Policy] }),
    );

    const currPolicyStr = (response.Attributes && response.Attributes[QueueAttributeName.Policy]) || '';
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

    const attributes: Record<string, string> = {};
    attributes[QueueAttributeName.Policy] = JSON.stringify(currPolicyDocument);
    await this.client.send(
      new SetQueueAttributesCommand({
        QueueUrl: queueUrl,
        Attributes: attributes,
      }),
    );
  }
}
