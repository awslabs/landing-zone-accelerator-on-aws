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

import { DxGatewayConfig } from '@aws-accelerator/config';
import { DirectConnectGateway, VirtualInterface, VirtualInterfaceProps } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { NetworkPrepStack } from './network-prep-stack';

export class DxResources {
  public readonly dxGatewayMap: Map<string, string>;
  public readonly ssmRoleMap: Map<string, cdk.aws_iam.Role>;
  public readonly vifMap: Map<string, string>;
  private stack: NetworkPrepStack;

  constructor(networkPrepStack: NetworkPrepStack, props: AcceleratorStackProps) {
    this.stack = networkPrepStack;

    // Create DX gateways and virtual interfaces
    [this.dxGatewayMap, this.vifMap] = this.createDirectConnectResources(props);
    // Create cross-account SSM role if required
    this.ssmRoleMap = this.validateSsmRole(props);
  }

  /**
   * Create Direct Connect resources
   * @param props
   * @returns
   */
  private createDirectConnectResources(props: AcceleratorStackProps): Map<string, string>[] {
    const vifMap = new Map<string, string>();
    // Create DX gateways
    const dxGatewayMap = this.createDirectConnectGateways(props);
    // Create virtual interfaces
    for (const dxgwItem of props.networkConfig.directConnectGateways ?? []) {
      const dxgwItemVifMap = this.validateVirtualInterfaceProps(dxgwItem, dxGatewayMap, props);
      dxgwItemVifMap.forEach((value, key) => vifMap.set(key, value));
    }
    return [dxGatewayMap, vifMap];
  }

  /**
   * Create Direct Connect Gateway
   * @param props
   * @returns
   */
  private createDirectConnectGateways(props: AcceleratorStackProps): Map<string, string> {
    const dxGatewayMap = new Map<string, string>();

    for (const dxgwItem of props.networkConfig.directConnectGateways ?? []) {
      const accountId = props.accountsConfig.getAccountId(dxgwItem.account);
      // DXGW is a global object -- only create in home region
      if (this.stack.isTargetStack([accountId], [props.globalConfig.homeRegion])) {
        this.stack.addLogs(LogLevel.INFO, `Creating Direct Connect Gateway ${dxgwItem.name}`);
        const dxGateway = new DirectConnectGateway(this.stack, pascalCase(`${dxgwItem.name}DxGateway`), {
          gatewayName: dxgwItem.gatewayName,
          asn: dxgwItem.asn,
          kmsKey: this.stack.cloudwatchKey,
          logRetentionInDays: this.stack.logRetention,
        });
        this.stack.addSsmParameter({
          logicalId: pascalCase(`SsmParam${dxgwItem.name}DirectConnectGateway`),
          parameterName: this.stack.getSsmPath(SsmResourceType.DXGW, [dxgwItem.name]),
          stringValue: dxGateway.directConnectGatewayId,
        });
        dxGatewayMap.set(dxgwItem.name, dxGateway.directConnectGatewayId);
      }
    }
    return dxGatewayMap;
  }

  /**
   * Validate Direct Connect virtual interface properties
   * and create interfaces
   * @param dxgwItem
   * @param dxgwMap
   * @param props
   * @returns
   */
  private validateVirtualInterfaceProps(
    dxgwItem: DxGatewayConfig,
    dxGatewayMap: Map<string, string>,
    props: AcceleratorStackProps,
  ): Map<string, string> {
    const vifMap = new Map<string, string>();

    for (const vifItem of dxgwItem.virtualInterfaces ?? []) {
      const connectionOwnerAccountId = props.accountsConfig.getAccountId(vifItem.ownerAccount);
      let createVif = false;
      let vifLogicalId: string | undefined = undefined;
      let vifProps: VirtualInterfaceProps | undefined = undefined;

      // If DXGW and connection owner account do not match, create a VIF allocation
      if (
        dxgwItem.account !== vifItem.ownerAccount &&
        this.stack.isTargetStack([connectionOwnerAccountId], [props.globalConfig.homeRegion])
      ) {
        this.stack.addLogs(
          LogLevel.INFO,
          `Creating virtual interface allocation ${vifItem.name} to Direct Connect Gateway ${dxgwItem.name}`,
        );
        createVif = true;
        vifLogicalId = pascalCase(`${dxgwItem.name}${vifItem.name}VirtualInterfaceAllocation`);
        const vifOwnerAccountId = props.accountsConfig.getAccountId(dxgwItem.account);
        vifProps = {
          connectionId: vifItem.connectionId,
          customerAsn: vifItem.customerAsn,
          interfaceName: vifItem.interfaceName,
          kmsKey: this.stack.cloudwatchKey,
          logRetentionInDays: this.stack.logRetention,
          type: vifItem.type,
          region: vifItem.region,
          vlan: vifItem.vlan,
          addressFamily: vifItem.addressFamily,
          amazonAddress: vifItem.amazonAddress,
          customerAddress: vifItem.customerAddress,
          enableSiteLink: vifItem.enableSiteLink,
          jumboFrames: vifItem.jumboFrames,
          ownerAccount: vifOwnerAccountId,
          tags: vifItem.tags,
          acceleratorPrefix: props.prefixes.accelerator,
        };
      }

      // If DXGW and connection owner account do match, create a VIF
      if (
        dxgwItem.account === vifItem.ownerAccount &&
        this.stack.isTargetStack([connectionOwnerAccountId], [props.globalConfig.homeRegion])
      ) {
        this.stack.addLogs(
          LogLevel.INFO,
          `Creating virtual interface ${vifItem.name} to Direct Connect Gateway ${dxgwItem.name}`,
        );
        createVif = true;
        const directConnectGatewayId = dxGatewayMap.get(dxgwItem.name);
        if (!directConnectGatewayId) {
          this.stack.addLogs(LogLevel.ERROR, `Unable to locate Direct Connect Gateway ${dxgwItem.name}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
        vifLogicalId = pascalCase(`${dxgwItem.name}${vifItem.name}VirtualInterface`);
        vifProps = {
          connectionId: vifItem.connectionId,
          customerAsn: vifItem.customerAsn,
          interfaceName: vifItem.interfaceName,
          kmsKey: this.stack.cloudwatchKey,
          logRetentionInDays: this.stack.logRetention,
          type: vifItem.type,
          region: vifItem.region,
          vlan: vifItem.vlan,
          addressFamily: vifItem.addressFamily,
          amazonAddress: vifItem.amazonAddress,
          customerAddress: vifItem.customerAddress,
          directConnectGatewayId,
          enableSiteLink: vifItem.enableSiteLink,
          jumboFrames: vifItem.jumboFrames,
          tags: vifItem.tags,
          acceleratorPrefix: props.prefixes.accelerator,
        };
      }

      // Create the VIF or VIF allocation
      if (createVif) {
        const vif = this.createVirtualInterface(dxgwItem.name, vifItem.name, vifLogicalId, vifProps);
        vifMap.set(`${dxgwItem.name}_${vifItem.name}`, vif.virtualInterfaceId);
      }
    }
    return vifMap;
  }

  /**
   * Create Direct connect virtual interface
   * @param dxgwName
   * @param vifName
   * @param vifLogicalId
   * @param vifProps
   */
  private createVirtualInterface(
    dxgwName: string,
    vifName: string,
    vifLogicalId?: string,
    vifProps?: VirtualInterfaceProps,
  ): VirtualInterface {
    if (!vifLogicalId || !vifProps) {
      this.stack.addLogs(
        LogLevel.ERROR,
        `Create virtual interfaces: unable to process properties for virtual interface ${vifName}`,
      );
      throw new Error(`Configuration validation failed at runtime.`);
    }
    const virtualInterface = new VirtualInterface(this.stack, vifLogicalId, vifProps);
    this.stack.addSsmParameter({
      logicalId: pascalCase(`SsmParam${dxgwName}${vifName}VirtualInterface`),
      parameterName: this.stack.getSsmPath(SsmResourceType.DXVIF, [dxgwName, vifName]),
      stringValue: virtualInterface.virtualInterfaceId,
    });

    return virtualInterface;
  }

  /**
   * Validate whether a cross-account SSM role should be created in this stack
   * @param props
   * @returns
   */
  private validateSsmRole(props: AcceleratorStackProps) {
    const accountIds: string[] = [];
    const ssmRoleMap = new Map<string, cdk.aws_iam.Role>();

    if (props.globalConfig.homeRegion === cdk.Stack.of(this.stack).region) {
      for (const dxgwItem of props.networkConfig.directConnectGateways ?? []) {
        for (const associationItem of dxgwItem.transitGatewayAssociations ?? []) {
          const tgw = props.networkConfig.transitGateways.find(
            item => item.name === associationItem.name && item.account === associationItem.account,
          );
          if (!tgw) {
            this.stack.addLogs(LogLevel.ERROR, `Unable to locate transit gateway ${associationItem.name}`);
            throw new Error(`Configuration validation failed at runtime.`);
          }
          const tgwAccountId = props.accountsConfig.getAccountId(tgw.account);

          // Add to accountIds if accounts do not match
          if (dxgwItem.account !== tgw.account && !accountIds.includes(tgwAccountId)) {
            accountIds.push(tgwAccountId);
          }
          // Add to accountIds if regions don't match
          if (tgw.region !== cdk.Stack.of(this.stack).region && !accountIds.includes(tgwAccountId)) {
            accountIds.push(tgwAccountId);
          }
        }
        // Create role
        if (accountIds.length > 0) {
          const role = this.createDxGatewaySsmRole(props, dxgwItem, accountIds);
          ssmRoleMap.set(`${dxgwItem.name}`, role);
        }
      }
    }
    return ssmRoleMap;
  }

  /**
   * Create a cross-account role to access SSM parameters
   * @param props
   * @param dxgwItem
   * @param accountIds
   */
  private createDxGatewaySsmRole(
    props: AcceleratorStackProps,
    dxgwItem: DxGatewayConfig,
    accountIds: string[],
  ): cdk.aws_iam.Role {
    this.stack.addLogs(LogLevel.INFO, `Direct Connect Gateway: Create IAM cross-account access role`);

    const principals: cdk.aws_iam.PrincipalBase[] = [];
    accountIds.forEach(accountId => {
      principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
    });
    const role = new cdk.aws_iam.Role(this.stack, `Get${pascalCase(dxgwItem.name)}SsmParamRole`, {
      roleName: `${props.prefixes.accelerator}-Get${pascalCase(dxgwItem.name)}SsmParamRole-${
        cdk.Stack.of(this.stack).region
      }`,
      assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
      inlinePolicies: {
        default: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['ssm:GetParameter'],
              resources: [
                `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${props.prefixes.ssmParamName}/network/directConnectGateways/${dxgwItem.name}/*`,
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
}
