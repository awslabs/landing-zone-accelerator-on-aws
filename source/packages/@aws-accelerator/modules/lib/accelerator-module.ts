import { ModuleOptionsType } from '../common/resources';
/**
 * Accelerator Module interface
 */
export interface AcceleratorModule {
  /**
   * Handler function to manage Accelerator Modules
   *
   * @param module string
   * @param props {@link ModuleOptionsType}
   * @returns status string
   *
   */
  handler(module: string, props: ModuleOptionsType): Promise<string>;
}
