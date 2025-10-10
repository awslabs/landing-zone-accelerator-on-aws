/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { createLogger } from '../../../common/logger';
import {
  CloudFormationClient,
  ListStacksCommandInput,
  CloudFormationPaginationConfiguration,
  SetStackPolicyCommand,
  StackStatus,
  paginateListStacks,
} from '@aws-sdk/client-cloudformation';
import path from 'path';

import {
  IStackPolicyHandlerParameter,
  IStackPolicyModule,
} from '../../../interfaces/aws-cloudformation/create-stack-policy';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import {
  generateDryRunResponse,
  getCredentials,
  getCurrentAccountId,
  setRetryStrategy,
} from '../../../common/functions';
import { IAssumeRoleCredential } from '../../../common/resources';
import { STSClient } from '@aws-sdk/client-sts';

const STATUS_STACK_FILTER: StackStatus[] = [
  StackStatus.CREATE_COMPLETE,
  StackStatus.CREATE_IN_PROGRESS,
  StackStatus.IMPORT_COMPLETE,
  StackStatus.IMPORT_IN_PROGRESS,
  StackStatus.IMPORT_ROLLBACK_COMPLETE,
  StackStatus.IMPORT_ROLLBACK_FAILED,
  StackStatus.IMPORT_ROLLBACK_IN_PROGRESS,
  StackStatus.REVIEW_IN_PROGRESS,
  StackStatus.ROLLBACK_COMPLETE,
  StackStatus.UPDATE_COMPLETE_CLEANUP_IN_PROGRESS,
  StackStatus.UPDATE_COMPLETE,
  StackStatus.UPDATE_FAILED,
  StackStatus.UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS,
  StackStatus.UPDATE_ROLLBACK_COMPLETE,
  StackStatus.UPDATE_ROLLBACK_FAILED,
  StackStatus.UPDATE_ROLLBACK_IN_PROGRESS,
];

const ALLOW_STATEMENT = {
  Effect: 'Allow',
  Action: 'Update:*',
  Principal: '*',
  Resource: '*',
};

export class StackPolicyModule implements IStackPolicyModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  public async handler(props: IStackPolicyHandlerParameter): Promise<string> {
    const policy = props.enabled ? this.createDenyStackPolicy(props.protectedTypes) : this.createAllowStackPolicy();

    const currentAccountId = await getCurrentAccountId(
      new STSClient({
        region: props.region,
        customUserAgent: props.solutionId,
        retryStrategy: setRetryStrategy(),
        credentials: props.credentials,
      }),
    );

    for (const accountId of props.accountIds) {
      for (const region of props.regions) {
        this.logger.info(`Deploying stack policies for account ${accountId} in region ${region}`);
        const accountCredentials = await this.getAccountCredentials(accountId, currentAccountId, region, props);
        const client = new CloudFormationClient({
          retryStrategy: setRetryStrategy(),
          region: region,
          credentials: accountCredentials,
        });

        const stacksInRegion = await this.loadLzaStackNames(client, props.acceleratorPrefix);
        if (props.dryRun) {
          return this.executeDryRun(stacksInRegion, region, props);
        }

        const stackPromises = (stacksInRegion ?? []).map(stackName => {
          return this.setStackPolicy(client, stackName, policy, region, props.enabled);
        });
        await Promise.all(stackPromises);
      }
    }

    return `StackPolicy has been succesfully changed to ${props.enabled}`;
  }

  private executeDryRun(stacksInRegion: string[], region: string, props: IStackPolicyHandlerParameter) {
    this.logger.info(`Starting dry run for stack policies...`);
    stacksInRegion?.forEach(stackName => {
      this.logger.info(`Set Stack Policy for stack ${stackName} in region ${region} to ${props.enabled}`);
    });
    const status = `StackPolicy dry run finished succesfully.`;
    return generateDryRunResponse(props.moduleName ?? 'Stack Policy Module', props.operation, status);
  }

  private async getAccountCredentials(
    accountId: string,
    currentAccountId: string,
    region: string,
    props: IStackPolicyHandlerParameter,
  ): Promise<IAssumeRoleCredential | undefined> {
    if (currentAccountId === accountId) {
      this.logger.info(`Using existing credentials for account ${accountId} in region ${region}`);
      return props.credentials;
    }

    this.logger.info(`Getting credentials for account ${accountId} in region ${region}`);
    return await getCredentials({
      accountId,
      region,
      solutionId: props.solutionId,
      partition: props.partition,
      assumeRoleName: props.managementAccountAccessRole,
      sessionName: 'AcceleratorCreateStackPolicy',
      credentials: props.credentials,
    });
  }

  private async setStackPolicy(
    client: CloudFormationClient,
    stackName: string,
    policy: string,
    region: string,
    enabled: boolean,
  ): Promise<void> {
    try {
      const response = await client.send(new SetStackPolicyCommand({ StackName: stackName, StackPolicyBody: policy }));
      if (response.$metadata.httpStatusCode === 200) {
        this.logger.info(`Set Stack Policy for stack ${stackName} in region ${region} to ${enabled}`);
      } else {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to set Stack Policy for stack ${stackName} in region ${region} to ${enabled}`,
        );
      }
    } catch (e: unknown) {
      this.logger.error(`Failed to set Stack Policy for stack ${stackName} in region ${region} to ${enabled}`);
      throw e;
    }
  }

  private async loadLzaStackNames(client: CloudFormationClient, acceleratorPrefix: string): Promise<string[]> {
    const stacks: string[] = [];

    const listStackInput: ListStacksCommandInput = {
      StackStatusFilter: STATUS_STACK_FILTER,
    };

    const paginationConfig: CloudFormationPaginationConfiguration = {
      client: client,
      pageSize: 50,
    };

    const stacksPaginated = paginateListStacks(paginationConfig, listStackInput);

    for await (const page of stacksPaginated) {
      const lzaStacks = page.StackSummaries?.filter(summary => summary.StackName?.startsWith(acceleratorPrefix)) ?? [];
      lzaStacks.forEach(summary => stacks.push(summary.StackName!));
    }

    return stacks;
  }

  private createDenyStackPolicy(protectedTypes: string[]): string {
    const policy = {
      Statement: [
        {
          Effect: 'Deny',
          Action: ['Update:Replace', 'Update:Delete'],
          Principal: '*',
          Resource: '*',
          Condition: {
            StringEquals: {
              ResourceType: protectedTypes ?? [],
            },
          },
        },
        ALLOW_STATEMENT,
      ],
    };

    return JSON.stringify(policy);
  }

  private createAllowStackPolicy(): string {
    const policy = {
      Statement: [ALLOW_STATEMENT],
    };
    return JSON.stringify(policy);
  }
}
