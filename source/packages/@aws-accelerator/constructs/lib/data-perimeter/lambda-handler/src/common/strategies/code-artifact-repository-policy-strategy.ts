import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';
import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import {
  CodeartifactClient,
  PutRepositoryPermissionsPolicyCommand,
  GetRepositoryPermissionsPolicyCommand,
} from '@aws-sdk/client-codeartifact';

export class CodeArtifactRepositoryPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly client = new CodeartifactClient();

  async evaluateResourcePolicyCompliance(configurationItem: ConfigurationItem, expectedPolicy?: PolicyDocument) {
    const domain = configurationItem.configuration?.DomainName;
    const repository = configurationItem.configuration?.RepositoryName;
    if (!domain || !repository) {
      throw new Error('No domain or repository name available in configurationItem');
    }

    const currPolicyStr = await this.getResourceByDomainNameAndRepoName(domain, repository);
    if (!currPolicyStr) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: 'Resource Policy is empty',
      };
    }

    return compareResourcePolicies(JSON.parse(currPolicyStr), expectedPolicy);
  }

  private async getResourceByDomainNameAndRepoName(domain: string, repository: string): Promise<string | undefined> {
    try {
      const response = await this.client.send(new GetRepositoryPermissionsPolicyCommand({ domain, repository }));
      return response.policy?.document;
    } catch (e: unknown) {
      if ((e as { name: string }).name === 'ResourceNotFoundException') {
        return undefined;
      }
      throw e;
    }
  }

  async updateResourceBasedPolicy(
    configurationItem: { resourceName: string; resourceId: string; resourceType: string; configuration: string },
    policy: PolicyDocument,
  ) {
    const configuration = JSON.parse(configurationItem.configuration);
    const domain = configuration.DomainName;
    const repository = configuration.RepositoryName;

    const currPolicyStr = await this.getResourceByDomainNameAndRepoName(domain, repository);
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
      new PutRepositoryPermissionsPolicyCommand({
        domain,
        repository,
        policyDocument: JSON.stringify(currPolicyDocument),
      }),
    );
  }
}
