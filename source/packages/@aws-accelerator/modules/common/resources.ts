import { AcceleratorStage } from '../../accelerator/lib/accelerator-stage';
import { AllConfigType } from './accelerator-config-loader';
/**
 * Accelerator solution supported module names
 */
export enum AcceleratorModuleName {
  /**
   * ControlTower module
   */
  CONTROL_TOWER = 'control-tower',
}

/**
 * Accelerator Module runner parameter type
 */
export type ModuleRunnerParametersType = {
  /**
   * Name of the accelerator module.
   *
   * @see {@link AcceleratorModules}
   */
  module: string;
  /**
   * Accelerator module runner options
   *
   * @see {@link ModuleOptionsType}
   *
   */
  options: ModuleOptionsType;
};

/**
 * Accelerator module option type
 */
export type ModuleOptionsType = {
  /**
   * LandingZone Accelerator configuration directly path
   */
  configDirPath: string;
  /**
   * LandingZone Accelerator pipeline stage name
   */
  stage: string;
  /**
   * AWS partition
   *
   */
  partition: string;
  /**
   * Flag indicating existing role
   */
  readonly useExistingRole: boolean;
  /**
   * Solution Id
   */
  readonly solutionId: string;
};

type EnabledTargetEnvironmentType = { account: string; region: string };

/**
 * Function to get module's target environment
 * @param configs {@link AllConfigType}
 * @param module string
 * @param stage string
 * @returns envs {@link EnabledTargetEnvironmentType}[]
 */
export function getModuleTargetEnvironments(
  configs: AllConfigType,
  module: string,
  stage: string,
): EnabledTargetEnvironmentType[] {
  switch (module) {
    case AcceleratorModuleName.CONTROL_TOWER:
      if (stage === AcceleratorStage.PREPARE) {
        return [{ account: configs.accountsConfig.getManagementAccountId(), region: configs.globalConfig.homeRegion }];
      }
      return [];
    default:
      throw new Error(`Invalid module name ${module}`);
  }
}

export function getGlobalRegion(partition: string): string {
  let globalRegion = 'us-east-1';
  if (partition === 'aws-cn') {
    globalRegion = 'cn-northwest-1';
  }

  return globalRegion;
}
