import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';

import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import { SNSClient, GetTopicAttributesCommand, SetTopicAttributesCommand } from '@aws-sdk/client-sns';

export class SnsPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly client = new SNSClient();

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
    configurationItem: { resourceId: string; resourceType: string },
    policy: PolicyDocument,
  ) {
    const topicArn = configurationItem.resourceId;
    const response = await this.client.send(new GetTopicAttributesCommand({ TopicArn: topicArn }));

    const currPolicyStr = (response.Attributes && response.Attributes['Policy']) || '';
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
      new SetTopicAttributesCommand({
        TopicArn: topicArn,
        AttributeName: 'Policy',
        AttributeValue: JSON.stringify(currPolicyDocument),
      }),
    );
  }
}
