import { ConfigurationItem, PolicyDocument, PolicyStatementType } from '../common-resources';
import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import {
  ALLOWED_SOURCE_ACCOUNTS,
  checkStatementCompliance,
  getAllowedAccountsInPolicy,
  getStatementDetail,
} from '../statement-compliance';

export { ALLOWED_SOURCE_ACCOUNTS };

/**
 * The abstract strategy for resource policy which only supports Allow statements.
 * There is some difference compared to resource policy which supports both Allow and Deny:
 *   1. DENY statement is not allowed
 *   2. The resource is considered as compliant if resource policy is empty
 *   3. No statement should be added to Lambda RBP by SSM Remediation. Only policy update is allowed.
 *   4. No resource policy template is accepted by customer (in LZA config).
 */
export abstract class AllowedOnlyPolicyStrategy implements AwsResourcePolicyStrategy {
  protected readonly ORG_ID: string = process.env['ORG_ID']!;
  protected readonly ACCOUNT_ID: string = process.env['ACCOUNT_ID']!;

  abstract evaluateResourcePolicyCompliance(
    configurationItem: ConfigurationItem,
    expectedPolicy?: PolicyDocument | undefined,
  ): Promise<{ complianceType: string; annotation?: string | undefined }>;

  abstract updateResourceBasedPolicy(
    configurationItem: { resourceName: string; resourceId: string; resourceType: string },
    policy?: PolicyDocument | undefined,
  ): Promise<void>;

  protected getStatementDetail(statement: PolicyStatementType) {
    return getStatementDetail(statement);
  }

  protected checkStatementCompliance(statement: PolicyStatementType): boolean {
    return checkStatementCompliance(statement);
  }

  protected getAllowedAccountsInPolicy(): Set<string> | 'ALL' {
    return getAllowedAccountsInPolicy();
  }
}
