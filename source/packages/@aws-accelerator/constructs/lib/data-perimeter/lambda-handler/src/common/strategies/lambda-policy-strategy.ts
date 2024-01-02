import {
  LambdaClient,
  GetPolicyCommand,
  RemovePermissionCommand,
  AddPermissionCommand,
  FunctionUrlAuthType,
  AddPermissionCommandInput,
} from '@aws-sdk/client-lambda';

import { ConfigurationItem, PolicyDocument } from '../common-resources';

import { PolicyStatementType } from '../common-resources';
import { AllowedOnlyPolicyStrategy } from './allowed-only-policy-strategy';

export class LambdaPolicyStrategy extends AllowedOnlyPolicyStrategy {
  private readonly client = new LambdaClient();

  async evaluateResourcePolicyCompliance(configurationItem: ConfigurationItem) {
    const functionName = configurationItem.resourceName;
    const currPolicyStr = await this.getLambdaPolicyByName(functionName);

    if (!currPolicyStr) {
      // The resource policy is considered as compliant if no policy found.
      // It's because lambda doesn't allow Deny statement and remediation will never add new permission. Only update of existing statement is allowed
      return {
        complianceType: 'COMPLIANT',
      };
    }

    const currPolicyDocument: PolicyDocument = JSON.parse(currPolicyStr);
    const noncompliantStms: string[] = [];
    for (const stm of currPolicyDocument.Statement) {
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

  async updateResourceBasedPolicy(configurationItem: {
    resourceName: string;
    resourceId: string;
    resourceType: string;
  }) {
    const functionName = configurationItem.resourceName;

    const currPolicyStr = await this.getLambdaPolicyByName(functionName);
    if (!currPolicyStr) return; // Never add a statement on an empty policy

    const currPolicyDocument: PolicyDocument = JSON.parse(currPolicyStr);

    for (const stm of currPolicyDocument.Statement) {
      if (!this.checkStatementCompliance(stm)) {
        // There is no update API for Lambda resource policy, hence doing delete + add for update.
        await this.removePermission(functionName, stm.Sid!);

        const commandInput = this.getNewStatementInput(functionName, stm);
        await this.client.send(new AddPermissionCommand(commandInput));
      }
    }
  }

  private async getLambdaPolicyByName(functionName: string) {
    try {
      const response = await this.client.send(new GetPolicyCommand({ FunctionName: functionName }));
      return response.Policy;
    } catch (e: unknown) {
      if ((e as { name: string }).name === 'ResourceNotFoundException') {
        return undefined;
      }
      throw e;
    }
  }

  private async removePermission(functionName: string, stmId: string) {
    return this.client.send(new RemovePermissionCommand({ FunctionName: functionName, StatementId: stmId }));
  }

  private getNewStatementInput(functionName: string, statement: PolicyStatementType): AddPermissionCommandInput {
    const { accountsInStatement, functionUrlAuthType, principalOrgId, sourceAccount, sourceArn } =
      this.getStatementDetail(statement);
    const allowedAccounts = this.getAllowedAccountsInPolicy();

    let updatedPrincipalOrgId: string | undefined = principalOrgId;
    if (allowedAccounts instanceof Set && allowedAccounts.size === 0) {
      // Always restrict access from Organization by updating `aws:PrincipalOrgId` if no external account is specified
      updatedPrincipalOrgId = this.ORG_ID;
    } else if (allowedAccounts instanceof Set && accountsInStatement.find(account => !allowedAccounts.has(account))) {
      // Restrict access from Organization by updating `aws:PrincipalOrgId` if an account in statement doesn't occur to the allowed list
      updatedPrincipalOrgId = this.ORG_ID;
    }

    return {
      FunctionName: functionName,
      StatementId: statement.Sid,
      Action: statement.Action as string,
      SourceAccount: sourceAccount[0], // Statement in Lambda policy can only be a single string for account and arn
      SourceArn: sourceArn[0],
      Principal: (statement.Principal?.['AWS'] as string) || (statement.Principal?.['Service'] as string) || undefined,
      PrincipalOrgID: updatedPrincipalOrgId,
      FunctionUrlAuthType: functionUrlAuthType as FunctionUrlAuthType,
    };
  }
}
