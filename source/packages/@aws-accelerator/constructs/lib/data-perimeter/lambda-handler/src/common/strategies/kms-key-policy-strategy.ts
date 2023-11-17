import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';

import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import { KMSClient, GetKeyPolicyCommand, PutKeyPolicyCommand } from '@aws-sdk/client-kms';

export class KmsKeyPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly kmsClient = new KMSClient();

  async evaluateResourcePolicyCompliance(configurationItem: ConfigurationItem, expectedPolicy?: PolicyDocument) {
    if (configurationItem.configuration?.keyManager === 'AWS') {
      return {
        complianceType: 'NOT_APPLICABLE',
        annotation: 'resource policy check is not applicable to AWS managed key',
      };
    }

    const currPolicyStr = configurationItem.supplementaryConfiguration?.Policy;
    if (!currPolicyStr) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: 'Key policy is empty',
      };
    }

    return compareResourcePolicies(JSON.parse(currPolicyStr), expectedPolicy);
  }

  async updateResourceBasedPolicy(
    configurationItem: { resourceId: string; resourceType: string },
    policy: PolicyDocument,
  ) {
    const keyId = configurationItem.resourceId;

    const getPolicyResponse = await this.kmsClient.send(
      new GetKeyPolicyCommand({
        KeyId: keyId,
        PolicyName: 'default',
      }),
    );

    let currPolicyDocument;
    if (getPolicyResponse.Policy) {
      currPolicyDocument = JSON.parse(getPolicyResponse.Policy);
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

    await this.kmsClient.send(
      new PutKeyPolicyCommand({
        KeyId: keyId,
        PolicyName: 'default',
        Policy: JSON.stringify(currPolicyDocument),
        BypassPolicyLockoutSafetyCheck: false,
      }),
    );
  }
}
