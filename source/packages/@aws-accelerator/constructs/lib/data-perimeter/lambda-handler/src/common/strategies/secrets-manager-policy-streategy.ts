import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';

import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import {
  SecretsManagerClient,
  PutResourcePolicyCommand,
  GetResourcePolicyCommand,
} from '@aws-sdk/client-secrets-manager';

export class SecretsManagerPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly smClient = new SecretsManagerClient();

  async evaluateResourcePolicyCompliance(
    configurationItem: ConfigurationItem,
    expectedPolicy: PolicyDocument,
  ): Promise<{ complianceType: string; annotation?: string | undefined }> {
    const response = await this.smClient.send(new GetResourcePolicyCommand({ SecretId: configurationItem.resourceId }));
    const currPolicyStr = response.ResourcePolicy;

    if (!currPolicyStr) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: 'Resource Policy is empty',
      };
    }

    return compareResourcePolicies(JSON.parse(currPolicyStr), expectedPolicy);
  }

  async updateResourceBasedPolicy(
    configurationItem: { resourceId: string; resourceType: string },
    policy: PolicyDocument,
  ) {
    const resourceId = configurationItem.resourceId;

    const getPolicyResponse = await this.smClient.send(
      new GetResourcePolicyCommand({
        SecretId: resourceId,
      }),
    );

    let currPolicyDocument;
    if (getPolicyResponse.ResourcePolicy) {
      currPolicyDocument = JSON.parse(getPolicyResponse.ResourcePolicy);
    } else {
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

    await this.smClient.send(
      new PutResourcePolicyCommand({
        SecretId: resourceId,
        ResourcePolicy: JSON.stringify(currPolicyDocument),
      }),
    );
  }
}
