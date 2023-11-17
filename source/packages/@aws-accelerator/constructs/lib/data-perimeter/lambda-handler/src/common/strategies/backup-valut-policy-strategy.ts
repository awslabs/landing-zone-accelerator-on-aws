import { compareResourcePolicies } from '../utils';
import { AwsResourcePolicyStrategy } from '../aws-resource-policy-strategy';
import { ConfigurationItem, PolicyDocument } from '../common-resources';

import {
  BackupClient,
  GetBackupVaultAccessPolicyCommand,
  PutBackupVaultAccessPolicyCommand,
} from '@aws-sdk/client-backup';

export class BackupVaultPolicyStrategy implements AwsResourcePolicyStrategy {
  private readonly client = new BackupClient();

  async evaluateResourcePolicyCompliance(configurationItem: ConfigurationItem, expectedPolicy?: PolicyDocument) {
    const backupVaultName = configurationItem.resourceName;

    const currPolicyStr = await this.getResourceByName(backupVaultName);
    if (!currPolicyStr) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: 'Resource Policy is empty',
      };
    }

    return compareResourcePolicies(JSON.parse(currPolicyStr), expectedPolicy);
  }

  async updateResourceBasedPolicy(
    configurationItem: { resourceName: string; resourceId: string; resourceType: string },
    policy: PolicyDocument,
  ) {
    const backupVaultName = configurationItem.resourceName;
    const currPolicyStr = await this.getResourceByName(backupVaultName);

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
      new PutBackupVaultAccessPolicyCommand({
        BackupVaultName: backupVaultName,
        Policy: JSON.stringify(currPolicyDocument),
      }),
    );
  }

  private async getResourceByName(backupVaultName: string): Promise<string | undefined> {
    try {
      const response = await this.client.send(
        new GetBackupVaultAccessPolicyCommand({ BackupVaultName: backupVaultName }),
      );
      return response.Policy;
    } catch (e: unknown) {
      if ((e as { name: string }).name === 'ResourceNotFoundException') {
        return '';
      }
      throw e;
    }
  }
}
