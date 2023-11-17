import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';

import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import { EventBridgeClient, DescribeEventBusCommand, PutPermissionCommand } from '@aws-sdk/client-eventbridge';

export class EventBridgeEventBusPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly client = new EventBridgeClient();

  async evaluateResourcePolicyCompliance(configurationItem: ConfigurationItem, expectedPolicy?: PolicyDocument) {
    const eventBusName = configurationItem.resourceName;
    const response = await this.client.send(new DescribeEventBusCommand({ Name: eventBusName }));

    const currPolicyStr = response.Policy;
    if (!currPolicyStr) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: 'Resource Policy is empty',
      };
    }

    return compareResourcePolicies(JSON.parse(currPolicyStr), expectedPolicy);
  }

  async updateResourceBasedPolicy(
    configurationItem: { resourceId: string; resourceType: string; resourceName: string },
    policy: PolicyDocument,
  ) {
    const eventBusName = configurationItem.resourceName;
    const response = await this.client.send(new DescribeEventBusCommand({ Name: eventBusName }));

    const currPolicyStr = response.Policy;
    let currPolicyDocument: PolicyDocument;
    if (currPolicyStr) {
      currPolicyDocument = JSON.parse(currPolicyStr);
    } else {
      currPolicyDocument = {
        Version: '2012-10-17',
        Statement: [],
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
      new PutPermissionCommand({
        EventBusName: eventBusName,
        Policy: JSON.stringify(currPolicyDocument),
      }),
    );
  }
}
