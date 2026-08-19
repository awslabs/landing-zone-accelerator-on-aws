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
import { expect, test } from 'vitest';

/**
 * aws-cdk-lib 2.262.0 auto-registers a CloudFormation Validate plugin (WASM rule
 * engine) on every app synth, which adds seconds per snapshot test. Registering our
 * own no-op CloudFormationValidatePlugin suppresses the auto-registration; snapshot
 * tests assert template shape, not policy compliance.
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
function toCloudFormation(stack: cdk.Stack): any {
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

export function snapShotTest(testNamePrefix: string, stack: cdk.Stack) {
  test(`${testNamePrefix} Snapshot Test`, () => {
    // greedy implementation: eg, because "/path/home/temp.json" matches on
    // temp.json, replace the whole string to "replaced-json-path.json".
    const greedyJsonRegex = /[a-z0-9]+.json/;

    // limited: only match length of generated zip file or UUID spec lengths.
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    const zipRegex = /[0-9a-f]{64}\.zip/;

    // test each serialized object - if any part of string matches regex
    // replace with value of print()
    expect.addSnapshotSerializer({
      test: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        val: any,
      ) => typeof val === 'string' && val.match(uuidRegex) != null,
      print: () => '"REPLACED-UUID"',
    });

    expect.addSnapshotSerializer({
      test: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        val: any,
      ) => typeof val === 'string' && val.match(zipRegex) != null,
      print: () => '"REPLACED-GENERATED-NAME.zip"',
    });

    expect.addSnapshotSerializer({
      test: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        val: any,
      ) => typeof val === 'string' && val.match(greedyJsonRegex) != null,
      print: () => '"REPLACED-JSON-PATH.json"',
    });

    expect(toCloudFormation(stack)).toMatchSnapshot();
  });
}
