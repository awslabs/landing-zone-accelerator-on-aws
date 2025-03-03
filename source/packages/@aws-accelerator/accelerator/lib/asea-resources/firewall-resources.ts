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

import { AseaResourceType, CfnResourceType } from '@aws-accelerator/config/lib/common/types';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';

const EC2_FIREWALL_INSTANCE_TYPE = 'AWS::EC2::Instance';
const ASEA_PHASE_NUMBER_FIREWALL_INSTANCE = '2';

/**
 * Handles EC2 Firewall Instances created by ASEA.
 * All EC2 Firewall Instances are deployed in Phase-2
 */
export class FirewallResources extends AseaResource {
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    const existingFirewallInstances = this.scope.importStackResources.getResourcesByType(EC2_FIREWALL_INSTANCE_TYPE);
    if (existingFirewallInstances.length === 0) {
      return;
    }
    this.processFirewallInstances(props, existingFirewallInstances);
  }

  private processFirewallInstances(props: AseaResourceProps, existingFirewallInstances: CfnResourceType[]) {
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER_FIREWALL_INSTANCE) {
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${EC2_FIREWALL_INSTANCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`,
      );
      return;
    }
    for (const existingFirewallInstance of existingFirewallInstances) {
      const firewallInstanceName = this.getAseaFirewallInstanceNameFromTags(existingFirewallInstance);

      const firewallInstance = this.stack.getResource(
        existingFirewallInstance.logicalResourceId,
      ) as cdk.aws_ec2.CfnInstance;
      const enis = firewallInstance.networkInterfaces as cdk.aws_ec2.CfnInstance.NetworkInterfaceProperty[];

      for (const eni of enis ?? []) {
        this.scope.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(firewallInstanceName)}Eni${eni.deviceIndex}`),
          parameterName: this.scope.getSsmPath(SsmResourceType.FIREWALL_ENI, [firewallInstanceName, eni.deviceIndex]),
          stringValue: eni.networkInterfaceId!,
        });
      }

      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(firewallInstanceName)}`),
        parameterName: this.scope.getSsmPath(SsmResourceType.FIREWALL_INSTANCE, [firewallInstanceName]),
        stringValue: existingFirewallInstance.physicalResourceId!,
      });
      this.scope.addAseaResource(AseaResourceType.FIREWALL_INSTANCE, firewallInstanceName);
    }
  }

  private getAseaFirewallInstanceNameFromTags(existingFirewallInstance: CfnResourceType, tagName = 'Name') {
    const nameTag = existingFirewallInstance.resourceMetadata['Properties'].Tags.find(
      (tag: { Key: string; Value: string }) => tag.Key === tagName,
    );
    const firewallName = nameTag.Value;
    return firewallName;
  }
}
