/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import {
  AccountsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
  Region,
} from '@aws-accelerator/config';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';
import * as cdk from 'aws-cdk-lib';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';

export interface ConfigRepositoryProps {
  readonly repositoryName: string;
  readonly repositoryBranchName?: string;
  readonly description?: string;
  readonly managementAccountEmail: string;
  readonly logArchiveAccountEmail: string;
  readonly auditAccountEmail: string;
  readonly controlTowerEnabled: string;
  readonly enableSingleAccountMode: boolean;
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

    let controlTowerEnabledValue = true;
    let managementAccountAccessRole = 'AWSControlTowerExecution';
    if (props.controlTowerEnabled.toLowerCase() === 'no') {
      controlTowerEnabledValue = false;
      managementAccountAccessRole = 'OrganizationAccountAccessRole';
    }

    fs.writeFileSync(
      path.join(tempDirPath, AccountsConfig.FILENAME),
      yaml.dump(
        new AccountsConfig({
          managementAccountEmail: props.managementAccountEmail,
          logArchiveAccountEmail: props.logArchiveAccountEmail,
          auditAccountEmail: props.auditAccountEmail,
        }),
      ),
      'utf8',
    );
    fs.writeFileSync(
      path.join(tempDirPath, GlobalConfig.FILENAME),
      yaml.dump(
        new GlobalConfig({
          homeRegion: cdk.Stack.of(this).region as Region,
          controlTower: { enable: controlTowerEnabledValue },
          managementAccountAccessRole: managementAccountAccessRole,
        }),
      ),
      'utf8',
    );
    fs.writeFileSync(path.join(tempDirPath, IamConfig.FILENAME), yaml.dump(new IamConfig()), 'utf8');
    fs.writeFileSync(path.join(tempDirPath, NetworkConfig.FILENAME), yaml.dump(new NetworkConfig()), 'utf8');
    if (props.enableSingleAccountMode) {
      const orgConfig = new OrganizationConfig({
        enable: false,
        organizationalUnits: [
          {
            name: 'Security',
            ignore: undefined,
          },
          {
            name: 'LogArchive',
            ignore: undefined,
          },
        ],
        organizationalUnitIds: [],
        serviceControlPolicies: [],
        taggingPolicies: [],
        backupPolicies: [],
      });
      fs.writeFileSync(path.join(tempDirPath, OrganizationConfig.FILENAME), yaml.dump(orgConfig), 'utf8');
    } else {
      fs.writeFileSync(
        path.join(tempDirPath, OrganizationConfig.FILENAME),
        yaml.dump(new OrganizationConfig()),
        'utf8',
      );
    }

    fs.writeFileSync(path.join(tempDirPath, SecurityConfig.FILENAME), yaml.dump(new SecurityConfig()), 'utf8');

    const configurationDefaultsAssets = new s3_assets.Asset(this, 'ConfigurationDefaultsAssets', {
      path: tempDirPath,
    });

    this.configRepo = new cdk_extensions.Repository(this, 'Resource', {
      repositoryName: props.repositoryName,
      repositoryBranchName: props.repositoryBranchName!,
      s3BucketName: configurationDefaultsAssets.bucket.bucketName,
      s3key: configurationDefaultsAssets.s3ObjectKey,
    });
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
