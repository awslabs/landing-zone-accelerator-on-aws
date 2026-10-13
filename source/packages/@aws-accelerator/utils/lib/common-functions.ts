import {
  STSClient,
  AssumeRoleCommand,
  AssumeRoleCommandInput,
  AssumeRoleCommandOutput,
  GetCallerIdentityCommand,
  Credentials,
} from '@aws-sdk/client-sts';
import { throttlingBackOff } from './throttle';
import { AwsClientFactory } from './aws-client-factory';
import { createLogger } from './logger';
import { glob } from 'glob';
import { dirname } from 'path';
import * as fs from 'fs';
import { config } from '../../../../package.json';

// Re-exported so existing deep imports (`@aws-accelerator/utils/lib/common-functions`)
// keep resolving `setRetryStrategy`. The definition lives in `./retry-strategy`, a
// dependency-free module, so `aws-client-factory` can import it without creating an
// import cycle with this module.
export { setRetryStrategy } from './retry-strategy';

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
  const stsClient = AwsClientFactory.create(STSClient, { region });
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

export async function getCurrentAccountId(partition: string, region: string, stsClient?: STSClient): Promise<string> {
  if (!stsClient) {
    logger.debug(`Resolving current account id in partition ${partition} region ${region}`);
    stsClient = AwsClientFactory.create(STSClient, { region });
  }
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
    const stsClient = AwsClientFactory.create(STSClient, {});
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
    const managementStsClient = AwsClientFactory.create(STSClient, {
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

/**
 * Returns the default VPC endpoint service name prefix for the given partition.
 *
 * Interface endpoint service names usually follow `{prefix}.{region}.{service}` and Gateway
 * Load Balancer endpoint service names `{prefix}.vpce.{region}.{service-id}`. `VpcEndpoint`
 * builds other forms for some services, such as `{prefix}.iam` and `aws.sagemaker.{region}.notebook`.
 * The default prefix per partition:
 * - aws, aws-us-gov: com.amazonaws
 * - aws-cn: cn.com.amazonaws
 * - aws-eusc: eu.amazonaws
 *
 * The prefix is set per service, not per partition. In aws-cn and aws-eusc many services use
 * `com.amazonaws`. For example, in eusc-de-east-1 (October 2026) only Gateway Load Balancer
 * endpoint services and athena, ecr.api, ecr.dkr, execute-api, outposts and securityhub use
 * `eu.amazonaws`; kms is `com.amazonaws.eusc-de-east-1.kms`, not `eu.amazonaws.eusc-de-east-1.kms`.
 * List the service names in a Region with `aws ec2 describe-vpc-endpoint-services`.
 *
 * Any value other than a literal partition, including the `AWS::Partition` token, returns
 * `com.amazonaws`. `NetworkVpcEndpointsStack` passes `cdk.Stack.of(this).partition`, which is that
 * token because the accelerator app does not enable `@aws-cdk/core:enablePartitionLiterals`, so
 * interface endpoints use `com.amazonaws` in every partition unless `serviceName` is set.
 * `NetworkAssociationsGwlbStack` passes the literal partition. Changing what either caller passes
 * changes the service names of deployed endpoints.
 *
 * @param partition - The AWS partition identifier
 * @returns The VPC endpoint service name prefix for the partition
 */
export function getVpcEndpointServicePrefix(partition: string): string {
  switch (partition) {
    case 'aws-cn':
      return 'cn.com.amazonaws';
    case 'aws-eusc':
      return 'eu.amazonaws';
    default:
      return 'com.amazonaws';
  }
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
    case 'aws-eusc':
      return 'eusc-de-east-1';
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
 * Returns a shell command that activates the Node.js runtime already baked into the
 * CodeBuild managed image by prepending its bin directory to `PATH`.
 *
 * @remarks
 * CodeBuild standard images pre-install several Node.js majors (via `n`) but only
 * default-activate one of them (for example `aws/codebuild/standard:7.0` defaults to
 * Node 18, even though 20/22/24 are also on disk). Requesting a different, *non-default*
 * major through the buildspec `runtime-versions: { nodejs: <major> }` directive makes the
 * CodeBuild agent re-provision that runtime on every build, adding ~60s of wall-clock time
 * per run. Because the target binaries are already present under n's version directory,
 * we skip `runtime-versions` entirely and prepend the matching version to `PATH` instead —
 * an instant, network-free switch. The exported `PATH` persists to later buildspec phases.
 *
 * The command fails loudly (exit 1) if the requested major is not pre-installed, rather
 * than silently running the image default (which could be below the supported minimum).
 *
 * Only `$NAME` / `$(...)` shell syntax is used (no `${...}`) so the returned string is safe
 * to embed in a buildspec even when `nodeVersionMajor` is a CloudFormation token rendered
 * through `Fn::Sub`.
 *
 * @param nodeVersionMajor Node.js major version to activate. Accepts a number, a string, or
 * a CloudFormation token. Defaults to {@link getNodeVersion}.
 * @returns A single shell command string suitable for a CodeBuild `install` phase.
 */
export function getNodeRuntimeActivationCommand(nodeVersionMajor: number | string = getNodeVersion()): string {
  const nodeVersionsDir = '/usr/local/n/versions/node';
  return (
    `NODE_BIN="$(ls -d ${nodeVersionsDir}/${nodeVersionMajor}.*/bin 2>/dev/null | sort -V | tail -1)" && ` +
    `if [ -z "$NODE_BIN" ]; then ` +
    `echo "ERROR: Node.js ${nodeVersionMajor}.x is not pre-installed in this CodeBuild image" >&2; exit 1; ` +
    `fi && export PATH="$NODE_BIN:$PATH" && node --version`
  );
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
