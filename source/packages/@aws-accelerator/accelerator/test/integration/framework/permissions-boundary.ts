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

/**
 * @fileoverview Per-module IAM role and permissions boundary management for integration tests.
 *
 * Creates module-specific IAM roles with permissions boundaries in target accounts.
 * This provides the same least-privilege enforcement as session policies without
 * consuming STS packed policy space (which conflicts with GitLab runner's 8 transitive
 * session tags that exceed the 2048-byte packed limit when combined with session policies).
 *
 * Architecture:
 *   - LzaGitlabRole (admin) — used by GitLab runner and for boundary/role management
 *   - LzaIntegTest-{Module}-Role — per-module role with boundary, used by module execution
 *
 * The admin role (LzaGitlabRole) assumes into member accounts to create/update the
 * module-specific roles and their boundaries. Module execution then uses the scoped role.
 *
 * GitLab credential vendor transitive session tags (8 tags):
 *   GitLab:User:AccessLevel, GitLab:User, GitLab:Group, GitLab:Project:Stage,
 *   GitLab:Git:Ref, GitLab:Project:Job, GitLab:Project:ProtectedBranch, GitLab:Project
 */

import {
  AttachRolePolicyCommand,
  CreatePolicyCommand,
  CreateRoleCommand,
  DeletePolicyCommand,
  DeletePolicyVersionCommand,
  DeleteRolePermissionsBoundaryCommand,
  GetPolicyCommand,
  GetRoleCommand,
  IAMClient,
  ListPolicyVersionsCommand,
  PutRolePermissionsBoundaryCommand,
  UpdateAssumeRolePolicyCommand,
} from '@aws-sdk/client-iam';
import { createLogger, getModuleSessionPolicy, IAssumeRoleCredential, setRetryStrategy } from 'aws-lza';
import path from 'node:path';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/** Prefix for module test role and boundary policy names */
const ROLE_PREFIX = 'LzaIntegTest';

/**
 * Constructs the module-specific test role name.
 * Example: "macie" → "LzaIntegTest-Macie-Role"
 */
export function getModuleTestRoleName(moduleName: string): string {
  const pascalName = moduleName
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `${ROLE_PREFIX}-${pascalName}-Role`;
}

/**
 * Constructs the boundary policy name for a module.
 * Example: "macie" → "LzaIntegTest-Macie-Boundary"
 */
function getBoundaryPolicyName(moduleName: string): string {
  const pascalName = moduleName
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `${ROLE_PREFIX}-${pascalName}-Boundary`;
}

/**
 * Builds a boundary policy document from a session policy by adding read-only
 * assertion access for the services used by the module.
 *
 * Extracts service prefixes from the session policy actions and adds
 * Get*, List*, Describe* permissions for each service.
 */
function buildBoundaryPolicy(sessionPolicyJson: string): string {
  const sessionPolicy = JSON.parse(sessionPolicyJson);

  // Extract unique service prefixes from all actions
  const servicePrefixes = new Set<string>();
  for (const statement of sessionPolicy.Statement) {
    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    for (const action of actions) {
      const prefix = action.split(':')[0];
      if (prefix && prefix !== '*') {
        servicePrefixes.add(prefix);
      }
    }
  }

  // Build read-only assertion actions for each service
  const assertionActions: string[] = [];
  for (const prefix of servicePrefixes) {
    assertionActions.push(`${prefix}:Get*`, `${prefix}:List*`, `${prefix}:Describe*`);
  }

  const boundaryPolicy = {
    ...sessionPolicy,
    Statement: [
      ...sessionPolicy.Statement,
      ...(assertionActions.length > 0
        ? [
            {
              Sid: 'IntegTestAssertionReadAccess',
              Effect: 'Allow',
              Action: assertionActions,
              Resource: '*',
            },
          ]
        : []),
    ],
  };

  return JSON.stringify(boundaryPolicy);
}

/**
 * Ensures a module-specific test role with permissions boundary exists in a target account.
 *
 * Uses admin credentials (LzaGitlabRole) to:
 * 1. Create the module role if it doesn't exist (with AdministratorAccess)
 * 2. Delete and recreate the boundary policy (ensures it matches current session policy)
 * 3. Attach the boundary to the module role
 *
 * @param options.moduleName - Module name (from AcceleratorModules enum)
 * @param options.accountId - Target AWS account ID
 * @param options.managementAccountId - Management account ID (for trust policy)
 * @param options.partition - AWS partition
 * @param options.region - AWS region
 * @param options.adminCredentials - Credentials with admin access in the target account (LzaGitlabRole)
 */
export async function ensureModuleTestRole(options: {
  moduleName: string;
  accountId: string;
  managementAccountId: string;
  partition: string;
  region: string;
  adminCredentials: IAssumeRoleCredential;
}): Promise<boolean> {
  const { moduleName, accountId, managementAccountId, partition, region, adminCredentials } = options;
  const logPrefix = `${accountId}:${region}`;

  const sessionPolicy = getModuleSessionPolicy(moduleName);
  if (!sessionPolicy) {
    logger.info(`No session policy defined for module "${moduleName}" — skipping role setup`, logPrefix);
    return false;
  }

  const roleName = getModuleTestRoleName(moduleName);
  const policyName = getBoundaryPolicyName(moduleName);
  const policyArn = `arn:${partition}:iam::${accountId}:policy/${policyName}`;
  const adminRoleName = process.env['LZA_GITLAB_ROLE_NAME'] ?? 'LzaGitlabRole';

  logger.info(`Ensuring module role "${roleName}" with boundary in account ${accountId}`, logPrefix);

  const iamClient = new IAMClient({
    region,
    retryStrategy: setRetryStrategy(),
    credentials: {
      accessKeyId: adminCredentials.accessKeyId,
      secretAccessKey: adminCredentials.secretAccessKey,
      sessionToken: adminCredentials.sessionToken,
    },
  });

  // Step 1: Create module role if it doesn't exist, or update trust policy if it does
  const trustPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AllowAdminRoleAssume',
        Effect: 'Allow',
        Principal: {
          AWS: `arn:${partition}:iam::${managementAccountId}:role/${adminRoleName}`,
        },
        Action: ['sts:AssumeRole', 'sts:TagSession'],
      },
    ],
  });

  let trustChanged = false;

  try {
    const existingRole = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
    // Role exists — check if trust policy needs updating
    const existingTrust = JSON.stringify(existingRole.Role?.AssumeRolePolicyDocument);
    const needsUpdate = !existingTrust.includes(`${managementAccountId}:role/${adminRoleName}`);
    if (needsUpdate) {
      logger.info(`Role "${roleName}" trust policy needs update — updating`, logPrefix);
      await iamClient.send(new UpdateAssumeRolePolicyCommand({ RoleName: roleName, PolicyDocument: trustPolicy }));
      trustChanged = true;
    } else {
      logger.info(`Role "${roleName}" trust policy already correct — no update needed`, logPrefix);
    }
  } catch (error: unknown) {
    if ((error as Error).name === 'NoSuchEntityException') {
      logger.info(`Creating role "${roleName}"`, logPrefix);

      await iamClient.send(
        new CreateRoleCommand({
          RoleName: roleName,
          AssumeRolePolicyDocument: trustPolicy,
          Description: `Integration test role for module: ${moduleName}. Managed by integ test framework.`,
          Tags: [
            { Key: 'ManagedBy', Value: 'LzaIntegTestFramework' },
            { Key: 'Module', Value: moduleName },
          ],
        }),
      );

      // Attach AdministratorAccess (boundary will restrict effective permissions)
      await iamClient.send(
        new AttachRolePolicyCommand({
          RoleName: roleName,
          PolicyArn: 'arn:aws:iam::aws:policy/AdministratorAccess',
        }),
      );

      logger.info(`Role "${roleName}" created with AdministratorAccess`, logPrefix);
      trustChanged = true;
    } else {
      throw error;
    }
  }

  // Step 2: Delete existing boundary policy (detach first)
  try {
    const role = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
    if (role.Role?.PermissionsBoundary?.PermissionsBoundaryArn === policyArn) {
      await iamClient.send(new DeleteRolePermissionsBoundaryCommand({ RoleName: roleName }));
    }
  } catch {
    // Ignore — boundary may not be attached yet
  }

  try {
    await iamClient.send(new GetPolicyCommand({ PolicyArn: policyArn }));
    // Policy exists — delete all versions then delete policy
    const versions = await iamClient.send(new ListPolicyVersionsCommand({ PolicyArn: policyArn }));
    for (const version of versions.Versions ?? []) {
      if (!version.IsDefaultVersion) {
        await iamClient.send(new DeletePolicyVersionCommand({ PolicyArn: policyArn, VersionId: version.VersionId }));
      }
    }
    await iamClient.send(new DeletePolicyCommand({ PolicyArn: policyArn }));
    logger.info(`Deleted existing boundary policy "${policyName}"`, logPrefix);
  } catch (error: unknown) {
    if ((error as Error).name !== 'NoSuchEntityException') {
      logger.warn(`Could not delete existing boundary: ${(error as Error).message}`, logPrefix);
    }
  }

  // Step 3: Create fresh boundary policy
  const policyDocument = buildBoundaryPolicy(sessionPolicy.policy);
  logger.info(`Creating boundary policy "${policyName}"`, logPrefix);
  await iamClient.send(
    new CreatePolicyCommand({
      PolicyName: policyName,
      PolicyDocument: policyDocument,
      Description: `Permissions boundary for ${roleName}. Derived from module session policy. Auto-managed.`,
      Tags: [
        { Key: 'ManagedBy', Value: 'LzaIntegTestFramework' },
        { Key: 'Module', Value: moduleName },
      ],
    }),
  );

  // Step 4: Attach boundary to role
  await iamClient.send(
    new PutRolePermissionsBoundaryCommand({
      RoleName: roleName,
      PermissionsBoundary: policyArn,
    }),
  );

  logger.info(`Module role "${roleName}" ready with boundary in account ${accountId}`, logPrefix);
  return trustChanged;
}
