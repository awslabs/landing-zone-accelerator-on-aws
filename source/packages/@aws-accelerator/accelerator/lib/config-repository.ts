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

import { Construct } from 'constructs';
import * as config from '@aws-accelerator/config';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface ConfigRepositoryProps {
  readonly repositoryName: string;
  readonly repositoryBranchName?: string;
  readonly description?: string;
}

/**
 * Class to create AWS accelerator configuration repository and initialize the repository with default configuration
 */
export class ConfigRepository extends Construct {
  readonly configRepo: cdk_extensions.Repository;

  constructor(scope: Construct, id: string, props: ConfigRepositoryProps) {
    super(scope, id);

    //
    // Generate default configuration files
    //
    const tempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'config-assets-'));

    fs.writeFileSync(
      path.join(tempDirPath, config.GlobalConfig.FILENAME),
      yaml.dump(new config.GlobalConfig()),
      'utf8',
    );

    fs.writeFileSync(
      path.join(tempDirPath, config.OrganizationConfig.FILENAME),
      yaml.dump(new config.OrganizationConfig()),
      'utf8',
    );

    fs.writeFileSync(
      path.join(tempDirPath, config.AccountsConfig.FILENAME),
      yaml.dump(new config.AccountsConfig()),
      'utf8',
    );

    fs.writeFileSync(
      path.join(tempDirPath, config.SecurityConfig.FILENAME),
      yaml.dump(new config.SecurityConfig()),
      'utf8',
    );

    fs.writeFileSync(path.join(tempDirPath, config.IamConfig.FILENAME), yaml.dump(new config.IamConfig()), 'utf8');

    const configurationDefaultsAssets = new s3_assets.Asset(this, 'ConfigurationDefaultsAssets', {
      path: tempDirPath,
    });

    this.configRepo = new cdk_extensions.Repository(this, 'Resource', {
      repositoryName: props.repositoryName,
      repositoryBranchName: props.repositoryBranchName!,
      s3BucketName: configurationDefaultsAssets.bucket.bucketName,
      s3key: configurationDefaultsAssets.s3ObjectKey,
    });

    // TODO: Add delete protection on the CodeCommit repository
  }

  /**
   * Method to get initialized repository object
   *
   * @return Returns Initialized repository object.
   */
  public getRepository(): cdk_extensions.Repository {
    return this.configRepo;
  }
}
