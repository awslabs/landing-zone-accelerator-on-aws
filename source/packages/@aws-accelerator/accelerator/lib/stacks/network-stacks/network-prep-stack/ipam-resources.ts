/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { CentralNetworkServicesConfig, IpamConfig, IpamPoolConfig } from '@aws-accelerator/config';
import { Ipam, IpamPool, IpamScope } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { LogLevel } from '../network-stack';
import { NetworkPrepStack } from './network-prep-stack';

export class IpamResources {
  public readonly ipamMap: Map<string, string>;
  public readonly poolMap: Map<string, string>;
  public readonly scopeMap: Map<string, string>;
  public readonly ssmRole?: cdk.aws_iam.Role;

  private stack: NetworkPrepStack;

  constructor(
    networkPrepStack: NetworkPrepStack,
    delegatedAdminAccountId: string,
    centralConfig: CentralNetworkServicesConfig,
    homeRegion: string,
    ssmParamNamePrefix: string,
    orgId?: string,
  ) {
    this.stack = networkPrepStack;

    // Create IPAMs
    [this.ipamMap, this.scopeMap, this.poolMap] = this.createIpamResources(delegatedAdminAccountId, centralConfig);
    // Create cross-account SSM role
    this.ssmRole = this.createIpamSsmRole(
      centralConfig,
      delegatedAdminAccountId,
      homeRegion,
      ssmParamNamePrefix,
      orgId,
    );
  }

  /**
   * Create IPAM resources
   * @param accountId
   * @param centralConfig
   */
  private createIpamResources(accountId: string, centralConfig: CentralNetworkServicesConfig): Map<string, string>[] {
    const ipamMap = new Map<string, string>();
    const poolMap = new Map<string, string>();
    const scopeMap = new Map<string, string>();

    for (const ipamItem of centralConfig.ipams ?? []) {
      if (this.stack.isTargetStack([accountId], [ipamItem.region])) {
        this.stack.addLogs(LogLevel.INFO, `Add IPAM ${ipamItem.name}`);

        // Create IPAM
        const ipam = new Ipam(this.stack, pascalCase(`${ipamItem.name}Ipam`), {
          name: ipamItem.name,
          description: ipamItem.description,
          operatingRegions: ipamItem.operatingRegions,
          tags: ipamItem.tags,
        });
        ipamMap.set(ipamItem.name, ipam.ipamId);
        this.stack.addSsmParameter({
          logicalId: pascalCase(`SsmParam${ipamItem.name}IpamId`),
          parameterName: this.stack.getSsmPath(SsmResourceType.IPAM, [ipamItem.name]),
          stringValue: ipam.ipamId,
        });

        // Create scopes
        const ipamItemScopeMap = this.createIpamScopes(ipam, ipamItem);
        ipamItemScopeMap.forEach((value, key) => scopeMap.set(key, value));

        // Create pools
        if (ipamItem.pools) {
          const ipamBasePoolMap = this.createIpamBasePools(ipam, ipamItem, ipamItemScopeMap);

          // Create nested pools
          const ipamAllPoolsMap = this.createIpamNestedPools(ipam, ipamItem, ipamBasePoolMap, ipamItemScopeMap);
          ipamAllPoolsMap.forEach((value, key) => poolMap.set(key, value));
        }
      }
    }
    return [ipamMap, scopeMap, poolMap];
  }

  /**
   * Create IPAM scopes for a given IPAM
   * @param ipam
   * @param ipamItem
   * @returns
   */
  private createIpamScopes(ipam: Ipam, ipamItem: IpamConfig): Map<string, string> {
    const scopeMap = new Map<string, string>();

    for (const scopeItem of ipamItem.scopes ?? []) {
      this.stack.addLogs(LogLevel.INFO, `Add IPAM scope ${scopeItem.name}`);
      const ipamScope = new IpamScope(this.stack, pascalCase(`${scopeItem.name}Scope`), {
        ipamId: ipam.ipamId,
        name: scopeItem.name,
        description: scopeItem.description,
        tags: scopeItem.tags ?? [],
      });
      scopeMap.set(`${ipamItem.name}_${scopeItem.name}`, ipamScope.ipamScopeId);

      this.stack.addSsmParameter({
        logicalId: pascalCase(`SsmParam${scopeItem.name}ScopeId`),
        parameterName: this.stack.getSsmPath(SsmResourceType.IPAM_SCOPE, [scopeItem.name]),
        stringValue: ipamScope.ipamScopeId,
      });
    }
    return scopeMap;
  }

  /**
   * Create IPAM base pools
   * @param ipam
   * @param ipamItem
   * @param scopeMap
   * @returns
   */
  private createIpamBasePools(ipam: Ipam, ipamItem: IpamConfig, scopeMap: Map<string, string>): Map<string, string> {
    const poolMap = new Map<string, string>();

    const basePools = ipamItem.pools!.filter(item => {
      return !item.sourceIpamPool;
    });
    for (const poolItem of basePools ?? []) {
      this.stack.addLogs(LogLevel.INFO, `Add IPAM top-level pool ${poolItem.name}`);
      let poolScope: string | undefined;

      if (poolItem.scope) {
        poolScope = scopeMap.get(`${ipamItem.name}_${poolItem.scope}`);

        if (!poolScope) {
          this.stack.addLogs(LogLevel.ERROR, `Unable to locate IPAM scope ${poolItem.scope} for pool ${poolItem.name}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
      }
      // Create base pool
      const pool = this.createIpamPool(ipam, poolItem, poolScope);
      poolMap.set(`${ipamItem.name}_${poolItem.name}`, pool.ipamPoolId);
    }
    return poolMap;
  }

  /**
   * Create IPAM nested pools
   * @param ipam
   * @param ipamItem
   * @param poolMap
   * @param scopeMap
   */
  private createIpamNestedPools(
    ipam: Ipam,
    ipamItem: IpamConfig,
    poolMap: Map<string, string>,
    scopeMap: Map<string, string>,
  ): Map<string, string> {
    const nestedPools = ipamItem.pools!.filter(item => {
      return item.sourceIpamPool;
    });

    // Use while loop for iteration
    while (poolMap.size < ipamItem.pools!.length) {
      for (const poolItem of nestedPools) {
        // Check if source pool name has been created or exists in the config array
        const sourcePool = poolMap.get(`${ipamItem.name}_${poolItem.sourceIpamPool!}`);
        if (!sourcePool) {
          // Check for case where the source pool hasn't been created yet
          const sourcePoolExists = nestedPools.find(item => item.name === poolItem.sourceIpamPool);
          if (!sourcePoolExists) {
            this.stack.addLogs(
              LogLevel.ERROR,
              `Unable to locate source IPAM pool ${poolItem.sourceIpamPool} for pool ${poolItem.name}`,
            );
            throw new Error(`Configuration validation failed at runtime.`);
          }
          // Skip iteration if source pool exists but has not yet been created
          continue;
        }
        // Check if this item has already been created
        const poolExists = poolMap.get(`${ipamItem.name}_${poolItem.name}`);

        if (sourcePool && !poolExists) {
          this.stack.addLogs(LogLevel.INFO, `Add IPAM nested pool ${poolItem.name}`);
          let poolScope: string | undefined;

          if (poolItem.scope) {
            poolScope = scopeMap.get(poolItem.scope);

            if (!poolScope) {
              this.stack.addLogs(
                LogLevel.ERROR,
                `Unable to locate IPAM scope ${poolItem.scope} for pool ${poolItem.name}`,
              );
              throw new Error(`Configuration validation failed at runtime.`);
            }
          }

          // Create nested pool
          const pool = this.createIpamPool(ipam, poolItem, poolScope, sourcePool);
          poolMap.set(`${ipamItem.name}_${poolItem.name}`, pool.ipamPoolId);
        }
      }
    }
    return poolMap;
  }

  /**
   * Create IPAM pool
   * @param ipam
   * @param poolItem
   * @param poolScope
   * @param sourcePool
   * @returns
   */
  private createIpamPool(ipam: Ipam, poolItem: IpamPoolConfig, poolScope?: string, sourcePool?: string): IpamPool {
    const pool = new IpamPool(this.stack, pascalCase(`${poolItem.name}Pool`), {
      addressFamily: poolItem.addressFamily ?? 'ipv4',
      ipamScopeId: poolScope ?? ipam.privateDefaultScopeId,
      name: poolItem.name,
      allocationDefaultNetmaskLength: poolItem.allocationDefaultNetmaskLength,
      allocationMaxNetmaskLength: poolItem.allocationMaxNetmaskLength,
      allocationMinNetmaskLength: poolItem.allocationMinNetmaskLength,
      allocationResourceTags: poolItem.allocationResourceTags,
      autoImport: poolItem.autoImport,
      description: poolItem.description,
      locale: poolItem.locale,
      provisionedCidrs: poolItem.provisionedCidrs,
      publiclyAdvertisable: poolItem.publiclyAdvertisable,
      sourceIpamPoolId: sourcePool,
      tags: poolItem.tags,
    });
    this.stack.addSsmParameter({
      logicalId: pascalCase(`SsmParam${poolItem.name}PoolId`),
      parameterName: this.stack.getSsmPath(SsmResourceType.IPAM_POOL, [poolItem.name]),
      stringValue: pool.ipamPoolId,
    });

    // Add resource shares
    if (poolItem.shareTargets) {
      this.stack.addLogs(LogLevel.INFO, `Share IPAM pool ${poolItem.name}`);
      this.stack.addResourceShare(poolItem, `${poolItem.name}_IpamPoolShare`, [pool.ipamPoolArn]);
    }
    return pool;
  }

  /**
   * Create cross-account SSM role
   *
   * @param centralConfig
   * @param delegatedAdminAccountId
   * @param homeRegion
   * @param ssmParamNamePrefix
   * @param orgId
   */
  private createIpamSsmRole(
    centralConfig: CentralNetworkServicesConfig,
    delegatedAdminAccountId: string,
    homeRegion: string,
    ssmParamNamePrefix: string,
    orgId?: string,
  ): cdk.aws_iam.Role | undefined {
    if (
      this.stack.isTargetStack([delegatedAdminAccountId], [homeRegion]) &&
      centralConfig.ipams &&
      centralConfig.ipams.length > 0
    ) {
      this.stack.addLogs(LogLevel.INFO, `IPAM Pool: Create IAM role for cross-account SSM Parameter pulls`);

      const role = new cdk.aws_iam.Role(this.stack, `GetIpamSsmParamRole`, {
        roleName: this.stack.acceleratorResourceNames.roles.ipamSsmParameterAccess,
        assumedBy: this.stack.getOrgPrincipals(orgId),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:GetParameter', 'ssm:GetParameters'],
                resources: [
                  `arn:${cdk.Aws.PARTITION}:ssm:*:${cdk.Aws.ACCOUNT_ID}:parameter${ssmParamNamePrefix}/network/ipam/pools/*/id`,
                ],
              }),
            ],
          }),
        },
      });
      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      NagSuppressions.addResourceSuppressions(role, [
        { id: 'AwsSolutions-IAM5', reason: 'Allow cross-account resources to get SSM parameters under this path.' },
      ]);

      return role;
    }
    return undefined;
  }
}
