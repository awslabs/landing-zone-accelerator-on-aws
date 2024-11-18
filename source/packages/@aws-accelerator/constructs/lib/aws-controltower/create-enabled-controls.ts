import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { pascalCase } from 'pascal-case';

/**
 * Interface representing the properties required to enable a Control Tower control.
 *
 * @interface EnabledControlProps
 *
 * @property ouName - The name of the organizational unit where the control will be enabled
 * @property ouArn - The Amazon Resource Name (ARN) of the organizational unit
 * @property enabledControlIdentifier - The unique identifier for the Control Tower control to be enabled
 *
 * @example
 * const props: EnabledControlProps = {
 *   ouName: 'SecurityOU',
 *   ouArn: 'arn:aws:organizations::123456789012:ou/o-abcd1234/ou-abcd-12345678',
 *   enabledControlIdentifier: 'AWS-GR_ELASTICSEARCH_IN_VPC_ONLY'
 * };
 * @link https://docs.aws.amazon.com/controltower/latest/controlreference/all-global-identifiers.html
 */
export interface EnabledControlProps {
  ouName: string;
  ouArn: string;
  enabledControlIdentifier: string;
}

/**
 * Interface defining the configuration properties for creating enabled Control Tower controls.
 *
 * @interface CreateEnabledControlProps
 *
 * @property controls - Array of EnabledControlProps containing the configuration for each control to be enabled
 * @property dependencyFrequency - Number that determines the frequency of creating dependency chains between controls
 *
 * @example
 * const props: CreateEnabledControlProps = {
 *   controls: [{
 *     ouName: 'SecurityOU',
 *     ouArn: 'arn:aws:organizations::123456789012:ou/o-abcd1234/ou-abcd-12345678',
 *     enabledControlIdentifier: 'AWS-GR_ELASTICSEARCH_IN_VPC_ONLY'
 *   }],
 *   dependencyFrequency: 3
 * };
 */

export interface CreateEnabledControlProps {
  controls: EnabledControlProps[];
  dependencyFrequency?: number;
}

/**
 * Enables Control Tower controls based on the provided configuration.
 * This class filters enabled controls, creates them, and sets up their dependencies.
 * Only optional controls are supported (both Strongly Recommended and Elective)
 * https://docs.aws.amazon.com/controltower/latest/userguide/optional-controls.html
 **/

export class CreateControlTowerEnabledControls extends Construct {
  readonly controlTowerControls: cdk.aws_controltower.CfnEnabledControl[];
  readonly dependencyFrequency: number;
  constructor(scope: Construct, id: string, props: CreateEnabledControlProps) {
    super(scope, id);
    this.controlTowerControls = this.enableControlTowerControls(props.controls);
    this.dependencyFrequency = props.dependencyFrequency ?? 2;
    this.setEnabledControlDependencies(this.controlTowerControls, this.dependencyFrequency);
  }
  /*


   * @param controlTowerConfig - The Control Tower configuration object containing control settings
   * @returns void
   * @private
   */

  private enableControlTowerControls(controls: EnabledControlProps[]) {
    return controls.map(control => {
      const enabledControlArn = `arn:${cdk.Stack.of(this).partition}:controltower:${
        cdk.Stack.of(this).region
      }::control/${control.enabledControlIdentifier}`;

      return new cdk.aws_controltower.CfnEnabledControl(
        // Scope is set to the parent stack to maintain logical IDs of already deployed resources. Do not change this value!
        cdk.Stack.of(this),
        pascalCase(`${control.enabledControlIdentifier}-${control.ouName}`),
        {
          controlIdentifier: enabledControlArn,
          targetIdentifier: control.ouArn,
        },
      );
    });
  }

  /**
   * Sets up dependencies between Control Tower enabled controls. This is needed to prevent throttling errors when cloudformation deploys the resource
   *
   * @param enabledControls - Array of Control Tower enabled controls to configure dependencies for
   * @param dependencyFrequency - Number that determines how often to create new dependency chains
   * @private
   **/

  private setEnabledControlDependencies(
    enabledControls: cdk.aws_controltower.CfnEnabledControl[],
    dependencyFrequency: number,
  ) {
    if (enabledControls.length === 0) {
      return;
    }

    if (dependencyFrequency === 0) {
      return;
    }

    let dependency: cdk.aws_controltower.CfnEnabledControl = enabledControls[0];
    for (let i = 0; i < enabledControls.length; i++) {
      if (i === 0) {
        continue;
      }
      if (i % dependencyFrequency === 0) {
        enabledControls[i].addDependency(dependency);
        dependency = enabledControls[i];
      } else {
        enabledControls[i].addDependency(dependency);
      }
    }
  }
}
