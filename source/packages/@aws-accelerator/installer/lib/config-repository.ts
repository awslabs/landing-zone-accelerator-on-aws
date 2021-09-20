import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';
import * as s3_assets from '@aws-cdk/aws-s3-assets';
import * as cdk from '@aws-cdk/core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as config from '@aws-accelerator/config';

export interface ConfigRepositoryProps {
  readonly repositoryName: string;
  readonly repositoryBranchName?: string;
  readonly description?: string;
}

/**
 * Class to create AWS accelerator configuration repository and initialize the repository with default configuration
 */
export class ConfigRepository extends cdk.Construct {
  readonly configRepo: cdk_extensions.Repository;

  constructor(scope: cdk.Construct, id: string, props: ConfigRepositoryProps) {
    super(scope, id);

    //
    // Generate default configuration files
    //
    const tempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'config-assets-'));

    fs.writeFileSync(
      path.join(tempDirPath, config.ORGANIZATION_CONFIG_FILE),
      JSON.stringify(new config.OrganizationConfig()),
      'utf8',
    );

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
