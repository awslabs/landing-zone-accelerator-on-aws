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

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { NetworkFirewall } from '../../lib/aws-networkfirewall/firewall';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(NetworkFirewall): ';

//Initialize stack for resource configuration test
const stack = new cdk.Stack();

const firewallPolicyArn = 'arn:aws:network-firewall:us-east-1:222222222222:firewall-policy/TestPolicy';

const importedFirewallArn = 'arn:aws:network-firewall:us-east-1:222222222222:firewall/TestImportedFirewall';

new NetworkFirewall(stack, 'TestFirewall', {
  firewallPolicyArn: firewallPolicyArn,
  name: 'TestFirewall',
  subnets: ['Test-Subnet-1', 'Test-Subnet-2'],
  vpcId: 'TestVpc',
  tags: [],
});

const importedFirewall = NetworkFirewall.fromAttributes(stack, 'TestImportFirewall', {
  firewallArn: importedFirewallArn,
  firewallName: 'ImportedFirewallName',
});
importedFirewall.addLogging({
  logDestinationConfigs: [
    {
      logDestinationType: 'CloudWatchLogs',
      logDestination: {
        logGroup: 'firewallAlertLogGroupArn',
      },
      logType: 'ALERT',
    },
  ],
});

importedFirewall.addNetworkFirewallRoute(
  'endpointRouteId',
  '10.0.0.6/32',
  '1',
  365,
  'routeTableId',
  new cdk.aws_kms.Key(stack, 'CloudWatchKey', {}),
);

const app = new cdk.App();
const includedStack = new cdk.Stack(app, `placeHolder`, {});
const firewallStack = new cdk.cloudformation_include.CfnInclude(includedStack, 'IncludedStack', {
  templateFile: path.join(__dirname, 'includedStacks/firewall-stack.json'),
});

NetworkFirewall.includedCfnResource(firewallStack, 'firewallLogicalId', {
  firewallPolicyArn: firewallPolicyArn,
  name: 'TestFirewall',
  subnets: ['Test-Subnet-1', 'Test-Subnet-2'],
  vpcId: 'TestVpc',
  tags: [],
});

/**
 * Network Firewall construct test
 */
describe('Network Firewall', () => {
  snapShotTest(testNamePrefix, stack);
  snapShotTest(testNamePrefix, includedStack);
});
