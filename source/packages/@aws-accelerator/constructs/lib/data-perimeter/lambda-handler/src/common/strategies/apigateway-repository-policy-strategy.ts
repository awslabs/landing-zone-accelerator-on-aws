import { APIGatewayClient, GetRestApiCommand, UpdateRestApiCommand } from '@aws-sdk/client-api-gateway';

import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';
import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';

export class ApiGatewayPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly client = new APIGatewayClient();

  async evaluateResourcePolicyCompliance(configurationItem: ConfigurationItem, expectedPolicy?: PolicyDocument) {
    const currPolicy = await this.getResourcePolicyById(configurationItem.configuration?.id);
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
    const parts = configurationItem.resourceId.split('/');
    const apigwIdentifier = parts[parts.length - 1];
    let currPolicyDocument = await this.getResourcePolicyById(apigwIdentifier);

    if (!currPolicyDocument) {
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
      new UpdateRestApiCommand({
        restApiId: apigwIdentifier,
        patchOperations: [
          {
            op: 'replace',
            path: '/policy',
            value: JSON.stringify(currPolicyDocument),
          },
        ],
      }),
    );
  }

  private async getResourcePolicyById(id: string | undefined): Promise<PolicyDocument | undefined> {
    const response = await this.client.send(new GetRestApiCommand({ restApiId: id }));
    if (response.policy) {
      const unescapedJson = JSON.parse('"' + response.policy + '"');
      return JSON.parse(unescapedJson);
    }

    return undefined;
  }
}
