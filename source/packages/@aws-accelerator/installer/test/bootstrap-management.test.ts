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
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(__dirname, '../lib/bash/bootstrap-management.sh');
const GLOBAL_TEMPLATE_PATH = path.resolve(__dirname, '../lib/cloudformation/bootstrap-management-global.yaml');
const CFN_RETENTION_OUTPUT_KEY = 'CfnRetentionReadAccess';

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
 *
 * The global region check queries for the `CfnRetentionReadAccess` and `BucketNameOutput` outputs as
 * `[OutputKey,OutputValue]` rows; the mock prints a tab-separated row for each `Key=Value` entry listed in
 * `GLOBAL_STACK_OUTPUTS`. `organizations describe-organization` fails with `ORGANIZATIONS_ERROR` when it is set,
 * otherwise prints `ORGANIZATION_ID`, or fails with AWSOrganizationsNotInUseException when that is unset, as it does
 * for an account outside an organization.
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
if [ "$1" = "organizations" ]; then
  if [ -n "$ORGANIZATIONS_ERROR" ]; then
    echo "An error occurred ($ORGANIZATIONS_ERROR) when calling the DescribeOrganization operation" >&2
    exit 254
  fi
  if [ -z "$ORGANIZATION_ID" ]; then
    echo "An error occurred (AWSOrganizationsNotInUseException) when calling the DescribeOrganization operation" >&2
    exit 254
  fi
  echo "$ORGANIZATION_ID"
  exit 0
fi
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
  *CfnRetentionReadAccess*)
    for OUTPUT in $GLOBAL_STACK_OUTPUTS; do
      echo -e "\${OUTPUT%%=*}\\t\${OUTPUT#*=}"
    done
    ;;
  *)
    echo "${ACCELERATOR_PREFIX}-CDKToolkit"
    ;;
esac
exit 0
`;

/**
 * Mock of yarn that records every `cdk bootstrap` invocation, so a test can assert whether a bootstrap
 * was actually attempted instead of only inspecting the script log output. The global template is captured
 * as it is at bootstrap time, so a test can assert on the organization ID substituted into it.
 */
const MOCK_YARN = `#!/bin/bash
echo "$@" >> "$BOOTSTRAP_MARKER_FILE"
if [[ "$*" == *bootstrap-management-global.yaml* ]]; then
  cp lib/cloudformation/bootstrap-management-global.yaml "$GLOBAL_TEMPLATE_CAPTURE_FILE"
fi
exit 0
`;

interface ScriptResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly bootstrappedTemplates: string[];
  readonly globalTemplate?: string;
}

function runScript(options: {
  accountId: string;
  forceBootstrap?: string;
  stackExists?: boolean;
  stackHasManagementOutput?: boolean;
  managementAccountId?: string;
  managementAccountRoleName?: string;
  /** `Key=Value` entries for the global region stack outputs */
  globalStackOutputs?: string[];
  organizationId?: string;
  /** Error code `organizations describe-organization` fails with, instead of returning the organization */
  organizationsError?: string;
  globalRegion?: string;
}): ScriptResult {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-management-test-'));
  try {
    // The script applies the accelerator prefix and organization ID to the bootstrap templates in place. The real
    // global template is used so the substituted template the tests inspect is the one that is deployed.
    const templateDir = path.join(tempDir, 'lib', 'cloudformation');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(path.join(templateDir, 'bootstrap-management.yaml'), 'Description: AWSAccelerator home\n');
    fs.copyFileSync(GLOBAL_TEMPLATE_PATH, path.join(templateDir, 'bootstrap-management-global.yaml'));

    const mockBinDir = path.join(tempDir, 'mock-bin');
    fs.mkdirSync(mockBinDir, { recursive: true });
    fs.writeFileSync(path.join(mockBinDir, 'aws'), MOCK_AWS, { mode: 0o755 });
    fs.writeFileSync(path.join(mockBinDir, 'yarn'), MOCK_YARN, { mode: 0o755 });

    const markerFile = path.join(tempDir, 'bootstrap-invocations.log');
    const globalTemplateCaptureFile = path.join(tempDir, 'global-template-capture.yaml');

    const env: Record<string, string> = {
      PATH: `${mockBinDir}:${process.env['PATH']}`,
      HOME: tempDir,
      BOOTSTRAP_MARKER_FILE: markerFile,
      STACK_EXISTS: String(options.stackExists ?? true),
      STACK_HAS_MANAGEMENT_OUTPUT: String(options.stackHasManagementOutput ?? false),
      GLOBAL_STACK_OUTPUTS: (options.globalStackOutputs ?? []).join(' '),
      GLOBAL_TEMPLATE_CAPTURE_FILE: globalTemplateCaptureFile,
    };
    if (options.organizationId) {
      env['ORGANIZATION_ID'] = options.organizationId;
    }
    if (options.organizationsError) {
      env['ORGANIZATIONS_ERROR'] = options.organizationsError;
    }
    if (options.managementAccountId) {
      env['MANAGEMENT_ACCOUNT_ID'] = options.managementAccountId;
    }
    if (options.managementAccountRoleName) {
      env['MANAGEMENT_ACCOUNT_ROLE_NAME'] = options.managementAccountRoleName;
    }

    let exitCode = 0;
    let stdout = '';
    let stderr = '';
    try {
      stdout = execFileSync(
        'bash',
        [
          SCRIPT_PATH,
          ACCELERATOR_PREFIX,
          HOME_REGION,
          options.accountId,
          options.globalRegion ?? GLOBAL_REGION,
          options.forceBootstrap ?? 'false',
        ],
        { cwd: tempDir, env, encoding: 'utf-8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (e: unknown) {
      const error = e as { status: number; stdout?: string; stderr?: string };
      exitCode = error.status;
      stdout = error.stdout ?? '';
      stderr = error.stderr ?? '';
    }

    const invocations = fs.existsSync(markerFile) ? fs.readFileSync(markerFile, 'utf-8').trim().split('\n') : [];
    return {
      exitCode,
      stdout,
      stderr,
      bootstrappedTemplates: invocations.map(invocation =>
        invocation.includes('bootstrap-management-global.yaml') ? GLOBAL_REGION : HOME_REGION,
      ),
      globalTemplate: fs.existsSync(globalTemplateCaptureFile)
        ? fs.readFileSync(globalTemplateCaptureFile, 'utf-8')
        : undefined,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

type TemplateNode = unknown;

interface PolicyStatement {
  readonly Sid: string;
  readonly Effect: string;
  readonly Principal: { AWS: string };
  readonly Action: string | string[];
  readonly Resource: unknown;
  readonly Condition: Record<string, Record<string, unknown>>;
}

/**
 * Evaluates the condition functions used by the global template. Any other function throws, so a template change
 * that introduces one fails the test instead of being silently treated as true or false.
 */
function evaluateCondition(node: TemplateNode, conditions: Record<string, TemplateNode>): boolean {
  const expression = node as Record<string, TemplateNode[]>;
  if (expression['Fn::Not']) {
    return !evaluateCondition(expression['Fn::Not'][0], conditions);
  }
  if (expression['Fn::Equals']) {
    const [left, right] = expression['Fn::Equals'];
    return left === right;
  }
  if (typeof (node as { Condition?: string }).Condition === 'string') {
    return evaluateCondition(conditions[(node as { Condition: string }).Condition], conditions);
  }
  throw new Error(`Unsupported condition expression: ${JSON.stringify(node)}`);
}

/**
 * Resolves a top-level Fn::If against the template conditions. Any other node is returned unchanged.
 */
function resolveFnIf(node: TemplateNode, conditions: Record<string, TemplateNode>): TemplateNode {
  const fnIf = (node as { 'Fn::If'?: [string, TemplateNode, TemplateNode] })['Fn::If'];
  if (!fnIf) {
    return node;
  }
  const [conditionName, whenTrue, whenFalse] = fnIf;
  if (!(conditionName in conditions)) {
    throw new Error(`Fn::If references unknown condition "${conditionName}"`);
  }
  return evaluateCondition(conditions[conditionName], conditions) ? whenTrue : whenFalse;
}

interface GlobalTemplate {
  readonly Conditions: Record<string, TemplateNode>;
  readonly Resources: { StagingBucketPolicy: { Properties: { PolicyDocument: { Statement: TemplateNode[] } } } };
  readonly Outputs: Record<string, { Value: TemplateNode }>;
}

/**
 * Returns the StagingBucketPolicy statements as CloudFormation would deploy them, with each Fn::If resolved against
 * the template conditions and AWS::NoValue entries removed.
 */
function getDeployedStagingBucketPolicyStatements(template: string): PolicyStatement[] {
  const document = yaml.load(template) as GlobalTemplate;
  return document.Resources.StagingBucketPolicy.Properties.PolicyDocument.Statement.map(statement =>
    resolveFnIf(statement, document.Conditions),
  ).filter(statement => (statement as { Ref?: string }).Ref !== 'AWS::NoValue') as PolicyStatement[];
}

/**
 * Returns the template output values as CloudFormation would deploy them, with each Fn::If resolved against the
 * template conditions.
 */
function getDeployedOutputValues(template: string): Record<string, TemplateNode> {
  const document = yaml.load(template) as GlobalTemplate;
  return Object.fromEntries(
    Object.entries(document.Outputs).map(([key, output]) => [key, resolveFnIf(output.Value, document.Conditions)]),
  );
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

  describe('global region cfn-retention read grant', () => {
    it('should re-bootstrap an existing global region stack that predates the grant', () => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        stackExists: true,
        stackHasManagementOutput: true,
        globalStackOutputs: [],
        organizationId: 'o-abc123',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CDK Bootstrapping required for global region');
      expect(result.bootstrappedTemplates).toEqual([GLOBAL_REGION]);
    });

    it('should skip the global region bootstrap when the stack already carries the grant', () => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        stackExists: true,
        stackHasManagementOutput: true,
        globalStackOutputs: [`${CFN_RETENTION_OUTPUT_KEY}=o-abc123`],
        organizationId: 'o-abc123',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CDK Bootstrapping not required for global region');
      expect(result.bootstrappedTemplates).toEqual([]);
    });

    it('should not overwrite an accelerator bootstrap stack in an enabled global region', () => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        stackExists: true,
        stackHasManagementOutput: true,
        globalStackOutputs: [`BucketNameOutput=cdk-accel-assets-${PIPELINE_ACCOUNT_ID}-${GLOBAL_REGION}`],
        organizationId: 'o-abc123',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CDK Bootstrapping not required for global region');
      expect(result.bootstrappedTemplates).toEqual([]);
    });

    it('should skip the global region bootstrap outside an organization when the stack has no grant', () => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        stackExists: true,
        stackHasManagementOutput: true,
        globalStackOutputs: [`${CFN_RETENTION_OUTPUT_KEY}=none`],
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CDK Bootstrapping not required for global region');
      expect(result.bootstrappedTemplates).toEqual([]);
    });

    it.each([
      ['was deployed without the grant', 'none'],
      ['grants a different organization', 'o-other99'],
    ])('should re-bootstrap a global region stack whose grant %s', (_, deployedReadAccess) => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        stackExists: true,
        stackHasManagementOutput: true,
        globalStackOutputs: [`${CFN_RETENTION_OUTPUT_KEY}=${deployedReadAccess}`],
        organizationId: 'o-abc123',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CDK Bootstrapping required for global region');
      expect(result.bootstrappedTemplates).toEqual([GLOBAL_REGION]);
      expect(getDeployedStagingBucketPolicyStatements(result.globalTemplate!).map(statement => statement.Sid)).toEqual([
        'cfn-retention-read-access',
        'deny-insecure-connections',
      ]);
    });

    // Only AWSOrganizationsNotInUseException means the account is not in an organization. Any other failure must stop
    // the script rather than deploy the global stack without the grant, both when deciding whether an existing stack
    // needs a re-bootstrap and when bootstrapping a missing stack.
    describe.each(['AccessDeniedException', 'TooManyRequestsException', 'ServiceException'])(
      'when describe-organization fails with %s',
      organizationsError => {
        it('should fail without bootstrapping when checking an existing global region stack', () => {
          const result = runScript({
            accountId: PIPELINE_ACCOUNT_ID,
            stackExists: true,
            stackHasManagementOutput: true,
            globalStackOutputs: [`${CFN_RETENTION_OUTPUT_KEY}=o-abc123`],
            organizationsError,
          });

          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain(`Failed to determine the organization ID`);
          expect(result.stderr).toContain(organizationsError);
          expect(result.bootstrappedTemplates).toEqual([]);
        });

        it('should fail without bootstrapping when the global region stack does not exist', () => {
          const result = runScript({
            accountId: PIPELINE_ACCOUNT_ID,
            stackExists: false,
            organizationsError,
          });

          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain(organizationsError);
          expect(result.bootstrappedTemplates).toEqual([]);
          expect(result.globalTemplate).toBeUndefined();
        });
      },
    );

    it('should only check stack existence when the global region is the home region', () => {
      // The home and global stacks are the same stack here; it carries neither global output and
      // must not be overwritten with the global template.
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        globalRegion: HOME_REGION,
        stackExists: true,
        stackHasManagementOutput: true,
        globalStackOutputs: [],
        organizationId: 'o-abc123',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CDK Bootstrapping not required for global region');
      expect(result.bootstrappedTemplates).toEqual([]);
    });

    it('should substitute the organization ID into the global template', () => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        stackExists: false,
        organizationId: 'o-abc123',
      });

      expect(result.exitCode).toBe(0);
      expect(result.globalTemplate).toBeDefined();
      expect(result.globalTemplate).not.toContain('__ORGANIZATION_ID__');
    });

    it('should scope the cross-account grant to the organization and the accelerator roles', () => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        stackExists: false,
        organizationId: 'o-abc123',
      });

      expect(result.exitCode).toBe(0);
      const statements = getDeployedStagingBucketPolicyStatements(result.globalTemplate!);
      expect(statements.map(statement => statement.Sid)).toEqual([
        'cfn-retention-read-access',
        'deny-insecure-connections',
      ]);

      const grant = statements.find(statement => statement.Sid === 'cfn-retention-read-access')!;
      expect(grant.Effect).toBe('Allow');
      expect(grant.Principal).toEqual({ AWS: '*' });
      // Cross-account principals only fetch staged templates, so the grant must stay read-only on objects: no write,
      // delete, or bucket-level (policy, ACL) actions
      expect(grant.Action).toEqual(['s3:GetObject', 's3:GetObjectVersion']);
      expect(grant.Resource).toEqual([{ 'Fn::Sub': '${StagingBucket.Arn}/*' }]);
      // The wildcard principal is bounded only by these conditions, so the full set is asserted exactly
      expect(grant.Condition).toEqual({
        StringEquals: { 'aws:PrincipalOrgID': 'o-abc123' },
        ArnLike: {
          'aws:PrincipalARN': [
            { 'Fn::Sub': 'arn:${AWS::Partition}:iam::*:role/cdk-${Qualifier}*' },
            { 'Fn::Sub': 'arn:${AWS::Partition}:iam::*:role/OrganizationAccountAccessRole' },
            // CloudFormation in each target account fetches templates with the managementAccountAccessRole, which is
            // AWSControlTowerExecution in Control Tower organizations
            { 'Fn::Sub': 'arn:${AWS::Partition}:iam::*:role/AWSControlTowerExecution' },
            { 'Fn::Sub': `arn:\${AWS::Partition}:iam::*:role/${ACCELERATOR_PREFIX}-Deployment-Role` },
            { 'Fn::Sub': `arn:\${AWS::Partition}:iam::*:role/${ACCELERATOR_PREFIX}-Management-Deployment-Role` },
          ],
        },
      });
    });

    it('should omit the cross-account grant outside an organization', () => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        stackExists: false,
      });

      expect(result.exitCode).toBe(0);
      expect(result.globalTemplate).not.toContain('__ORGANIZATION_ID__');
      const statements = getDeployedStagingBucketPolicyStatements(result.globalTemplate!);
      expect(statements.map(statement => statement.Sid)).toEqual(['deny-insecure-connections']);
    });

    it.each([
      ['inside an organization', 'o-abc123'],
      ['outside an organization', undefined],
    ])('should deny insecure transport for both bucket and object operations %s', (_, organizationId) => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        stackExists: false,
        organizationId,
      });

      expect(result.exitCode).toBe(0);
      const statements = getDeployedStagingBucketPolicyStatements(result.globalTemplate!);
      const deny = statements.find(statement => statement.Sid === 'deny-insecure-connections');
      expect(deny).toEqual({
        Sid: 'deny-insecure-connections',
        Effect: 'Deny',
        Principal: { AWS: '*' },
        Action: 's3:*',
        Resource: [{ 'Fn::Sub': '${StagingBucket.Arn}' }, { 'Fn::Sub': '${StagingBucket.Arn}/*' }],
        Condition: { Bool: { 'aws:SecureTransport': 'false' } },
      });
    });

    // The script's skip decision and the mocked GLOBAL_STACK_OUTPUTS both depend on this output key, so the template
    // and the script query are pinned to the same key. A rename on either side would otherwise re-bootstrap the
    // global region on every run while the mocked tests still pass.
    it('should query the global stack for the output key the template emits', () => {
      const script = fs.readFileSync(SCRIPT_PATH, 'utf-8');
      expect(script).toContain(`OutputKey==\`${CFN_RETENTION_OUTPUT_KEY}\``);
    });

    it.each([
      ['inside an organization', 'o-abc123', 'o-abc123'],
      ['outside an organization', undefined, 'none'],
    ])('should emit the cfn-retention read access output %s', (_, organizationId, expectedValue) => {
      const result = runScript({
        accountId: PIPELINE_ACCOUNT_ID,
        stackExists: false,
        organizationId,
      });

      expect(result.exitCode).toBe(0);
      const outputs = getDeployedOutputValues(result.globalTemplate!);
      expect(outputs).toHaveProperty(CFN_RETENTION_OUTPUT_KEY);
      expect(outputs[CFN_RETENTION_OUTPUT_KEY]).toBe(expectedValue);
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
