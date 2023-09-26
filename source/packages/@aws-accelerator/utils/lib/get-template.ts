import {
  CloudFormationClient,
  GetTemplateCommand,
  CloudFormationServiceException,
} from '@aws-sdk/client-cloudformation';
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';
import { getCrossAccountCredentials, getCurrentAccountId, setRetryStrategy } from './common-functions';
import { throttlingBackOff } from './throttle';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from './logger';
const logger = createLogger(['utils-get-template']);

export async function getCloudFormationTemplate(
  accountId: string,
  region: string,
  partition: string,
  stackName: string,
  savePath: string,
  roleName: string,
) {
  try {
    const currentAccountId = await getCurrentAccountId(partition, region);
    const client = await getCloudFormationClient(
      setRetryStrategy(),
      region,
      accountId,
      partition,
      roleName,
      currentAccountId,
    );

    const input = {
      StackName: stackName,
      TemplateStage: 'Processed',
    };
    const command = new GetTemplateCommand(input);
    const template = await getTemplate(client, command, stackName);
    fs.writeFileSync(path.join(savePath, `${stackName}.json`), template, 'utf-8');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    logger.error(
      `Error trying to get template for account ${accountId}, region: ${region}, stack: ${stackName} using role ${roleName}`,
    );
  }
}
async function getCloudFormationClient(
  retryStrategy: ConfiguredRetryStrategy,
  region: string,
  accountId: string,
  partition: string,
  roleName: string,
  currentAccountId: string,
): Promise<CloudFormationClient> {
  if (currentAccountId === accountId) {
    return new CloudFormationClient({ retryStrategy, region });
  } else {
    const crossAccountCredentials = await getCrossAccountCredentials(accountId, region, partition, roleName);
    return new CloudFormationClient({
      retryStrategy,
      region,
      credentials: {
        accessKeyId: crossAccountCredentials.Credentials!.AccessKeyId!,
        secretAccessKey: crossAccountCredentials.Credentials!.SecretAccessKey!,
        sessionToken: crossAccountCredentials.Credentials!.SessionToken!,
      },
    });
  }
}

async function getTemplate(
  client: CloudFormationClient,
  command: GetTemplateCommand,
  stackName: string,
): Promise<string> {
  try {
    const response = await throttlingBackOff(() => client.send(command));
    return response.TemplateBody!;
  } catch (e) {
    if (e instanceof CloudFormationServiceException) {
      if (e.message === `Stack with id ${stackName} does not exist`) {
        // write an empty json since stack does not exist
        return '{}';
      }
    }
  }
  return '{}';
}
