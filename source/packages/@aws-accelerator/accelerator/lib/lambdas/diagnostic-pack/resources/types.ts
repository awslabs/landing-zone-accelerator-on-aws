export type InstallerStackMetadataType = {
  lzaVersion: string;
  isExternal: boolean;
  prefix: string;
  releaseBranch: string;
  qualifier?: string;
  managementAccountId?: string;
};

export type LzaGlobalConfigType = { homeRegion: string; enabledRegions: string[] };

/**
 * Describes where the LZA configuration files are sourced from.
 *
 * LZA supports storing the configuration in a CodeCommit repository or in an S3
 * bucket (`configRepositoryLocation` of `codecommit` or `s3`). When the
 * configuration is in S3, the diagnostics Lambda downloads and extracts the
 * configuration zip from S3 to `localConfigDirPath` and reads the files from
 * disk.
 *
 * Note: the `codeconnection` location is not yet supported here (its
 * configuration lives in the pipeline artifact bucket, not the config bucket).
 */
export type ConfigSourceType = {
  /**
   * Home region of the accelerator deployment.
   */
  homeRegion: string;
  /**
   * Location of the LZA configuration files: `codecommit` or `s3`.
   */
  configRepositoryLocation: string;
  /**
   * CodeCommit configuration repository name (used when location is `codecommit`).
   */
  repositoryName: string;
  /**
   * S3 bucket that holds the configuration zip (used when location is `s3`).
   */
  configBucketName?: string;
  /**
   * Local directory the S3 configuration zip has been extracted to (set when location is `s3`).
   */
  localConfigDirPath?: string;
};

export type LzaAccountsConfigType = {
  mandatoryAccounts: { name: string; organizationalUnit: string; email: string }[];
  workloadAccounts: { name: string; organizationalUnit: string; email: string }[];
};

export type LzaStackEnvironmentType = { name: string; accountId: string; region: string };

export type DiagnosticAccountsConfigType = {
  name: string;
  id: string;
  organizationalUnit: string;
};

export type PipelineDetailStatusType = {
  stageName: string;
  stageLastExecutionStatus: string;
  actionName: string;
  actionLastExecutionTime: Date | string;
  actionLastExecutionStatus: string;
  buildErrorMessages: string | undefined;
};

export type PipelineStatusType = {
  status?: string;
  detailStatus: PipelineDetailStatusType[];
};

export type AccountDetailsType = {
  accountName: string;
  accountEmail: string;
  accountId: string;
};
