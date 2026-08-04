import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorSynthStacks } from './accelerator-synth-stacks';
import { Template } from 'aws-cdk-lib/assertions';
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
 *
 * NOTE: Create.stacks() intentionally does NOT cache. Synth output can depend on
 * process.env (for example SKIP_MACIE_MODULE in the SkipMacie snapshot tests), so a
 * parameter-keyed cache would silently serve stale templates. If your tests reuse
 * the same stack repeatedly without changing env, wrap the call in memoize() at the
 * top of your test file instead.
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

/**
 * Returns the SSM-typed CloudFormation parameters in a stack's template that resolve the given SSM
 * parameter path.
 *
 * CloudFormation resolves every `AWS::SSM::Parameter::Value` parameter in a template on create and
 * update, whether or not a resource references it, so an unresolvable one fails the whole stack.
 * Use this to assert that a stack only looks up the SSM parameters it genuinely needs.
 *
 * @param stack the stack to inspect
 * @param ssmPath the SSM parameter path to match against the parameter's Default
 * @returns the matching template parameter entries
 */
export function findSsmParameters(stack: cdk.Stack, ssmPath: string): [string, { Type?: string; Default?: string }][] {
  const parameters = Template.fromStack(stack).toJSON().Parameters ?? {};
  return Object.entries(parameters as Record<string, { Type?: string; Default?: string }>).filter(
    ([, value]) => value.Type?.startsWith('AWS::SSM::Parameter::Value') && value.Default === ssmPath,
  );
}

/**
 * Clones an object, preserving its prototype, with the given property overrides applied.
 *
 * Config objects are class instances whose getters the stacks rely on, so a spread copy is not
 * equivalent. Use this to vary a config for a single test without mutating the config shared by the
 * other tests in the file.
 *
 * @param source the object to clone
 * @param overrides the properties to replace on the clone
 * @returns a clone of source with overrides applied
 */
export function cloneWithOverrides<T extends object>(source: T, overrides: Partial<T>): T {
  return Object.create(Object.getPrototypeOf(source), {
    ...Object.getOwnPropertyDescriptors(source),
    ...Object.getOwnPropertyDescriptors(overrides),
  }) as T;
}
