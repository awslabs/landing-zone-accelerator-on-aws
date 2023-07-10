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

import { EC2Client } from '@aws-sdk/client-ec2';
import {
  S3Client,
  CopyObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommandOutput,
  PutObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { initReplacements, VpcReplacements } from './replacements';
import { throttlingBackOff } from '@aws-accelerator/utils';

export async function handler(
  event: AWSLambda.CloudFormationCustomResourceEvent,
): Promise<{ Status: string } | undefined> {
  //
  // Get resource properties and env variables
  const assetBucketName: string = event.ResourceProperties['assetBucketName'];
  const configBucketName: string = event.ResourceProperties['configBucketName'];
  const configFileKey: string | undefined = event.ResourceProperties['configFile'];
  const firewallName: string | undefined = event.ResourceProperties['firewallName'];
  const instanceId: string | undefined = event.ResourceProperties['instanceId'];
  const licenseFileKey: string | undefined = event.ResourceProperties['licenseFile'];
  const vpcId: string = event.ResourceProperties['vpcId'];
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
      await copyLicenseFile(s3Client, assetBucketName, configBucketName, licenseFileKey);
      //
      // Process config file replacements
      const replacements = configFileKey
        ? await initReplacements(ec2Client, vpcId, firewallName, instanceId)
        : undefined;
      await processConfigFileReplacements(s3Client, assetBucketName, configBucketName, configFileKey, replacements);

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
 * Copy license file from asset bucket to config bucket
 * @param s3Client S3Client
 * @param assetBucketName string
 * @param configBucketName string
 * @param licenseFileKey string | undefined
 * @returns Promise<CopyObjectCommandOutput | undefined>
 */
async function copyLicenseFile(
  s3Client: S3Client,
  assetBucketName: string,
  configBucketName: string,
  licenseFileKey?: string,
): Promise<CopyObjectCommandOutput | undefined> {
  if (!licenseFileKey) {
    return;
  }

  console.log(
    `Copying license file ${licenseFileKey} from bucket s3://${assetBucketName} to s3://${configBucketName}...`,
  );
  try {
    const response = await throttlingBackOff(() =>
      s3Client.send(
        new CopyObjectCommand({
          CopySource: `${assetBucketName}/${licenseFileKey}`,
          Bucket: configBucketName,
          Key: licenseFileKey,
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
 * @param assetBucketName string
 * @param configBucketName string
 * @param configFileKey string | undefined
 * @param replacements string | undefined
 * @returns Promise<CopyObjectCommandOutput | undefined>
 */
async function processConfigFileReplacements(
  s3Client: S3Client,
  assetBucketName: string,
  configBucketName: string,
  configFileKey?: string,
  replacements?: VpcReplacements,
): Promise<PutObjectCommandOutput | undefined> {
  //
  // Validate input
  if (!configFileKey && !replacements) {
    return;
  } else if (configFileKey && !replacements) {
    throw new Error(`Configuration file S3 key provided but replacements are undefined`);
  } else if (configFileKey && replacements) {
    //
    // Get raw config asset
    const rawFile = await getRawConfigFile(s3Client, assetBucketName, configFileKey);
    //
    // Process replacements
    const transformedFile = transformConfigFile(replacements, rawFile);
    //
    // Put transformed config file
    return await putTransformedConfigFile(s3Client, configBucketName, transformedFile, configFileKey);
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
 * @param replacements
 * @param configFile
 * @returns string
 */
function transformConfigFile(replacements: VpcReplacements, configFile?: string): string {
  if (!configFile) {
    throw new Error(`Encountered an error retrieving configuration file from S3`);
  }
  //
  // Process config file replacements
  const variables = [...new Set(configFile.match(/\$\{ACCEL_LOOKUP::EC2(:[a-z0-9_]+){2}(:.[^}]+){0,1}\}/gi) ?? [])];
  const replacedVariables = replacements.processReplacements(variables);
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
