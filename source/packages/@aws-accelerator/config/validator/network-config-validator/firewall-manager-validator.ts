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
import { FirewallManagerNotificationChannelConfig, NetworkConfig } from '../../lib/network-config';
import { NetworkValidatorFunctions } from './network-validator-functions';

export class FirewallManagerValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate DX gateway configurations
    //
    this.validateFmsConfig(values, helpers, errors);
  }

  /**
   * Function to validate the FMS configuration.
   * @param values
   */
  private validateFmsConfig(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const fmsConfiguration = values.firewallManagerService;
    if (!fmsConfiguration) {
      return;
    }
    if (!helpers.accountExists(fmsConfiguration?.delegatedAdminAccount || '')) {
      errors.push(
        `Delegated Admin Account ${fmsConfiguration?.delegatedAdminAccount} name does not exist in Accounts configuration`,
      );
    }
    for (const channel of fmsConfiguration?.notificationChannels || []) {
      this.validatFmsNotificationChannels(channel, helpers, errors);
    }
  }

  private validatFmsNotificationChannels(
    notificationChannel: FirewallManagerNotificationChannelConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    if (!helpers.snsTopicExists(notificationChannel.snsTopic)) {
      errors.push(`The SNS Topic name ${notificationChannel.snsTopic} for the notification channel does not exist.`);
    }
  }
}
