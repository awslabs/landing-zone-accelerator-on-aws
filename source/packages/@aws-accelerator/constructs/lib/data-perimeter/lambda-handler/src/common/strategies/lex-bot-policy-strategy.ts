import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';

import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import {
  LexModelsV2Client,
  DescribeResourcePolicyCommand,
  UpdateResourcePolicyCommand,
  CreateResourcePolicyCommand,
} from '@aws-sdk/client-lex-models-v2';

export class LexBotPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly client = new LexModelsV2Client();

  async evaluateResourcePolicyCompliance(configurationItem: ConfigurationItem, expectedPolicy?: PolicyDocument) {
    const currPolicyStr = await this.getResourcePolicyByArn(configurationItem.ARN);
    if (!currPolicyStr) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: 'Resource Policy is empty',
      };
    }

    return compareResourcePolicies(JSON.parse(currPolicyStr), expectedPolicy);
  }

  async updateResourceBasedPolicy(
    configurationItem: { resourceName: string; resourceId: string; resourceType: string; arn: string },
    policy: PolicyDocument,
  ) {
    const resourceArn = configurationItem.arn;
    const currPolicyStr = await this.getResourcePolicyByArn(resourceArn);
    let isNewPolicy = false;

    let currPolicyDocument;
    if (currPolicyStr) {
      currPolicyDocument = JSON.parse(currPolicyStr);
    } else {
      isNewPolicy = true;
      currPolicyDocument = {
        Version: '2012-10-17',
        Statement: [],
        Id: 'ResourcePolicyForDataPerimeter',
      };
    }

    const currStatements = currPolicyDocument.Statement;
    for (const statement of policy?.Statement || []) {
      const idx = currStatements.findIndex((s: { Sid: string }) => s.Sid === statement.Sid);

      if (idx >= 0) {
        currStatements[idx] = statement;
      } else {
        currStatements.push(statement);
      }
    }

    if (isNewPolicy) {
      await this.client.send(
        new CreateResourcePolicyCommand({
          resourceArn,
          policy: JSON.stringify(currPolicyDocument),
        }),
      );
    } else {
      await this.client.send(
        new UpdateResourcePolicyCommand({
          resourceArn,
          policy: JSON.stringify(currPolicyDocument),
        }),
      );
    }
  }

  private async getResourcePolicyByArn(resourceArn: string): Promise<string | undefined> {
    try {
      const response = await this.client.send(new DescribeResourcePolicyCommand({ resourceArn }));
      return response.policy;
    } catch (e: unknown) {
      if ((e as { name: string }).name === 'ResourceNotFoundException') {
        return '';
      }
      throw e;
    }
  }
}
