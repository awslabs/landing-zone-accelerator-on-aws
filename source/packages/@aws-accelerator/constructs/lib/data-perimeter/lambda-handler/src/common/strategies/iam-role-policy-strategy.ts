import { IAMClient, GetRoleCommand, UpdateAssumeRolePolicyCommand } from '@aws-sdk/client-iam';

import { compareResourcePolicies } from '../utils';
import { ConfigurationItem, PolicyDocument } from '../common-resources';
import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';

export class IamRolePolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly iamClient = new IAMClient();

  async updateResourceBasedPolicy(
    configurationItem: { resourceId: string; resourceType: string; resourceName: string },
    policy: PolicyDocument,
  ) {
    const roleName = configurationItem.resourceName;
    const role = await this.iamClient.send(new GetRoleCommand({ RoleName: roleName }));

    let currAssumeRolePolicyDocument;
    if (role.Role?.AssumeRolePolicyDocument) {
      currAssumeRolePolicyDocument = JSON.parse(decodeURIComponent(role.Role.AssumeRolePolicyDocument));
    } else {
      currAssumeRolePolicyDocument = {
        Version: '2012-10-17',
        Statement: [],
        Id: 'DataPerimeterRolePolicy',
      };
    }

    const currStatements = currAssumeRolePolicyDocument.Statement;

    for (const statement of policy?.Statement || []) {
      const idx = currStatements.findIndex((s: { Sid: string }) => s.Sid === statement.Sid);

      if (idx >= 0) {
        currStatements[idx] = statement;
      } else {
        currStatements.push(statement);
      }
    }

    await this.iamClient.send(
      new UpdateAssumeRolePolicyCommand({
        RoleName: roleName,
        PolicyDocument: JSON.stringify(currAssumeRolePolicyDocument),
      }),
    );
  }

  async evaluateResourcePolicyCompliance(configurationItem: ConfigurationItem, expectedPolicy?: PolicyDocument) {
    if (configurationItem.configuration?.path?.startsWith('/aws-service-role/')) {
      return {
        complianceType: 'NOT_APPLICABLE',
        annotation: 'resource policy check is not applicable to AWS managed role',
      };
    }
    if (!configurationItem.configuration?.assumeRolePolicyDocument) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: 'Trusted entity is empty',
      };
    }

    // The trust policy (which includes the trust entity) is stored in the 'assumeRolePolicyDocument' field
    const currResourcePolicy = JSON.parse(decodeURIComponent(configurationItem.configuration.assumeRolePolicyDocument));

    return compareResourcePolicies(currResourcePolicy, expectedPolicy);
  }
}
