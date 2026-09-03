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
 * @fileoverview Base ModuleParams builder for integration tests.
 *
 * Provides reusable functions to construct the common parts of ModuleParams
 * that every module needs (accounts, org accounts, session context, resource names, etc.).
 * Module-specific plugins only need to provide their config stubs.
 */

import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { AcceleratorResourceNames } from '../../../lib/accelerator-resource-names';
import { ModuleExecutionPhase, ModuleParams } from '../../../lib/types';
import { getModuleTestRoleName } from './permissions-boundary';
import { ResolvedEnvironment, TestManifest } from './types';

/**
 * Options for building base ModuleParams.
 */
export interface BaseParamsOptions {
  /** Module name (from AcceleratorModules enum) */
  moduleName: string;
  /** Module handler function */
  handler: (params: ModuleParams) => Promise<unknown>;
  /** Test manifest being executed */
  manifest: TestManifest;
  /** Resolved test environment */
  environment: ResolvedEnvironment;
  /** Module-specific config overrides to merge into the base configs */
  configOverrides?: Partial<ModuleConfigOverrides>;
}

/**
 * Module-specific config overrides.
 * Each module provides only the config stubs it needs.
 */
export interface ModuleConfigOverrides {
  globalConfig: Record<string, unknown>;
  securityConfig: Record<string, unknown>;
  networkConfig: Record<string, unknown>;
  iamConfig: Record<string, unknown>;
  organizationConfig: Record<string, unknown>;
  customizationsConfig: Record<string, unknown>;
  replacementsConfig: Record<string, unknown>;
}

/**
 * Build a minimal AccountsConfig from the resolved environment.
 *
 * Satisfies common method calls across modules:
 *   - getManagementAccountId()
 *   - getAccountId(name)
 *   - getAuditAccountId()
 *   - getAccountIds()
 */
export function buildAccountsConfig(environment: ResolvedEnvironment): AccountsConfig {
  const accounts = environment.accounts;

  const mandatoryAccounts: Array<{
    name: string;
    email: string;
    description: string;
    organizationalUnit: string;
    warm: boolean;
  }> = [];
  const accountIds: Array<{ email: string; accountId: string }> = [];

  const emailDomain = ['integ-test', 'example', 'com'].join('.');
  for (const [name, id] of accounts.entries()) {
    const email = `${name.toLowerCase().replaceAll(/\s+/g, '-')}@${emailDomain}`;
    mandatoryAccounts.push({
      name,
      email,
      description: `Integration test account: ${name}`,
      organizationalUnit: name === 'Management' ? 'Root' : 'Security',
      warm: false,
    });
    accountIds.push({ email, accountId: id });
  }

  const config = new AccountsConfig({
    managementAccountEmail:
      accountIds.find(a => a.email.startsWith('management'))?.email ?? `management@${emailDomain}`,
    logArchiveAccountEmail:
      accountIds.find(a => a.email.startsWith('logarchive') || a.email.startsWith('log-archive'))?.email ??
      `logarchive@${emailDomain}`,
    auditAccountEmail: accountIds.find(a => a.email.startsWith('audit'))?.email ?? `audit@${emailDomain}`,
  });

  (config as Record<string, unknown>).mandatoryAccounts = mandatoryAccounts;
  (config as Record<string, unknown>).workloadAccounts = [];
  config.accountIds = accountIds;

  return config;
}

/**
 * Build the organizationAccounts array from the environment account map.
 * These are AWS Organizations Account objects used by extractSecurityServiceMetadata().
 */
export function buildOrganizationAccounts(
  environment: ResolvedEnvironment,
): Array<{ Id: string; Name: string; Status: string }> {
  return [...environment.accounts.entries()].map(([name, id]) => ({
    Id: id,
    Name: name,
    Status: 'ACTIVE',
  }));
}

/**
 * Build the base ModuleParams skeleton that every module needs.
 *
 * Module plugins call this and then overlay their specific config stubs
 * via configOverrides.
 */
export function buildBaseModuleParams(options: BaseParamsOptions): ModuleParams {
  const { moduleName, handler, manifest, environment, configOverrides } = options;

  const accountsConfig = buildAccountsConfig(environment);

  // Use module-specific test role for cross-account operations.
  // This role has a permissions boundary matching the module's session policy.
  // Falls back to MANAGEMENT_ACCOUNT_ACCESS_ROLE for backward compatibility.
  const accessRole = getModuleTestRoleName(moduleName);

  const acceleratorResourceNames = new AcceleratorResourceNames({
    prefixes: environment.resourcePrefixes,
    centralizedLoggingRegion: environment.region,
  });

  return {
    moduleItem: {
      name: moduleName,
      description: `Integration test: ${manifest.name}`,
      runOrder: 1,
      handler,
      executionPhase: ModuleExecutionPhase.DEPLOY,
    },
    runnerParameters: {
      sessionContext: {
        invokingAccountId: environment.managementAccountId,
        region: environment.region,
        partition: environment.partition,
        globalRegion: environment.region,
      },
      configDirPath: '',
      prefix: environment.prefix,
      solutionId: environment.solutionId,
      dryRun: false,
      loadOrganizationsFromDynamoDbTable: false,
    },
    moduleRunnerParameters: {
      configs: {
        accountsConfig,
        globalConfig: {
          managementAccountAccessRole: accessRole,
          ...configOverrides?.globalConfig,
        } as unknown as GlobalConfig,
        securityConfig: (configOverrides?.securityConfig ?? {}) as unknown as SecurityConfig,
        networkConfig: (configOverrides?.networkConfig ?? {}) as unknown as NetworkConfig,
        iamConfig: (configOverrides?.iamConfig ?? {}) as unknown as IamConfig,
        organizationConfig: (configOverrides?.organizationConfig ?? {}) as unknown as OrganizationConfig,
        customizationsConfig: (configOverrides?.customizationsConfig ?? {}) as unknown as CustomizationsConfig,
        replacementsConfig: (configOverrides?.replacementsConfig ?? {}) as unknown as ReplacementsConfig,
      },
      resourcePrefixes: environment.resourcePrefixes,
      acceleratorResourceNames,
      logging: {
        centralizedRegion: environment.region,
        bucketName: environment.logging.bucketName,
        bucketKeyArn: environment.logging.bucketKeyArn,
      },
      organizationAccounts: buildOrganizationAccounts(environment),
      managementAccountCredentials: environment.managementAccountCredentials,
      // Session policy is NOT passed here. Instead, the equivalent restriction is enforced
      // via IAM permissions boundaries on the target account roles (managed by
      // permissions-boundary.ts). This avoids the STS PackedPolicyTooLargeException caused
      // by GitLab runner's 8 transitive session tags consuming packed policy space.
      sessionPolicy: undefined,
      accountAccessRoleName: accessRole,
    },
  };
}
