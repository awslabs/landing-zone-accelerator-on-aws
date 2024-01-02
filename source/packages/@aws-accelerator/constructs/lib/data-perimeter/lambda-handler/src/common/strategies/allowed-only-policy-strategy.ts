import { FunctionUrlAuthType } from '@aws-sdk/client-lambda';
import { PolicyStatementType } from '../common-resources';
import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import { ConfigurationItem, PolicyDocument } from '../common-resources';

const AWS_ARN_REGEX = /^arn:aws[a-z-]*:[a-z0-9-]+:[a-z0-9-]*:[0-9]{12}:[a-zA-Z0-9-_:/]+/;
const AWS_ACCOUNT_NUMBER_REGEX = /^\d{12}$/;

export const ALLOWED_SOURCE_ACCOUNTS: string | 'ALL' = process.env['SourceAccount'] || '';

/**
 * The abstract strategy for resource policy which only support Allow statements.
 * There is some difference compared to resource policy which support both Allow and Deny:
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

  /**
   * Get the statement detail from a policy statement.
   *   1. accountsInStatement - the accounts number used in a statement
   *   2. functionUrlAuthType -  the functionUrlAuthType if present
   *   3. principalOrgId - value of the condition key 'aws:PrincipalOrgId' if present
   *   4. sourceAccount - value of condition key 'aws:SourceAccount' if present
   *   5. sourceArn - value of condition key `aws:SourceArn' if present
   * @param statement
   * @returns
   */
  protected getStatementDetail(statement: PolicyStatementType) {
    const awsPrincipal: string = (statement.Principal?.['AWS'] as string) || '*';

    const accountsInStatement: string[] = []; // Combination of #1, 2, 3 below can give us all the accounts ID occurred in the Lambda or PCA policy
    const condition = statement.Condition || {};
    const stringEquals = (condition['StringEquals'] as unknown as { [key: string]: string }) || {};
    const arnLike = (condition['ArnLike'] as unknown as { [key: string]: string }) || {};
    const functionUrlAuthType = stringEquals['lambda:FunctionUrlAuthType'];
    const principalOrgId = stringEquals['aws:PrincipalOrgID'];

    // 1. Add account IDs from condition key aws:SourceArn
    const sourceArn: string[] = [];
    if (stringEquals['AWS:SourceArn'] || stringEquals['aws:SourceArn']) {
      // https://docs.aws.amazon.com/lambda/latest/dg/access-control-resource-based.html
      sourceArn.push(stringEquals['AWS:SourceArn'] || stringEquals['aws:SourceArn']);
    }
    if (arnLike['AWS:SourceArn'] || arnLike['aws:SourceArn']) {
      sourceArn.push(arnLike['AWS:SourceArn'] || arnLike['aws:SourceArn']);
    }
    sourceArn.forEach(arn => accountsInStatement.push(this.getAccountIdFromArn(arn)));

    // 2. Add account IDs from condition key aws:SourceAccount
    const sourceAccount: string[] = [];
    if (stringEquals['AWS:SourceAccount'] || stringEquals['aws:SourceAccount']) {
      sourceAccount.push(stringEquals['AWS:SourceAccount'] || stringEquals['aws:SourceAccount']);
    }
    accountsInStatement.push(...sourceAccount);

    // 3. Add account ID from AWS Principal
    if (AWS_ARN_REGEX.test(awsPrincipal)) {
      accountsInStatement.push(this.getAccountIdFromArn(awsPrincipal));
    } else if (AWS_ACCOUNT_NUMBER_REGEX.test(awsPrincipal)) {
      accountsInStatement.push(awsPrincipal);
    }

    return {
      accountsInStatement,
      functionUrlAuthType,
      principalOrgId,
      sourceAccount,
      sourceArn,
    };
  }

  protected checkStatementCompliance(statement: PolicyStatementType): boolean {
    if (ALLOWED_SOURCE_ACCOUNTS === 'ALL') return true;

    const { accountsInStatement, functionUrlAuthType, principalOrgId } = this.getStatementDetail(statement);
    const allowedAccounts: Set<string> | 'ALL' = this.getAllowedAccountsInPolicy();

    // Allow public access if 'ALL' is passed in SourceAccount
    if (allowedAccounts === 'ALL') return true;

    if (principalOrgId && principalOrgId === this.ORG_ID) return true;
    if (principalOrgId && principalOrgId !== this.ORG_ID) return false;

    if (functionUrlAuthType === FunctionUrlAuthType.NONE) return false;
    if (accountsInStatement.length > 0) {
      if (!accountsInStatement.every(account => allowedAccounts.has(account))) {
        return false;
      }
    }

    return true;
  }

  protected getAllowedAccountsInPolicy(): Set<string> | 'ALL' {
    if (ALLOWED_SOURCE_ACCOUNTS === 'ALL') {
      return 'ALL';
    }

    const accountIds = ALLOWED_SOURCE_ACCOUNTS.split(',').map(acc => acc.trim());
    const allowedAccounts = new Set<string>(accountIds);
    allowedAccounts.add(this.ACCOUNT_ID);

    return allowedAccounts;
  }

  private getAccountIdFromArn(arn: string) {
    return arn.split(':')[4];
  }
}
