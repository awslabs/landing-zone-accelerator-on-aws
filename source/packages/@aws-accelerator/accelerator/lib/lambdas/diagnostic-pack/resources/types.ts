export type InstallerStackMetadataType = {
  lzaVersion: string;
  isExternal: boolean;
  prefix: string;
  releaseBranch: string;
  qualifier?: string;
  managementAccountId?: string;
};

export type LzaGlobalConfigType = { homeRegion: string; enabledRegions: string[] };

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
