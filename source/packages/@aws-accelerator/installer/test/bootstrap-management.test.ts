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

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(__dirname, '../lib/bash/bootstrap-management.sh');

const ACCELERATOR_PREFIX = 'AWSAccelerator';
const HOME_REGION = 'eu-west-2';
const GLOBAL_REGION = 'us-east-1';
const PIPELINE_ACCOUNT_ID = '111111111111';
const MANAGEMENT_ACCOUNT_ID = '222222222222';

/**
 * Mock of the AWS CLI that emulates `describe-stacks` against a single CDK toolkit stack.
 *
 * The stack is considered to exist when `STACK_EXISTS` is `true`, in which case the mock honours the
 * `--query` JMESPath expression the same way the AWS CLI does with `--output text`: the stack name is
 * printed for `Stacks[0].StackName`, and the `ManagementDeploymentRoleArn` output row is printed only
 * when `STACK_HAS_MANAGEMENT_OUTPUT` is `true`, otherwise the filtered list is empty and nothing is
 * printed. A missing stack is a validation error, so the CLI exits non-zero.
 */
const MOCK_AWS = `#!/bin/bash
QUERY=""
PREVIOUS=""
for ARGUMENT in "$@"; do
  if [ "$PREVIOUS" = "--query" ]; then
    QUERY="$ARGUMENT"
  fi
  PREVIOUS="$ARGUMENT"
done
if [ "$STACK_EXISTS" != "true" ]; then
  echo "An error occurred (ValidationError) when calling the DescribeStacks operation: Stack does not exist" >&2
  exit 254
fi
case "$QUERY" in
  *ManagementDeploymentRoleArn*)
    if [ "$STACK_HAS_MANAGEMENT_OUTPUT" = "true" ]; then
      echo -e "The ARN of the management account bootstrap role\\tManagementDeploymentRoleArn\\tarn:aws:iam::${MANAGEMENT_ACCOUNT_ID}:role/${ACCELERATOR_PREFIX}-Management-Deployment-Role"
    fi
    ;;
  *)
    echo "${ACCELERATOR_PREFIX}-CDKToolkit"
    ;;
esac
exit 0
`;

/**
 * Mock of yarn that records every `cdk bootstrap` invocation, so a test can assert whether a bootstrap
 * was actually attempted instead of only inspecting the script log output.
 */
const MOCK_YARN = `#!/bin/bash
echo "$@" >> "$BOOTSTRAP_MARKER_FILE"
exit 0
`;

interface ScriptResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly bootstrappedTemplates: string[];
}

function runScript(options: {
  accountId: string;
  forceBootstrap?: string;
  stackExists?: boolean;
  stackHasManagementOutput?: boolean;
  managementAccountId?: string;
  managementAccountRoleName?: string;
}): ScriptResult {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-management-test-'));
  try {
    // The script applies the accelerator prefix to the bootstrap templates in place
    const templateDir = path.join(tempDir, 'lib', 'cloudformation');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(path.join(templateDir, 'bootstrap-management.yaml'), 'Description: AWSAccelerator home\n');
    fs.writeFileSync(
      path.join(templateDir, 'bootstrap-management-global.yaml'),
      'Description: AWSAccelerator global\n',
    );

    const mockBinDir = path.join(tempDir, 'mock-bin');
    fs.mkdirSync(mockBinDir, { recursive: true });
    fs.writeFileSync(path.join(mockBinDir, 'aws'), MOCK_AWS, { mode: 0o755 });
    fs.writeFileSync(path.join(mockBinDir, 'yarn'), MOCK_YARN, { mode: 0o755 });

    const markerFile = path.join(tempDir, 'bootstrap-invocations.log');

    const env: Record<string, string> = {
      PATH: `${mockBinDir}:${process.env['PATH']}`,
      HOME: tempDir,
      BOOTSTRAP_MARKER_FILE: markerFile,
      STACK_EXISTS: String(options.stackExists ?? true),
      STACK_HAS_MANAGEMENT_OUTPUT: String(options.stackHasManagementOutput ?? false),
    };
    if (options.managementAccountId) {
      env['MANAGEMENT_ACCOUNT_ID'] = options.managementAccountId;
    }
    if (options.managementAccountRoleName) {
      env['MANAGEMENT_ACCOUNT_ROLE_NAME'] = options.managementAccountRoleName;
    }

    let exitCode = 0;
    let stdout = '';
    try {
      stdout = execFileSync(
        'bash',
        [
          SCRIPT_PATH,
          ACCELERATOR_PREFIX,
          HOME_REGION,
          options.accountId,
          GLOBAL_REGION,
          options.forceBootstrap ?? 'false',
        ],
        { cwd: tempDir, env, encoding: 'utf-8', timeout: 30000 },
      );
    } catch (e: unknown) {
      const error = e as { status: number; stdout?: string };
      exitCode = error.status;
      stdout = error.stdout ?? '';
    }

    const invocations = fs.existsSync(markerFile) ? fs.readFileSync(markerFile, 'utf-8').trim().split('\n') : [];
    return {
      exitCode,
      stdout,
      bootstrappedTemplates: invocations.map(invocation =>
        invocation.includes('bootstrap-management-global.yaml') ? GLOBAL_REGION : HOME_REGION,
      ),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('bootstrap-management.sh', () => {
  describe('standard deployment, pipeline account is the management account', () => {
    it('should skip the home region bootstrap when the management deployment role output is present', () => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        stackExists: true,
        stackHasManagementOutput: true,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CDK Bootstrapping not required for home region');
      expect(result.bootstrappedTemplates).not.toContain(HOME_REGION);
    });

    it('should bootstrap the home region when the management deployment role output is missing', () => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        stackExists: true,
        stackHasManagementOutput: false,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CDK Bootstrapping required for home region');
      expect(result.bootstrappedTemplates).toContain(HOME_REGION);
    });
  });

  describe('external pipeline account deployment', () => {
    it('should skip the home region bootstrap for the pipeline account when only the toolkit stack exists', () => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        managementAccountId: MANAGEMENT_ACCOUNT_ID,
        managementAccountRoleName: 'AWSControlTowerExecution',
        stackExists: true,
        stackHasManagementOutput: false,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CDK Bootstrapping not required for home region');
      expect(result.bootstrappedTemplates).not.toContain(HOME_REGION);
    });

    it('should bootstrap the home region for the pipeline account when the toolkit stack does not exist', () => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        managementAccountId: MANAGEMENT_ACCOUNT_ID,
        managementAccountRoleName: 'AWSControlTowerExecution',
        stackExists: false,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CDK Bootstrapping required for home region');
      expect(result.bootstrappedTemplates).toContain(HOME_REGION);
    });

    it('should still require the management deployment role output for the management account', () => {
      const result = runScript({
        accountId: MANAGEMENT_ACCOUNT_ID,
        managementAccountId: MANAGEMENT_ACCOUNT_ID,
        managementAccountRoleName: 'AWSControlTowerExecution',
        stackExists: true,
        stackHasManagementOutput: false,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CDK Bootstrapping required for home region');
      expect(result.bootstrappedTemplates).toContain(HOME_REGION);
    });
  });

  it('should bootstrap both regions when force bootstrap is requested', () => {
    const result = runScript({
      accountId: PIPELINE_ACCOUNT_ID,
      forceBootstrap: 'true',
      stackExists: true,
      stackHasManagementOutput: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.bootstrappedTemplates).toEqual([GLOBAL_REGION, HOME_REGION]);
  });
});
