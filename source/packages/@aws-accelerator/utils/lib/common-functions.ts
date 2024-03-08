import {
  STSClient,
  AssumeRoleCommand,
  AssumeRoleCommandInput,
  AssumeRoleCommandOutput,
  GetCallerIdentityCommand,
} from '@aws-sdk/client-sts';
import { throttlingBackOff } from './throttle';
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';
import { createLogger } from './logger';
import { glob } from 'glob';
import { dirname } from 'path';
const logger = createLogger(['utils-common-functions']);

export function chunkArray<Type>(array: Type[], chunkSize: number): Type[][] {
  const chunkedArray: Type[][] = [];
  let index = 0;

  while (index < array.length) {
    chunkedArray.push(array.slice(index, index + chunkSize));
    index += chunkSize;
  }
  return chunkedArray;
}

export async function getCrossAccountCredentials(
  accountId: string,
  region: string,
  partition: string,
  managementAccountAccessRole: string,
) {
  const stsClient = new STSClient({
    region: region,
    retryStrategy: setRetryStrategy(),
    endpoint: getStsEndpoint(partition, region),
  });
  const stsParams: AssumeRoleCommandInput = {
    RoleArn: `arn:${partition}:iam::${accountId}:role/${managementAccountAccessRole}`,
    RoleSessionName: 'acceleratorBootstrapCheck',
    DurationSeconds: 3600,
  };
  let assumeRoleCredential: AssumeRoleCommandOutput | undefined = undefined;
  try {
    assumeRoleCredential = await throttlingBackOff(() => stsClient.send(new AssumeRoleCommand(stsParams)));
    if (assumeRoleCredential) {
      return assumeRoleCredential;
    } else {
      throw new Error(
        `Error assuming role ${managementAccountAccessRole} in account ${accountId} for bootstrap checks`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    logger.error(JSON.stringify(e));
    throw new Error(e.message);
  }
}

export async function getCurrentAccountId(partition: string, region: string): Promise<string> {
  logger.debug(
    `Sts endpoint for partition ${partition} and region ${region} is : ${getStsEndpoint(partition, region)}`,
  );
  const stsClient = new STSClient({
    region,
    retryStrategy: setRetryStrategy(),
    endpoint: getStsEndpoint(partition, region),
  });
  try {
    const response = await throttlingBackOff(() => stsClient.send(new GetCallerIdentityCommand({})));
    logger.debug(`Current account id is ${response.Account!}`);
    return response.Account!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    logger.error(`Error to assume role while trying to get current account id ${JSON.stringify(error)}`);
    throw new Error(error.message);
  }
}

export function setRetryStrategy() {
  return new ConfiguredRetryStrategy(10, (attempt: number) => 100 + attempt * 1000);
}

export function getStsEndpoint(partition: string, region: string): string {
  if (partition === 'aws-iso') {
    return `https://sts.${region}.c2s.ic.gov`;
  } else if (partition === 'aws-iso-b') {
    return `https://sts.${region}.sc2s.sgov.gov`;
  } else if (partition === 'aws-cn') {
    return `https://sts.${region}.amazonaws.com.cn`;
  }
  // both commercial and govCloud return this pattern
  return `https://sts.${region}.amazonaws.com`;
}

// Converts strings with wildcards (*) to regular expressions to determine if log group name matches exclusion pattern
export function wildcardMatch(text: string, pattern: string): boolean {
  const regexPattern = new RegExp('^' + pattern.replace(/\?/g, '.').replace(/\*/g, '.*') + '$');
  logger.debug(`Converted wildcard pattern ${pattern} to regex pattern ${regexPattern}`);
  const patternMatch = regexPattern.test(text);
  logger.info(`Checking if input string ${text} matches pattern ${pattern} provided. Result: ${patternMatch}`);
  return patternMatch;
}

/**
 * Returns STS credentials for a given role ARN
 * @param stsClient STSClient
 * @param roleArn string
 * @returns `Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string }>`
 */
export async function getStsCredentials(
  stsClient: STSClient,
  roleArn: string,
): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string }> {
  console.log(`Assuming role ${roleArn}...`);
  try {
    const response = await throttlingBackOff(() =>
      stsClient.send(new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: 'AcceleratorAssumeRole' })),
    );
    //
    // Validate response
    if (!response.Credentials?.AccessKeyId) {
      throw new Error(`Access key ID not returned from AssumeRole command`);
    }
    if (!response.Credentials.SecretAccessKey) {
      throw new Error(`Secret access key not returned from AssumeRole command`);
    }
    if (!response.Credentials.SessionToken) {
      throw new Error(`Session token not returned from AssumeRole command`);
    }

    return {
      accessKeyId: response.Credentials.AccessKeyId,
      secretAccessKey: response.Credentials.SecretAccessKey,
      sessionToken: response.Credentials.SessionToken,
    };
  } catch (e) {
    throw new Error(`Could not assume role: ${e}`);
  }
}

/**
 * Function getAllFilesInPattern - returns all file names in a given directory that match a pattern
 * its recursive so top level files will be returned as well as files in sub directories
 * Only file name will be returned. For example, if file is testName.extension then return will be testName
 */
export async function getAllFilesInPattern(dir: string, pattern: string): Promise<string[]> {
  const files = await glob(`${dir}/**/*${pattern}`, {
    ignore: ['**/node_modules/**'],
  });
  logger.debug(`Found ${JSON.stringify(files)} files matching pattern ${pattern}`);
  const parsedFiles = files.map(file => {
    return file.replace(dirname(file), '').replace('/', '').replace(pattern, '');
  });
  logger.debug(`Parsed files ${JSON.stringify(parsedFiles)}`);
  return parsedFiles;
}

export async function checkDiffFiles(dir: string, templatePattern: string, diffPattern: string) {
  const templateFiles = await getAllFilesInPattern(dir, templatePattern);
  const diffFiles = await getAllFilesInPattern(dir, diffPattern);
  if (templateFiles.length !== diffFiles.length) {
    throw new Error(
      `Number of template files ${templateFiles.length} does not match number of diff files ${diffFiles.length} in directory ${dir}`,
    );
  }
}
