import { AcceleratorStage } from '../../accelerator/lib/accelerator-stage';
import { AcceleratorModuleName, ModuleRunnerParametersType } from '../common/resources';
import { ControlTowerLandingZone } from './control-tower/index';

/**
 * ModuleRunner abstract class to execute accelerator modules.
 */
export abstract class ModuleRunner {
  /**
   * Function to execute module specific handler
   * @param runnerParams {@link ModuleRunnerParametersType}
   * @returns status string
   */
  public static async execute(runnerParams: ModuleRunnerParametersType): Promise<string> {
    switch (runnerParams.module) {
      case AcceleratorModuleName.CONTROL_TOWER:
        return await ModuleRunner.executeControlTowerLandingZoneModule(runnerParams);
      default:
        throw new Error(`Invalid module name "${runnerParams.module}".`);
    }
  }

  /**
   * Function to execute AWS Control Tower Landing Zone module
   * @param runnerParams {@link ModuleRunnerParametersType}
   * @returns status string
   */
  private static async executeControlTowerLandingZoneModule(runnerParams: ModuleRunnerParametersType): Promise<string> {
    if (runnerParams.options.stage === AcceleratorStage.PREPARE) {
      return await new ControlTowerLandingZone().handler(runnerParams.module, runnerParams.options);
    }
    throw new Error(`Invalid stage ${runnerParams.options.stage} for module ${runnerParams.module}`);
  }
}
