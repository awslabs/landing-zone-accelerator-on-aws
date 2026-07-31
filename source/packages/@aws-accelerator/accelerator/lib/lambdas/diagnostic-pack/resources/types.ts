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
 * LZA supports storing the configuration in a CodeCommit repository, an S3
 * bucket, or an external repository accessed through AWS CodeConnections
 * (`configRepositoryLocation` of `codecommit`, `s3`, or `codeconnection`). For
 * `s3` and `codeconnection` the diagnostics Lambda downloads and extracts the
 * configuration zip to `localConfigDirPath` and reads the files from disk; for
 * `codeconnection` the zip is sourced from the pipeline artifact bucket.
 */
export type ConfigSourceType = {
  /**
   * Home region of the accelerator deployment.
   */
  homeRegion: string;
  /**
   * Location of the LZA configuration files: `codecommit`, `s3`, or `codeconnection`.
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
   * LZA pipeline name (used to resolve the configuration location when location is `codeconnection`).
   */
  pipelineName?: string;
  /**
   * Local directory the configuration zip has been extracted to (set when location is `s3` or `codeconnection`).
   */
  localConfigDirPath?: string;
  /**
   * Human-readable reason the configuration could not be prepared.
   */
  configUnavailableReason?: string;
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
