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

import {
  GatewayEndpointServiceConfig,
  InterfaceEndpointServiceConfig,
  NetworkConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';

// See https://docs.aws.amazon.com/vpc/latest/privatelink/integrated-services-vpce-list.html
// for the services that integrates with AWS PrivateLink, but does not support VPC endpoint policies
const policiesUnsupported = [
  'appmesh-envoy-management',
  'appstream.api',
  'appstream.streaming',
  'cloudtrail',
  'codeguru-profiler',
  'codeguru-reviewer',
  'codepipeline',
  'datasync',
  'deviceadvisor.iot',
  'ebs',
  'elastic-inference.runtime',
  'iot.data',
  'iotwireless.api',
  'lorawan.cups',
  'lorawan.lns',
  'iotsitewise.api',
  'iotsitewise.data',
  'macie2',
  'aps',
  'aps-workspaces',
  'awsconnector',
  'sms',
  'sms-fips',
  'email-smtp',
  'storagegateway',
  'transfer',
  'transfer.server',
];

/**
 * Whether the accelerator attaches an endpoint policy to an endpoint of this service.
 * @param service Endpoint service name, for example `s3` or `codeguru-profiler`
 * @returns false for services the accelerator treats as not supporting VPC endpoint policies
 */
export function isVpcEndpointPolicySupported(service: string): boolean {
  return !policiesUnsupported.includes(service);
}

/**
 * Warning for an endpoint policy that is configured but not applied, shared by config validation and synthesis.
 * @param vpcName VPC or VPC template name
 * @param service Endpoint service name
 * @param policyName Endpoint policy that is not applied
 * @returns The warning message
 */
export function endpointPolicyNotAppliedMessage(vpcName: string, service: string, policyName: string): string {
  return (
    `Endpoint policy ${policyName} is not applied to the ${service} endpoint in VPC ${vpcName} because the service ` +
    'does not support VPC endpoint policies. The endpoint is deployed without a policy.'
  );
}

/**
 * Returns the warning for one endpoint whose configured policy (the endpoint `policy` or the VPC `defaultPolicy`)
 * is not applied because the service does not support VPC endpoint policies.
 * @param vpcItem VPC or VPC template that declares the endpoint
 * @param endpointItem Gateway or interface endpoint
 * @param isGatewayEndpoint Whether the endpoint is a gateway endpoint
 * @returns The warning message, or undefined when the policy is applied or none is configured
 */
export function getEndpointPolicyNotAppliedWarning(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  endpointItem: GatewayEndpointServiceConfig | InterfaceEndpointServiceConfig,
  isGatewayEndpoint?: boolean,
): string | undefined {
  if (isVpcEndpointPolicySupported(endpointItem.service) || !(endpointItem.applyPolicy ?? true)) {
    return undefined;
  }
  const endpointGroup = isGatewayEndpoint ? vpcItem.gatewayEndpoints : vpcItem.interfaceEndpoints;
  const policyName = endpointItem.policy ?? endpointGroup?.defaultPolicy;
  return policyName ? endpointPolicyNotAppliedMessage(vpcItem.name, endpointItem.service, policyName) : undefined;
}

/**
 * Returns a warning for every gateway or interface endpoint whose configured policy is not applied because the
 * service does not support VPC endpoint policies.
 * @param networkConfig Network configuration
 * @returns One warning message per affected endpoint
 */
export function getEndpointPolicyNotAppliedWarnings(networkConfig: NetworkConfig): string[] {
  const warnings: string[] = [];
  for (const vpcItem of [...networkConfig.vpcs, ...(networkConfig.vpcTemplates ?? [])]) {
    for (const endpointItem of vpcItem.gatewayEndpoints?.endpoints ?? []) {
      const warning = getEndpointPolicyNotAppliedWarning(vpcItem, endpointItem, true);
      if (warning) {
        warnings.push(warning);
      }
    }
    for (const endpointItem of vpcItem.interfaceEndpoints?.endpoints ?? []) {
      const warning = getEndpointPolicyNotAppliedWarning(vpcItem, endpointItem);
      if (warning) {
        warnings.push(warning);
      }
    }
  }
  return warnings;
}
