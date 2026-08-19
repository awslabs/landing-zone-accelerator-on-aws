/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
import * as cdk from 'aws-cdk-lib';

/**
 * aws-cdk-lib 2.262.0 auto-registers a CloudFormation Validate plugin (WASM rule
 * engine) on every app synth, which adds seconds per snapshot test. The framework
 * only adds its built-in validator when no CloudFormationValidatePlugin instance is
 * already registered on the App, so registering this no-op subclass replaces it
 * entirely rather than running alongside it; snapshot tests assert template shape,
 * not policy compliance. That skip-if-registered behavior is framework internals,
 * so synth-utils.test.ts carries a canary test that fails if an aws-cdk-lib
 * upgrade starts running the built-in validator again.
 */
class NoopCfnValidatePlugin extends cdk.CloudFormationValidatePlugin {
  override validate(): cdk.PolicyValidationPluginReport {
    return { success: true, violations: [] };
  }
}

const appsWithNoopValidation = new WeakSet<cdk.App>();

function suppressCfnValidation(stack: cdk.Stack): void {
  const root = stack.node.root;
  if (cdk.App.isApp(root) && !appsWithNoopValidation.has(root)) {
    cdk.Validations.of(root).addPlugins(new NoopCfnValidatePlugin());
    appsWithNoopValidation.add(root);
  }
}

/**
 * Replacement for the deprecated SynthUtils.toCloudFormation. Force-synthesizes so
 * mutations made after an earlier synth are applied, and strips the CDK
 * bootstrap-version parameter and rule the same way SynthUtils did so existing
 * snapshots stay unchanged.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toCloudFormation(stack: cdk.Stack): any {
  const root = stack.node.root;
  if (!cdk.Stage.isStage(root)) {
    throw new Error('unexpected: all stacks must be part of a Stage or an App');
  }
  suppressCfnValidation(stack);
  const assembly = root.synth({ force: true });
  const template = assembly.getStackArtifact(stack.artifactId).template;
  delete template.Rules?.CheckBootstrapVersion;
  if (Object.keys(template.Rules ?? {}).length === 0) {
    delete template.Rules;
  }
  delete template.Parameters?.BootstrapVersion;
  if (Object.keys(template.Parameters ?? {}).length === 0) {
    delete template.Parameters;
  }
  return template;
}
