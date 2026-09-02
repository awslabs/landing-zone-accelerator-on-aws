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

import { AseaResourceType, CfnResourceType } from '@aws-accelerator/config';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';

const CUSTOMER_GATEWAY_TYPE = 'AWS::EC2::CustomerGateway';

/**
 * Adopts Customer Gateways originally created by ASEA (via `firewalls[type=CGW]`).
 *
 * ASEA creates the Customer Gateway + Site-to-Site VPN in the SharedNetwork Phase-1
 * stack. During migration these resources survive functionally but are not represented
 * in `aseaResources.json` or `network-config.yaml`, so LZA cannot reference them for
 * TGW route-table association/propagation (issue #4883).
 *
 * The CloudFormation resource is already adopted into the LZA-managed stack by the
 * {@link ImportAseaResourcesStack} `CfnInclude`. This handler writes the LZA SSM
 * parameter (`/network/customerGateways/<name>/id`) so the Customer Gateway can be
 * referenced by name in `network-config.yaml` without being recreated, and records it
 * in the ASEA resource mapping.
 */
export class CustomerGateways extends AseaResource {
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    this.processCustomerGateways();
  }

  /**
   * Adopt each ASEA Customer Gateway: write its LZA SSM parameter and record it in the mapping.
   */
  public processCustomerGateways(): void {
    const existingCustomerGateways = this.scope.importStackResources.getResourcesByType(CUSTOMER_GATEWAY_TYPE);
    if (existingCustomerGateways.length === 0) {
      return;
    }
    for (const existingCustomerGateway of existingCustomerGateways) {
      const customerGatewayName = this.getNameFromTags(existingCustomerGateway);
      if (!customerGatewayName) {
        this.scope.addLogs(
          LogLevel.WARN,
          `Skipping ASEA Customer Gateway ${existingCustomerGateway.logicalResourceId} - no Name tag found`,
        );
        continue;
      }
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(customerGatewayName)}CustomerGateway`),
        parameterName: this.scope.getSsmPath(SsmResourceType.CGW, [customerGatewayName]),
        stringValue: existingCustomerGateway.physicalResourceId!,
      });
      this.scope.addAseaResource(AseaResourceType.CUSTOMER_GATEWAY, customerGatewayName);
    }
  }

  private getNameFromTags(resource: CfnResourceType, tagName = 'Name'): string | undefined {
    const tags = resource.resourceMetadata['Properties']?.Tags as { Key: string; Value: string }[] | undefined;
    return tags?.find(tag => tag.Key === tagName)?.Value;
  }
}
