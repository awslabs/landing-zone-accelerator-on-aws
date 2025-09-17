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
import * as fs from 'fs';
import * as path from 'path';

import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { createLogger } from '@aws-accelerator/utils';
import { Accelerator, shouldLookupDynamoDb } from './accelerator';

const logger = createLogger(['config-replacement']);
const configDirPath = process.argv[2];
const homeRegion = GlobalConfig.loadRawGlobalConfig(configDirPath).homeRegion;

const fileNameList = [
  CustomizationsConfig.FILENAME,
  GlobalConfig.FILENAME,
  IamConfig.FILENAME,
  NetworkConfig.FILENAME,
  OrganizationConfig.FILENAME,
  SecurityConfig.FILENAME,
];

const enableSingleAccountMode = process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE']
  ? process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] === 'true'
  : false;

const props = {
  partition: process.env['PARTITION'] ?? 'aws',
  region: process.env['AWS_REGION'],
  account: process.env['ACCOUNT_ID'],
  enableSingleAccountMode: enableSingleAccountMode,
  // stage is needed to find if dynamoDB lookup is needed. ACCELERATOR_STAGE is set in codePipeline environments
  stage: process.env['ACCELERATOR_STAGE'],
};

if (configDirPath) {
  logger.info(`Config source directory - ${configDirPath}`);
  processReplacements(props);
} else {
  logger.error('Config source directory undefined !!!');
  process.exit(1);
}

async function processReplacements(props: {
  partition: string;
  region: string | undefined;
  enableSingleAccountMode: boolean;
  account: string | undefined;
  stage: string | undefined;
}) {
  await Accelerator.getManagementAccountCredentials(props.partition);
  const orgsEnabled = OrganizationConfig.loadRawOrganizationsConfig(configDirPath).enable;
  const loadFromDynamoDbTable = shouldLookupDynamoDb(props.stage);

  // Load accounts config
  let accountsConfig: AccountsConfig | undefined = undefined;
  try {
    accountsConfig = AccountsConfig.load(configDirPath);
    await accountsConfig.loadAccountIds(
      props.partition,
      props.enableSingleAccountMode,
      orgsEnabled,
      accountsConfig,
      undefined,
      loadFromDynamoDbTable,
    );
  } catch (e) {
    logger.error(`Error loading accounts config: ${e}`);
    process.exit(1);
  }

  // Load replacements config
  let replacementsConfig: ReplacementsConfig | undefined = undefined;
  try {
    replacementsConfig = ReplacementsConfig.load(configDirPath, accountsConfig);
    await replacementsConfig.loadDynamicReplacements(homeRegion);
  } catch (e) {
    logger.error(`Error loading replacements config: ${e}`);
    process.exit(1);
  }

  // Process each config file
  for (const fileName of fileNameList) {
    const filePath = path.join(configDirPath, fileName);

    // Skip if file doesn't exist
    if (!fs.existsSync(filePath)) {
      logger.info(`Skipping ${fileName} as it does not exist`);
      continue;
    }

    try {
      // Read the original file
      const originalContent = fs.readFileSync(filePath, 'utf8');

      // Process replacements
      const processedContent = replacementsConfig.preProcessBuffer(originalContent);

      // Create output file with -replaced suffix
      const outputFilePath = filePath.replace('.yaml', '-replaced.yaml');
      fs.writeFileSync(outputFilePath, processedContent);

      logger.info(`Successfully processed ${fileName} -> ${path.basename(outputFilePath)}`);
    } catch (e) {
      logger.error(`Error processing ${fileName}: ${e}`);
    }
  }

  logger.info('Configuration replacement completed successfully');
}
