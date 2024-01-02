import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';
import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import { ECRClient, GetRepositoryPolicyCommand, SetRepositoryPolicyCommand } from '@aws-sdk/client-ecr';

export class EcrRepositoryPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly client = new ECRClient();

  async evaluateResourcePolicyCompliance(configurationItem: ConfigurationItem, expectedPolicy?: PolicyDocument) {
    const currPolicyStr = configurationItem.configuration?.RepositoryPolicyText;
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
    let response;
    try {
      response = await this.client.send(
        new GetRepositoryPolicyCommand({
          repositoryName: configurationItem.resourceName,
        }),
      );
    } catch (err: unknown) {
      if ((err as { name: string }).name !== 'RepositoryPolicyNotFoundException') {
        throw err;
      }
    }

    let currPolicyDocument;
    if (response?.policyText) {
      currPolicyDocument = JSON.parse(response.policyText);
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

    await this.client.send(
      new SetRepositoryPolicyCommand({
        repositoryName: configurationItem.resourceName,
        policyText: JSON.stringify(currPolicyDocument),
      }),
    );
  }
}
