/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { throttlingBackOff } from '@aws-accelerator/utils';
import { EC2Client } from '@aws-sdk/client-ec2';
import {
  CopyObjectCommand,
  CopyObjectCommandOutput,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutObjectCommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';
import { FirewallReplacements, VpnConnectionProps, initReplacements } from './replacements';

export interface IStaticReplacements {
  /**
   * The key name for the replacement
   */
  readonly key: string;
  /**
   * The value for the replacement
   */
  readonly value: string;
}

export interface FirewallReplacementOptions {
  /**
   * The AWS Partition
   */
  readonly partition: string;
  /**
   * The name of the S3 asset bucket
   */
  readonly assetBucketName: string;
  /**
   * The name of the S3 config bucket
   */
  readonly configBucketName: string;
  /**
   * The VPC ID where the firewall resides
   */
  readonly vpcId: string;
  /**
   * The key name of the configuration file
   */
  readonly configFileKey?: string;
  /**
   * The directory of the configuration files
   */
  readonly configDir?: string;
  /**
   * The hostname of the firewall instance
   */
  readonly firewallName?: string;
  /**
   * The instance ID of the firewall instance
   */
  readonly instanceId?: string;
  /**
   * The key name of the license file
   */
  readonly licenseFileKey?: string;
  /**
   * The name of the role to assume to retrieve cross-account values
   */
  readonly roleName?: string;
  /**
   * Static replacements
   */
  readonly staticReplacements?: IStaticReplacements[];
  /**
   * VPN connection details to look up
   */
  readonly vpnConnectionProps?: VpnConnectionProps[];
  /**
   * Management Account ID used to read Secrets Manager secrets for replacements
   */
  readonly managementAccountId?: string;
}

export async function handler(
  event: AWSLambda.CloudFormationCustomResourceEvent,
): Promise<{ Status: string } | undefined> {
  //
  // Set custom resource options
  const options = setOptions(event.ResourceProperties);
  //
  // Set up clients
  const ec2Client = new EC2Client({ customUserAgent: process.env['SOLUTION_ID'] });
  const s3Client = new S3Client({ customUserAgent: process.env['SOLUTION_ID'] });
  //
  // Begin handler logic
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      //
      // Copy license file
      await copyLicenseFile(s3Client, options);
      //
      // Process config file replacements
      const replacements =
        options.configFileKey || options.configDir
          ? await initReplacements(ec2Client, event.ServiceToken, options)
          : undefined;
      await processConfigFileReplacements(s3Client, options, replacements);

      return {
        Status: 'SUCCESS',
      };

    case 'Delete':
      //
      // Do nothing
      return {
        Status: 'SUCCESS',
      };
  }
}

/**
 * Set firewall replacement options based on event
 * @param resourceProperties { [key: string]: any }
 * @returns FirewallReplacementOptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOptions(resourceProperties: { [key: string]: any }): FirewallReplacementOptions {
  return {
    partition: (resourceProperties['ServiceToken'] as string).split(':')[1],
    assetBucketName: resourceProperties['assetBucketName'] as string,
    configBucketName: resourceProperties['configBucketName'] as string,
    vpcId: resourceProperties['vpcId'] as string,
    configFileKey: (resourceProperties['configFile'] as string) ?? undefined,
    configDir: (resourceProperties['configDir'] as string) ?? undefined,
    firewallName: (resourceProperties['firewallName'] as string) ?? undefined,
    instanceId: (resourceProperties['instanceId'] as string) ?? undefined,
    licenseFileKey: (resourceProperties['licenseFile'] as string) ?? undefined,
    roleName: (resourceProperties['roleName'] as string) ?? undefined,
    staticReplacements: (resourceProperties['staticReplacements'] as IStaticReplacements[]) ?? undefined,
    vpnConnectionProps: (resourceProperties['vpnConnections'] as VpnConnectionProps[]) ?? undefined,
    managementAccountId: (resourceProperties['managementAccountId'] as string) ?? undefined,
  };
}

/**
 * Copy license file from asset bucket to config bucket
 * @param s3Client S3Client
 * @param options FirewallReplacementOptions
 * @returns Promise<CopyObjectCommandOutput | undefined>
 */
async function copyLicenseFile(
  s3Client: S3Client,
  options: FirewallReplacementOptions,
): Promise<CopyObjectCommandOutput | undefined> {
  if (!options.licenseFileKey) {
    return;
  }

  console.log(
    `Copying license file ${options.licenseFileKey} from bucket s3://${options.assetBucketName} to s3://${options.configBucketName}...`,
  );
  try {
    const response = await throttlingBackOff(() =>
      s3Client.send(
        new CopyObjectCommand({
          CopySource: `${options.assetBucketName}/${options.licenseFileKey}`,
          Bucket: options.configBucketName,
          Key: options.licenseFileKey,
        }),
      ),
    );

    return response;
  } catch (e) {
    throw new Error(`${e}`);
  }
}

/**
 *
 * @param s3Client S3Client
 * @param options FirewallReplacementOptions
 * @param replacements string | undefined
 * @returns Promise<CopyObjectCommandOutput | undefined>
 */
async function processConfigFileReplacements(
  s3Client: S3Client,
  options: FirewallReplacementOptions,
  replacements?: FirewallReplacements,
): Promise<PutObjectCommandOutput | undefined> {
  //
  // Validate input
  if ((!options.configFileKey || !options.configDir) && !replacements) {
    return;
  } else if ((options.configFileKey || options.configDir) && !replacements) {
    throw new Error(`Configuration file/directory S3 key provided but replacements are undefined`);
  } else if ((options.configFileKey || options.configDir) && replacements) {
    const configFiles = options.configFileKey ? [options.configFileKey] : [];
    if (options.configDir) {
      const objs = await s3Client.send(
        new ListObjectsV2Command({ Bucket: options.assetBucketName, Prefix: options.configDir }),
      );
      for (const obj of objs.Contents ?? []) {
        // Empty folders are ignored here
        if (obj.Key!.endsWith('/')) continue;
        configFiles.push(obj.Key!);
      }
    }
    for (const configFileKey of configFiles) {
      //
      // Get raw config asset
      const rawFile = await getRawConfigFile(s3Client, options.assetBucketName, configFileKey);
      //
      // Process replacements
      const transformedFile = await transformConfigFile(replacements, rawFile);
      //
      // Put transformed config file
      await putTransformedConfigFile(s3Client, options.configBucketName, transformedFile, configFileKey);
    }
  }
  return;
}

/**
 * Get raw configuration file from asset bucket
 * @param s3Client S3Client
 * @param assetBucketName string
 * @param configFileKey string
 * @returns Promise<string | undefined>
 */
async function getRawConfigFile(
  s3Client: S3Client,
  assetBucketName: string,
  configFileKey: string,
): Promise<string | undefined> {
  console.log(`Retrieving raw configuration file ${configFileKey} from bucket s3://${assetBucketName}...`);
  try {
    const response = await throttlingBackOff(() =>
      s3Client.send(new GetObjectCommand({ Bucket: assetBucketName, Key: configFileKey })),
    );

    return await response.Body?.transformToString();
  } catch (e) {
    throw new Error(`${e}`);
  }
}

/**
 * Transform configuration file with replacements
 * @param replacements FirewallReplacements
 * @param configFile string | undefined
 * @returns string
 */
async function transformConfigFile(replacements: FirewallReplacements, configFile?: string): Promise<string> {
  if (!configFile) {
    throw new Error(`Encountered an error retrieving configuration file from S3`);
  }
  //
  // Process config file replacements
  const lookupRegex = /\${ACCEL_LOOKUP::(EC2|CUSTOM|SECRETS_MANAGER)(:.[^}]+){1,3}}/gi;
  const variables = [...new Set(configFile.match(lookupRegex) ?? [])];
  const replacedVariables = await replacements.processReplacements(variables);
  //
  // Transform variables to regex
  const regexVariables = transformVariablesToRegex(variables);

  for (const [index, value] of regexVariables.entries()) {
    configFile = configFile.replace(new RegExp(value, 'g'), replacedVariables[index]);
  }
  return configFile;
}

/**
 * Transform variables to a regex pattern
 * @param variables string[]
 * @returns string[]
 */
function transformVariablesToRegex(variables: string[]): string[] {
  const regexVariables: string[] = [];

  for (const variable of variables) {
    let regexVariable = variable;
    regexVariable = regexVariable.replace(/\$/, '\\$');
    regexVariable = regexVariable.replace(/\{/, '\\{');
    regexVariable = regexVariable.replace(/\}/, '\\}');
    regexVariables.push(regexVariable);
  }
  return regexVariables;
}

/**
 * Put transformed config file to config bucket
 * @param s3Client
 * @param configBucketName
 * @param transformedFile
 * @param configFileKey
 * @returns Promise<PutObjectCommandOutput | undefined>
 */
async function putTransformedConfigFile(
  s3Client: S3Client,
  configBucketName: string,
  transformedFile: string,
  configFileKey: string,
): Promise<PutObjectCommandOutput | undefined> {
  console.log(`Putting transformed configuration file ${configFileKey} to bucket s3://${configBucketName}...`);
  try {
    return await throttlingBackOff(() =>
      s3Client.send(new PutObjectCommand({ Bucket: configBucketName, Body: transformedFile, Key: configFileKey })),
    );
  } catch (e) {
    throw new Error(`${e}`);
  }
}
