import { ConfigurationItem, PolicyDocument, PolicyStatementType } from '../common-resources';

import { ACMPCAClient, PutPolicyCommand, GetPolicyCommand } from '@aws-sdk/client-acm-pca';
import { AllowedOnlyPolicyStrategy } from './allowed-only-policy-strategy';

export class PcaPolicyStrategy extends AllowedOnlyPolicyStrategy {
  private readonly client = new ACMPCAClient();

  async evaluateResourcePolicyCompliance(
    configurationItem: ConfigurationItem,
  ): Promise<{ complianceType: string; annotation?: string | undefined }> {
    const currPolicyText = await this.getResourcePolicy(configurationItem.ARN);

    if (!currPolicyText) {
      // FOR ACM_PCA, we don't add permission because only ALLOW statement is allowed. We don't want to open permission by adding any ALLOW statement
      return {
        complianceType: 'COMPLIANT',
      };
    }

    const currPolicy: PolicyDocument = JSON.parse(currPolicyText);
    const noncompliantStms: string[] = [];
    for (const stm of currPolicy.Statement) {
      if (!this.checkStatementCompliance(stm)) {
        noncompliantStms.push(stm.Sid!);
      }
    }

    if (noncompliantStms.length > 0) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: `${noncompliantStms.join(',')} is not compliant`,
      };
    }

    return {
      complianceType: 'COMPLIANT',
    };
  }

  /**
   * Remediate the non-compliant resource and make the resource policy compliant
   * @param configurationItem
   * @returns
   */
  async updateResourceBasedPolicy(configurationItem: {
    resourceName: string;
    resourceId: string;
    resourceType: string;
    arn: string;
  }) {
    const arn = configurationItem.arn;

    let policyDocument: PolicyDocument;
    const currPolicyText = await this.getResourcePolicy(arn);
    if (!currPolicyText) return; // Do nothing if current resource policy is empty
    else {
      policyDocument = JSON.parse(currPolicyText);
    }

    const statements = [];
    for (const stm of policyDocument.Statement) {
      if (this.checkStatementCompliance(stm)) {
        statements.push(stm);
        continue;
      }

      let condition = stm.Condition;
      if (!condition) condition = {};
      if (!condition['StringEquals']) condition['StringEquals'] = {};

      condition['StringEquals']['aws:PrincipalOrgID'] = this.ORG_ID;
      statements.push({ ...stm, Condition: condition } as PolicyStatementType);
    }

    await this.client.send(
      new PutPolicyCommand({ ResourceArn: arn, Policy: JSON.stringify({ ...policyDocument, Statement: statements }) }),
    );
  }

  private async getResourcePolicy(arn: string) {
    try {
      const data = await this.client.send(new GetPolicyCommand({ ResourceArn: arn }));
      return data.Policy;
    } catch (e: unknown) {
      if ((e as { name: string }).name === 'ResourceNotFoundException') {
        return undefined;
      }
      throw e;
    }
  }
}
