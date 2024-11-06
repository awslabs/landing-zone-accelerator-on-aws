import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorSynthStacks } from './accelerator-synth-stacks';
import * as cdk from 'aws-cdk-lib';

/**
 * Memoizes a function without parameter. Returns a new function that
 * will call the original function on the first invocation. Subsequent
 * invocations will return the same result.
 */
export function memoize<TResult>(fn: () => TResult) {
  let ran = false;
  let result: TResult;
  return (): TResult => {
    if (!ran) {
      result = fn();
      ran = true;
    }
    return result;
  };
}

/**
 * An object that holds the parameters for the AcceleratorSynthStacks object.
 * Only stage is required, the other parameters are optional.
 */
export type CreateStacksPropsObject = {
  stage: AcceleratorStage;
  partition?: string;
  globalRegion?: string;
  configFolderName?: string;
};

/**
 * Type that represents the AcceleratorSynthStacks constructor parameters.
 * Only stage is required, the other parameters are optional
 * [AcceleratorStage, partition, globalRegion, configFolderName]
 */
export type CreateStacksPropsArray = [AcceleratorStage, string?, string?, string?];

/**
 * We want to allow different ways of passing in the AcceleratorSynthStacks constructor
 * properties. At least an accelerator stage is required. For the other values sane defaults
 * are used.
 *
 * Usage:
 * Create.stacks(AcceleratorStage.CUSTOMIZATIONS);
 *
 * Create.stacks({stage: AcceleratorStage.Cusomizations, configFolderName: 'all-enabled'})
 *
 * Create.stacks([AcceleratorStage.CUSTOMIZATIONS, 'aws', 'eu-west-1'])
 *
 */
export type CreateStacksProps = CreateStacksPropsObject | CreateStacksPropsArray | AcceleratorStage;

const isPropsObject = (value: unknown): value is CreateStacksPropsObject =>
  typeof value === 'object' && !!(value as CreateStacksPropsObject).stage;

/**
 * Takes in an object of type CreateStackProps and converts it to a ConvertStackPropsObject.
 */
const parseProps = (props: CreateStacksProps): CreateStacksPropsObject => {
  if (Array.isArray(props)) {
    return {
      stage: props[0],
      partition: props[1],
      globalRegion: props[2],
      configFolderName: props[3],
    };
  } else if (isPropsObject(props)) {
    return props;
  }
  return {
    stage: props,
  };
};

/**
 * Helper class for creating AcceleratorSynthStacks and creating providers for tests.
 */
export class Create {
  /**
   * Creates an AcceleratorSynthStacks object.
   * Usage:
   * Create.stacks(AcceleratorStage.CUSTOMIZATIONS);
   *
   * Create.stacks({stage: AcceleratorStage.Cusomizations, configFolderName: 'all-enabled'})
   *
   * Create.stacks([AcceleratorStage.CUSTOMIZATIONS, 'aws', 'eu-west-1'])
   */
  static stacks(props: CreateStacksProps) {
    const { stage, partition = 'aws', globalRegion = 'us-east-1', configFolderName } = parseProps(props);
    return new AcceleratorSynthStacks(stage, partition, globalRegion, configFolderName);
  }

  /**
   * Creates a provider for AcceleratorSynthStacks. The provider is a function
   * that creates and returns the stacks when called.
   */
  static stacksProvider(props: CreateStacksProps): () => AcceleratorSynthStacks {
    return () => Create.stacks(props);
  }

  /**
   * Creates an AcceleratorSynthStacks object and selects one of the stacks from the dictionary.
   * @param stackName The name of the stack to be selected.
   * @param props The props for the AcceleratorSynthStacks
   * @returns
   */
  static stack(stackName: string, props: CreateStacksProps) {
    return Create.stacks(props).stacks.get(stackName);
  }

  /**
   * Creates a provider for a specific stack of an AcceleratorSynthStacks object.
   * The provider is a function that creates the stacks and selects the specific stack
   * when  called.
   * @param stackName The name of the stack to be selected.
   * @param props The props for the AcceleratorSynthStacks
   * @returns
   */
  static stackProvider(stackName: string, props: CreateStacksProps) {
    return () => Create.stack(stackName, props);
  }

  /**
   * Creates a provider for a specific stack based on a stacks provider.
   */
  static stackProviderFromStacks(
    stackName: string,
    stacksProvider: () => AcceleratorSynthStacks,
  ): () => cdk.Stack | undefined {
    return () => stacksProvider().stacks.get(stackName);
  }
}
