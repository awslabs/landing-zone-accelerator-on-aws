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

import { DeleteDefaultVpc } from '@aws-accelerator/constructs';

import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { NetworkPrepStack } from './network-prep-stack';
import { DefaultVpcsConfig } from '@aws-accelerator/config';

export class DefaultVpcResources {
  private stack: NetworkPrepStack;
  public readonly deleteDefaultVpc?: DeleteDefaultVpc;

  constructor(networkPrepStack: NetworkPrepStack, props: AcceleratorStackProps) {
    this.stack = networkPrepStack;
    this.deleteDefaultVpc = props.networkConfig.defaultVpc
      ? this.deleteDefaultVpcMethod(props.networkConfig.defaultVpc)
      : undefined;
  }

  /**
   * Delete default VPC in the current account+region
   * @param props
   * @returns
   */
  private deleteDefaultVpcMethod(defaultVpc: DefaultVpcsConfig): DeleteDefaultVpc | undefined {
    if (!defaultVpc) {
      return undefined;
    }

    const accountExcluded = defaultVpc.excludeAccounts && this.stack.isAccountExcluded(defaultVpc.excludeAccounts);
    const regionExcluded = defaultVpc.excludeRegions && this.stack.isRegionExcluded(defaultVpc.excludeRegions);

    if (defaultVpc.delete && !accountExcluded && !regionExcluded) {
      this.stack.addLogs(LogLevel.INFO, 'Add DeleteDefaultVpc');
      return new DeleteDefaultVpc(this.stack, 'DeleteDefaultVpc', {
        kmsKey: this.stack.cloudwatchKey,
        logRetentionInDays: this.stack.logRetention,
      });
    }
    return undefined;
  }
}
