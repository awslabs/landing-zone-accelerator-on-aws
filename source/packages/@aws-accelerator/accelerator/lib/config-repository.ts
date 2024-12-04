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

import {
  AccountsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
  Region,
  ControlTowerLandingZoneConfig,
} from '@aws-accelerator/config';
import { Bucket, BucketEncryptionType } from '@aws-accelerator/constructs';
import { NagSuppressions } from 'cdk-nag';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';
import * as cdk from 'aws-cdk-lib';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';

export interface ConfigRepositoryProps {
  readonly description?: string;
  readonly managementAccountEmail: string;
  readonly logArchiveAccountEmail: string;
  readonly auditAccountEmail: string;
  readonly controlTowerEnabled: string;
  readonly enableSingleAccountMode: boolean;
  /**
   * AWS Control Tower Landing Zone configuration
   */
  readonly controlTowerLandingZoneConfig?: ControlTowerLandingZoneConfig;
}

export interface CodeCommitConfigRepositoryProps extends ConfigRepositoryProps {
  readonly repositoryName: string;
  readonly repositoryBranchName?: string;
}
export interface S3ConfigRepositoryProps extends ConfigRepositoryProps {
  readonly configBucketName: string;
  readonly installerKey: cdk.aws_kms.Key;
  readonly serverAccessLogsBucketName: string;
  readonly autoDeleteObjects?: boolean;
}

/**
 * Class to create AWS accelerator configuration repository and initialize the repository with default configuration
 */
export class ConfigRepository extends Construct {
  readonly tempDirPath: string;
  constructor(scope: Construct, id: string, props: ConfigRepositoryProps) {
    super(scope, id);

    //
    // Generate default configuration files
    //
    this.tempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'config-assets-'));

    let controlTowerEnabledValue = true;
    let managementAccountAccessRole = 'AWSControlTowerExecution';
    if (props.controlTowerEnabled.toLowerCase() === 'no') {
      controlTowerEnabledValue = false;
      managementAccountAccessRole = 'OrganizationAccountAccessRole';
    }

    fs.writeFileSync(
      path.join(this.tempDirPath, GlobalConfig.FILENAME),
      yaml.dump(
        new GlobalConfig({
          homeRegion: cdk.Stack.of(this).region as Region,
          controlTower: { enable: controlTowerEnabledValue, landingZone: props.controlTowerLandingZoneConfig },
          managementAccountAccessRole: managementAccountAccessRole,
        }),
      ),
      'utf8',
    );

    fs.writeFileSync(
      path.join(this.tempDirPath, AccountsConfig.FILENAME),
      yaml.dump(
        new AccountsConfig({
          managementAccountEmail: props.managementAccountEmail,
          logArchiveAccountEmail: props.logArchiveAccountEmail,
          auditAccountEmail: props.auditAccountEmail,
        }),
      ),
      'utf8',
    );

    fs.writeFileSync(path.join(this.tempDirPath, IamConfig.FILENAME), yaml.dump(new IamConfig()), 'utf8');
    fs.writeFileSync(path.join(this.tempDirPath, NetworkConfig.FILENAME), yaml.dump(new NetworkConfig()), 'utf8');
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
        chatbotPolicies: [],
        backupPolicies: [],
      });
      fs.writeFileSync(path.join(this.tempDirPath, OrganizationConfig.FILENAME), yaml.dump(orgConfig), 'utf8');
    } else {
      fs.writeFileSync(
        path.join(this.tempDirPath, OrganizationConfig.FILENAME),
        yaml.dump(new OrganizationConfig()),
        'utf8',
      );
    }

    fs.writeFileSync(path.join(this.tempDirPath, SecurityConfig.FILENAME), yaml.dump(new SecurityConfig()), 'utf8');
  }
}

export class CodeCommitConfigRepository extends ConfigRepository {
  readonly configRepo: cdk_extensions.Repository;
  readonly s3AssetBucket: cdk.aws_s3_assets.Asset;
  constructor(scope: Construct, id: string, props: CodeCommitConfigRepositoryProps) {
    super(scope, id, props);

    this.s3AssetBucket = new s3_assets.Asset(this, 'ConfigurationDefaultsAssets', {
      path: this.tempDirPath,
    });
    this.configRepo = new cdk_extensions.Repository(this, 'Resource', {
      repositoryName: props.repositoryName,
      repositoryBranchName: props.repositoryBranchName!,
      s3BucketName: this.s3AssetBucket.bucket.bucketName,
      s3key: this.s3AssetBucket.s3ObjectKey,
    });
  }
  /**
   * Method to get initialized CodeCommit repository object
   * @return Returns Initialized CodeCommit repository object.
   */
  public getRepository(): cdk_extensions.Repository {
    return this.configRepo;
  }
}

export class S3ConfigRepository extends ConfigRepository {
  readonly configRepo: Bucket;
  constructor(scope: Construct, id: string, props: S3ConfigRepositoryProps) {
    super(scope, id, props);

    this.configRepo = new Bucket(this, 'SecureBucket', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: props.configBucketName,
      kmsKey: props.installerKey,
      serverAccessLogsBucketName: props.serverAccessLogsBucketName,
      autoDeleteObjects: props.autoDeleteObjects,
      s3LifeCycleRules: [],
    });

    this.getZippedConfigFiles();

    /**
     * The default LZA configuration must first be uploaded to a separate path in the bucket.
     * This lowers the risk of overwriting customer configuration zip files when the default LZA config files change
     *
     * https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3_deployment-readme.html#notes
     *   If you are using s3deploy.Source.bucket() to take the file source from another bucket: the deployed files will only be updated if the key (file name) of the file in the source bucket changes. Mutating the file in place will not be good enough: the custom resource will simply not run if the properties don't change.
     *   If you use assets (s3deploy.Source.asset()) you don't need to worry about this: the asset system will make sure that if the files have changed, the file name is unique and the deployment will run.
     */
    const defaultDeployment = new cdk.aws_s3_deployment.BucketDeployment(this, 'UploadDefaultZipFileToS3', {
      sources: [cdk.aws_s3_deployment.Source.asset(`${this.tempDirPath}/zipped`)],
      destinationBucket: this.configRepo.getS3Bucket(),
      destinationKeyPrefix: 'default',
      prune: false,
    });

    /**
     * CAUTION: This BucketDeployment controls the creation of LZA config files in S3.
     * Modification of this resource has the potential to overwrite existing customer LZA configurations.
     * Please see the following page for more information:
     * https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3_deployment.BucketDeployment.html
     *
     * Copy default config to /zipped prefix to use as CodePipeline source
     * */
    const s3CopyDeployment = new cdk.aws_s3_deployment.BucketDeployment(this, 'CopyDefaultZipToTarget', {
      sources: [
        cdk.aws_s3_deployment.Source.bucket(this.configRepo.getS3Bucket(), 'default/aws-accelerator-config.zip'),
      ],
      destinationBucket: this.configRepo.getS3Bucket(),
      destinationKeyPrefix: 'zipped',
      extract: false,
      prune: false,
    });
    s3CopyDeployment.node.addDependency(defaultDeployment);

    const cdkBucketDeploymentIds = [];
    for (const child of cdk.Stack.of(this).node.children) {
      if (child.node.id.startsWith('Custom::CDKBucketDeployment')) {
        cdkBucketDeploymentIds.push(child.node.id);
      }
    }

    for (const cdkBucketDeploymentId of cdkBucketDeploymentIds) {
      NagSuppressions.addResourceSuppressionsByPath(
        cdk.Stack.of(this),
        `${cdk.Stack.of(this).stackName}/${cdkBucketDeploymentId}/ServiceRole/Resource`,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'CDK construct auto-generated role.',
          },
        ],
      );
    }
  }

  /**
   * Method to create a zip file of LZA config files
   *
   * @return Returns the path to the zip file
   */
  public getZippedConfigFiles(): string {
    const configZipFilePath = `${this.tempDirPath}/zipped/aws-accelerator-config.zip`;
    const admZip = new AdmZip();

    const files = fs.readdirSync(this.tempDirPath);
    // Add files to the zip archive
    for (const file of files) {
      const filePath = path.join(this.tempDirPath, file);
      const fileData = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      admZip.addFile(fileName, fileData);
    }

    // Write the zip file to disk
    admZip.writeZip(configZipFilePath);
    return configZipFilePath;
  }

  /**
   * Method to get initialized S3 repository object
   *
   * @return Returns Initialized S3 repository object.
   */
  public getRepository(): cdk.aws_s3.IBucket {
    return this.configRepo.getS3Bucket();
  }
}
