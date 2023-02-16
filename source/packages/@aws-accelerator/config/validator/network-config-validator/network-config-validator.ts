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

import { createLogger } from '@aws-accelerator/utils';

import { AccountConfig, AccountsConfig, GovCloudAccountConfig } from '../../lib/accounts-config';
import { GlobalConfig } from '../../lib/global-config';
import { NetworkConfig } from '../../lib/network-config';
import { OrganizationConfig } from '../../lib/organization-config';
import { SecurityConfig } from '../../lib/security-config';
import { CentralNetworkValidator } from './central-network-validator';
import { CertificatesValidator } from './certificates-validator';
import { CustomerGatewaysValidator } from './customer-gateways-validator';
import { DhcpOptionsValidator } from './dhcp-options-validator';
import { DirectConnectGatewaysValidator } from './direct-connect-gateways-validator';
import { EndpointPoliciesValidator } from './endpoint-policies-validator';
import { FirewallManagerValidator } from './firewall-manager-validator';
import { NetworkValidatorFunctions } from './network-validator-functions';
import { PrefixListValidator } from './prefix-list-validator';
import { TransitGatewayValidator } from './transit-gateway-validator';
import { VpcValidator } from './vpc-validator';

/**
 * Network Configuration validator.
 * Validates network configuration
 */
export class NetworkConfigValidator {
  constructor(configDir: string) {
    const values = NetworkConfig.load(configDir);
    const ouIdNames: string[] = ['Root'];
    const accounts: (AccountConfig | GovCloudAccountConfig)[] = [];
    const snsTopicNames: string[] = [];

    const errors: string[] = [];
    const logger = createLogger(['network-config-validator']);

    logger.info(`${NetworkConfig.FILENAME} file validation started`);

    //
    // Get list of OU ID names from organization config file
    this.getOuIdNames(configDir, ouIdNames);

    //
    // Get list of Account names from account config file
    this.getAccounts(configDir, accounts);

    //
    // Get the list of sns topic names from global and security config files
    this.getSnsTopicNames(configDir, snsTopicNames);

    //
    // Instantiate helper method class
    const helpers = new NetworkValidatorFunctions(values, ouIdNames, accounts, snsTopicNames);

    //
    // Start Validation
    new CentralNetworkValidator(values, configDir, helpers, errors);
    new TransitGatewayValidator(values, helpers, errors);
    new DhcpOptionsValidator(values, helpers, errors);
    new EndpointPoliciesValidator(values, configDir, helpers, errors);
    new PrefixListValidator(values, helpers, errors);
    new VpcValidator(values, helpers, errors);
    new CustomerGatewaysValidator(values, helpers, errors);
    new DirectConnectGatewaysValidator(values, errors);
    new FirewallManagerValidator(values, helpers, errors);
    new CertificatesValidator(values, errors);

    if (errors.length) {
      throw new Error(`${NetworkConfig.FILENAME} has ${errors.length} issues: ${errors.join(' ')}`);
    }
  }
  /**
   * Prepare list of OU ids from organization config file
   * @param configDir
   */
  private getOuIdNames(configDir: string, ouIdNames: string[]) {
    for (const organizationalUnit of OrganizationConfig.load(configDir).organizationalUnits) {
      ouIdNames.push(organizationalUnit.name);
    }
  }

  /**
   * Prepare list of Account names from account config file
   * @param configDir
   */
  private getAccounts(configDir: string, accounts: (AccountConfig | GovCloudAccountConfig)[]) {
    for (const accountItem of [
      ...AccountsConfig.load(configDir).mandatoryAccounts,
      ...AccountsConfig.load(configDir).workloadAccounts,
    ]) {
      accounts.push(accountItem);
    }
  }
  /**
   * Prepare list of SNS Topic names from global and security config files
   * @param configDir
   */
  private getSnsTopicNames(configDir: string, snsTopicNames: string[]) {
    const securityConfig = SecurityConfig.load(configDir);
    const globalConfig = GlobalConfig.load(configDir);
    const securtiySnsSubscriptions =
      securityConfig.centralSecurityServices.snsSubscriptions?.map(snsSubscription => snsSubscription.level) ?? [];
    const globalSnsSubscriptions = globalConfig.snsTopics?.topics.map(topic => topic.name) ?? [];
    snsTopicNames.push(...securtiySnsSubscriptions);
    snsTopicNames.push(...globalSnsSubscriptions);
  }
}
