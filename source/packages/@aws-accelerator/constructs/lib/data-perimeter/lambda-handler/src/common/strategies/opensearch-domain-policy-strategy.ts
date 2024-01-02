import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';

import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import { OpenSearchClient, UpdateDomainConfigCommand, DescribeDomainConfigCommand } from '@aws-sdk/client-opensearch';

export class OpenSearchDomainPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly client = new OpenSearchClient();

  async evaluateResourcePolicyCompliance(configurationItem: ConfigurationItem, expectedPolicy?: PolicyDocument) {
    const currPolicy = configurationItem.configuration?.AccessPolicies;
    if (!currPolicy) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: 'Resource Policy is empty',
      };
    }

    return compareResourcePolicies(currPolicy, expectedPolicy);
  }

  async updateResourceBasedPolicy(
    configurationItem: { resourceId: string; resourceType: string; resourceName: string },
    policy: PolicyDocument,
  ) {
    const domainName = configurationItem.resourceName;
    const response = await this.client.send(new DescribeDomainConfigCommand({ DomainName: domainName }));

    const currPolicyStr = response.DomainConfig?.AccessPolicies?.Options;
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
      new UpdateDomainConfigCommand({
        DomainName: domainName,
        AccessPolicies: JSON.stringify(currPolicyDocument),
      }),
    );
  }
}
