import {
  CloudFormationClient,
  GetTemplateCommand,
  GetTemplateCommandInput,
  CloudFormationServiceException,
  TemplateStage,
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
  stage: string | undefined,
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

    let template = await getTemplate(client, stackName);

    if (stage === 'customizations' && template === '{}') {
      logger.warn(`template is empty for ${stackName}. Trying to retrieve stack by customizations stack name`);
      // Removes account and region to find possible customizations stack name
      const stackNameArr = stackName.split('-');
      for (let i = 0; i < 4; i++) {
        stackNameArr.pop();
      }
      const customizationsStackName = stackNameArr.join('-');
      logger.info(`Possible customizations stack name is ${customizationsStackName}`);
      template = await getTemplate(client, customizationsStackName, 'Original');
    }
    fs.writeFileSync(path.join(savePath, `${stackName}.json`), template, 'utf-8');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    logger.error(e);
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
  if (currentAccountId === accountId || currentAccountId === process.env['MANAGEMENT_ACCOUNT_ID']) {
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

async function getTemplate(client: CloudFormationClient, stackName: string, templateStage?: string): Promise<string> {
  try {
    if (!templateStage) {
      templateStage = 'Processed';
    }
    const input: GetTemplateCommandInput = {
      StackName: stackName,
      TemplateStage: templateStage as TemplateStage,
    };
    const command = new GetTemplateCommand(input);
    const response = await throttlingBackOff(() => client.send(command));
    const templateBody = isValidJsonObject(response.TemplateBody ?? '');
    return templateBody;
  } catch (e) {
    if (e instanceof CloudFormationServiceException) {
      if (e.message === `Stack with id ${stackName} does not exist`) {
        // write an empty json since stack does not exist
        return '{}';
      }
    } else {
      logger.error(JSON.stringify(e));
    }
  }
  return '{}';
}

/**
 * Checks if the given string is a valid JSON object.
 *
 * @param {string} str - The input string to be checked.
 * @returns {string} If the input string is a valid JSON object, it returns the original input string.
 *                    If the input string is not a valid JSON object, it returns an empty JSON object string '{}'.
 */
function isValidJsonObject(str: string): string {
  try {
    // Attempt to parse the input string as JSON
    const parsedJson = JSON.parse(str);

    // Check if the parsed value is an object and not null
    if (typeof parsedJson === 'object' && parsedJson !== null) {
      // If it's a valid JSON object, return the original input string
      return str;
    } else {
      // If it's not a valid JSON object, return an empty JSON object string
      return '{}';
    }
  } catch (error) {
    // If there's an error during parsing (e.g., the input string is not valid JSON),
    // return an empty JSON object string
    return '{}';
  }
}
