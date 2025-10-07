import {
  STSClient,
  AssumeRoleCommand,
  AssumeRoleCommandInput,
  AssumeRoleCommandOutput,
  GetCallerIdentityCommand,
  Credentials,
} from '@aws-sdk/client-sts';
import { throttlingBackOff } from './throttle';
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';
import { createLogger } from './logger';
import { glob } from 'glob';
import { dirname } from 'path';
import * as fs from 'fs';
import { config } from '../../../../package.json';

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
  sessionName?: string,
) {
  logger.debug(`Getting credentials for account ${accountId} using role ${managementAccountAccessRole}`);
  if (region === 'undefined') {
    logger.debug(`Region was undefined, defaulting to creating STS client in the global region`);
    region = getGlobalRegion(partition);
  }
  const stsClient = new STSClient({
    region: region,
    retryStrategy: setRetryStrategy(),
    endpoint: getStsEndpoint(partition, region),
  });
  const stsParams: AssumeRoleCommandInput = {
    RoleArn: `arn:${partition}:iam::${accountId}:role/${managementAccountAccessRole}`,
    RoleSessionName: sessionName ?? 'acceleratorBootstrapCheck',
    DurationSeconds: 3600,
  };
  let assumeRoleCredential: AssumeRoleCommandOutput | undefined = undefined;
  try {
    assumeRoleCredential = await throttlingBackOff(() => stsClient.send(new AssumeRoleCommand(stsParams)));
    if (assumeRoleCredential) {
      return assumeRoleCredential;
    } else {
      throw new Error(`Error assuming role ${managementAccountAccessRole} in account ${accountId} ${sessionName}`);
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

export async function getManagementAccountCredentials(partition: string): Promise<Credentials | undefined> {
  if (process.env['CREDENTIALS_PATH'] && fs.existsSync(process.env['CREDENTIALS_PATH'])) {
    logger.info('Detected Debugging environment. Loading temporary credentials.');

    const credentialsString = fs.readFileSync(process.env['CREDENTIALS_PATH']).toString();
    const credentials = JSON.parse(credentialsString);

    // Set environment variables for SDK v3
    process.env['AWS_ACCESS_KEY_ID'] = credentials.AccessKeyId;
    process.env['AWS_SECRET_ACCESS_KEY'] = credentials.SecretAccessKey;
    if (credentials.SessionToken) {
      process.env['AWS_SESSION_TOKEN'] = credentials.SessionToken;
    }
  }

  if (process.env['MANAGEMENT_ACCOUNT_ID'] && process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']) {
    logger.info('set management account credentials');
    logger.info(`managementAccountId => ${process.env['MANAGEMENT_ACCOUNT_ID']}`);
    logger.info(`management account role name => ${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`);

    const roleArn = `arn:${partition}:iam::${process.env['MANAGEMENT_ACCOUNT_ID']}:role/${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`;
    const stsClient = new STSClient({
      region: process.env['AWS_REGION'],
      retryStrategy: setRetryStrategy(),
      customUserAgent: process.env['SOLUTION_ID'] ?? '',
    });
    const callerIdentity = await throttlingBackOff(() => stsClient.send(new GetCallerIdentityCommand({})));
    if (callerIdentity.Account && callerIdentity.Account === process.env['MANAGEMENT_ACCOUNT_ID']) {
      logger.info(`Currently using management account credentials with role ${callerIdentity.Arn}`);
      return undefined;
    }
    const assumeRoleCredential = await throttlingBackOff(() =>
      stsClient.send(new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: 'acceleratorAssumeRoleSession' })),
    );
    const acceleratorPrefix = process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator';
    const lzaManagementRoleArn = `arn:${partition}:iam::${process.env['MANAGEMENT_ACCOUNT_ID']}:role/${acceleratorPrefix}-Management-Deployment-Role`;
    logger.info(`management account role name => ${acceleratorPrefix}-Management-Deployment-Role`);
    const managementStsClient = new STSClient({
      region: process.env['AWS_REGION'],
      retryStrategy: setRetryStrategy(),
      customUserAgent: process.env['SOLUTION_ID'] ?? '',
      credentials: {
        accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
        secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
        sessionToken: assumeRoleCredential.Credentials!.SessionToken!,
      },
    });

    const assumeLzaManagementRole = await throttlingBackOff(() =>
      managementStsClient.send(
        new AssumeRoleCommand({ RoleArn: lzaManagementRoleArn, RoleSessionName: 'lzaManagementRoleSession' }),
      ),
    );
    return {
      AccessKeyId: assumeLzaManagementRole.Credentials!.AccessKeyId!,
      SecretAccessKey: assumeLzaManagementRole.Credentials!.SecretAccessKey!,
      SessionToken: assumeLzaManagementRole.Credentials!.SessionToken,
    } as Credentials;
  } else {
    return undefined;
  }
}

export function setEnvironmentCredentials(credentials: Credentials | undefined) {
  if (!credentials) {
    return;
  }
  process.env['AWS_ACCESS_KEY_ID'] = credentials.AccessKeyId;
  process.env['AWS_ACCESS_KEY'] = credentials.AccessKeyId;
  process.env['AWS_SECRET_KEY'] = credentials.SecretAccessKey;
  process.env['AWS_SECRET_ACCESS_KEY'] = credentials.SecretAccessKey;
  process.env['AWS_SESSION_TOKEN'] = credentials.SessionToken;
}

export async function setExternalManagementAccountCredentials(
  partition: string,
  region: string,
): Promise<Credentials | undefined> {
  if (!process.env['PIPELINE_ACCOUNT_ID'] || !process.env['MANAGEMENT_ACCOUNT_ID']) {
    return undefined;
  }

  const currentAccountId = await getCurrentAccountId(partition, region);
  if (
    currentAccountId === process.env['PIPELINE_ACCOUNT_ID'] &&
    process.env['MANAGEMENT_ACCOUNT_ID'] !== process.env['PIPELINE_ACCOUNT_ID']
  ) {
    const credentials = await getManagementAccountCredentials(partition);
    setEnvironmentCredentials(credentials);
  }

  return undefined;
}

export function setRetryStrategy() {
  const numberOfRetries = Number(process.env['ACCELERATOR_SDK_MAX_ATTEMPTS'] ?? 800);
  return new ConfiguredRetryStrategy(numberOfRetries, (attempt: number) => 100 + attempt * 1000);
}

export function getStsEndpoint(partition: string, region: string): string {
  if (partition === 'aws-iso') {
    return `https://sts.${region}.c2s.ic.gov`;
  } else if (partition === 'aws-iso-b') {
    return `https://sts.${region}.sc2s.sgov.gov`;
  } else if (partition === 'aws-cn') {
    return `https://sts.${region}.amazonaws.com.cn`;
  } else if (partition === 'aws-iso-f') {
    return `https://sts.${region}.csp.hci.ic.gov`;
  } else if (partition === 'aws-iso-e') {
    return `https://sts.${region}.cloud.adc-e.uk`;
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
  logger.info(`Assuming role ${roleArn}...`);
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
export async function getAllFilesInPattern(dir: string, pattern: string, fullPath?: boolean): Promise<string[]> {
  const files = await glob(`${dir}/**/*${pattern}`, {
    ignore: ['**/node_modules/**'],
  });
  const parsedFiles = files.map(file => {
    return file.replace(dirname(file), '').replace('/', '').replace(pattern, '');
  });
  if (fullPath) {
    return files;
  }
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

/**
 * Sets the global region for API calls based on the given partition
 * @param partition
 * @returns region
 */
export function getGlobalRegion(partition: string): string {
  switch (partition) {
    case 'aws-us-gov':
      return 'us-gov-west-1';
    case 'aws-iso':
      return 'us-iso-east-1';
    case 'aws-iso-b':
      return 'us-isob-east-1';
    case 'aws-iso-e':
      return 'eu-isoe-west-1';
    case 'aws-iso-f':
      return 'us-isof-south-1';
    case 'aws-cn':
      return 'cn-northwest-1';
    default:
      return 'us-east-1';
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.stat(filePath);
    return true;
  } catch (err) {
    logger.debug('file exists check', err);
    return false;
  }
}

export async function directoryExists(directory: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(directory);
    return stats.isDirectory();
  } catch (err) {
    logger.debug('directory exists check', err);
    return false;
  }
}

/**
 * Retrieves the Node.js version to be used in the accelerator.
 *
 * This function checks for a Node.js version specified in the 'ACCELERATOR_NODE_VERSION'
 * environment variable. If not set, it falls back to a default version.
 * The function also ensures that the version meets the minimum required version.
 *
 * @throws {Error} If the Node.js version is invalid (not a number) or below the minimum supported version.
 *
 * @returns {number} The Node.js version to be used.
 */
export function getNodeVersion(): number {
  const defaultNodeVersion = config.node.version.default;
  const minimumNodeVersion = config.node.version.minimum;

  const nodeVersion = process.env['ACCELERATOR_NODE_VERSION']
    ? Number(process.env['ACCELERATOR_NODE_VERSION'])
    : defaultNodeVersion;

  if (isNaN(nodeVersion) || nodeVersion < minimumNodeVersion) {
    throw new Error(
      `Invalid or unsupported Node.js version: ${nodeVersion}. Minimum supported version is ${minimumNodeVersion}.`,
    );
  }
  return nodeVersion;
}

/**
 * Helper function to remove the string that makes a vpc
 * name unique when upgraded from ASEA. Will return the
 * original string if the delimiter characters are not
 * in the string
 * @param vpcName
 * @returns string
 */
export function getAseaVpcName(vpcName: string): string {
  return removeAfterSequence(vpcName, '..');
}

export function getAseaConfigVpcName(vpcName: string): string {
  return removeAfterSequence(vpcName, '..').replace('_vpc_vpc', '_vpc');
}

export function removeAfterSequence(text: string, sequence: string): string {
  const index = text.indexOf(sequence);
  return index === -1 ? text : text.substring(0, index);
}
