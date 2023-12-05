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
  const stsClient = new STSClient({
    region,
    retryStrategy: setRetryStrategy(),
    endpoint: getStsEndpoint(partition, region),
  });
  try {
    const response = await throttlingBackOff(() => stsClient.send(new GetCallerIdentityCommand({})));
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
