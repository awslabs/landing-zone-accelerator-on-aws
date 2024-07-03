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
 * Steps to run
 * - install cdk in the account and bootstrap it
 * - from source run
 * yarn integ-runner --update-on-failed --parallel-regions us-east-1 --directory ./packages/@aws-accelerator/constructs/test/aws-events/new-cloudwatch-log-event --language typescript --force
 * - in the target account it will create a stack, run assertion and delete the stack
 */

import * as cdk from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { ExpectedResult, IntegTest } from '@aws-cdk/integ-tests-alpha';
import { AcceleratorAspects } from '../../../../accelerator/lib/accelerator-aspects';
import { TransitGateway } from '@aws-accelerator/constructs';
/**
 * Aspect for setting all removal policies to DESTROY
 */
class ApplyDestroyPolicyAspect implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource) {
      node.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }
  }
}

// CDK App for Integration Tests
const app = new cdk.App();
export class NewTransitGatewayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);
    new TransitGateway(this, 'Tgw', {
      name: 'TestTransitGateway',
      amazonSideAsn: 65521,
      autoAcceptSharedAttachments: 'enable',
      defaultRouteTableAssociation: 'disable',
      defaultRouteTablePropagation: 'disable',
      dnsSupport: 'enable',
      transitGatewayCidrBlocks: ['10.0.0.0/20', '10.5.0.0/20', '2001:db8::/64'],
      vpnEcmpSupport: 'enable',
      tags: [{ key: 'CostCenter', value: 'Test-Value' }],
    });

    new TransitGateway(this, 'SecondaryTgw', {
      name: 'TestNoCidrBlocksTransitGateway',
      amazonSideAsn: 65522,
      autoAcceptSharedAttachments: 'disable',
      defaultRouteTableAssociation: 'disable',
      defaultRouteTablePropagation: 'disable',
      dnsSupport: 'enable',
      vpnEcmpSupport: 'enable',
      tags: [{ key: 'CostCenter', value: 'Test-Value' }],
    });

    new TransitGateway(this, 'ThirdTgw', {
      name: 'TestIpv4BlocksTransitGateway',
      amazonSideAsn: 65523,
      autoAcceptSharedAttachments: 'enable',
      defaultRouteTableAssociation: 'enable',
      defaultRouteTablePropagation: 'enable',
      transitGatewayCidrBlocks: ['10.0.0.0/20'],
      dnsSupport: 'enable',
      vpnEcmpSupport: 'enable',
      tags: [{ key: 'Test', value: 'Third' }],
    });

    new TransitGateway(this, 'FourthTgw', {
      name: 'TestIpv6BlocksTransitGateway',
      amazonSideAsn: 65524,
      autoAcceptSharedAttachments: 'enable',
      defaultRouteTableAssociation: 'enable',
      defaultRouteTablePropagation: 'enable',
      transitGatewayCidrBlocks: ['5000:aaaa::/64'],
      dnsSupport: 'disable',
      vpnEcmpSupport: 'disable',
      tags: [{ key: 'Test', value: 'Fourth' }],
    });

    cdk.Aspects.of(this).add(new ApplyDestroyPolicyAspect());
    new AcceleratorAspects(app, 'aws', false);
  }
}

// Stack under test
const stackUnderTest = new NewTransitGatewayStack(app, 'NewTransitGatewayIntegrationTestStack', {
  description: 'This stack includes the application’s resources for integration testing.',
});

/*
 * Initialize Integ Test constructs
 */

// First integration test
const integ = new IntegTest(app, 'NewTransitGatewayTest', {
  testCases: [stackUnderTest], // Define a list of cases for this test
  cdkCommandOptions: {
    deploy: {
      args: {
        rollback: false,
      },
    },
    // Customize the integ-runner parameters
    destroy: {
      args: {
        force: true,
      },
    },
  },
  regions: [stackUnderTest.region],
});

integ.assertions
  .awsApiCall('TransitGateway', 'describeTransitGateways', { Filter: 'Name=tag:Name, Values:TestTransitGateway' })
  .expect(
    ExpectedResult.objectLike({
      TransitGateways: [
        {
          Options: {
            AmazonSideAsn: 65521,
            TransitGatewayCidrBlocks: ['10.0.0.0/20', '10.5.0.0/20', '2001:db8::/64'],
            AutoAcceptSharedAttachments: 'enable',
            DefaultRouteTableAssociation: 'disable',
            DefaultRouteTablePropagation: 'disable',
            VpnEcmpSupport: 'enable',
            DnsSupport: 'enable',
          },
        },
      ],
    }),
  )
  .waitForAssertions({ totalTimeout: cdk.Duration.minutes(10) });

// Second integration test
const secondaryInteg = new IntegTest(app, 'NewSecondaryTransitGatewayTest', {
  testCases: [stackUnderTest], // Define a list of cases for this test
  cdkCommandOptions: {
    deploy: {
      args: {
        rollback: false,
      },
    },
    // Customize the integ-runner parameters
    destroy: {
      args: {
        force: true,
      },
    },
  },
  regions: [stackUnderTest.region],
});

secondaryInteg.assertions
  .awsApiCall('TransitGateway', 'describeTransitGateways', {
    Filter: 'Name=tag:Name, Values:TestNoCidrBlocksTransitGateway',
  })
  .expect(
    ExpectedResult.objectLike({
      TransitGateways: [
        {
          Options: {
            AmazonSideAsn: 65522,
            AutoAcceptSharedAttachments: 'disable',
            DefaultRouteTableAssociation: 'disable',
            DefaultRouteTablePropagation: 'disable',
            VpnEcmpSupport: 'enable',
            DnsSupport: 'enable',
          },
        },
      ],
    }),
  )
  .waitForAssertions({ totalTimeout: cdk.Duration.minutes(10) });

// Third integration test
const thirdInteg = new IntegTest(app, 'NewThirdTransitGatewayTest', {
  testCases: [stackUnderTest], // Define a list of cases for this test
  cdkCommandOptions: {
    deploy: {
      args: {
        rollback: false,
      },
    },
    // Customize the integ-runner parameters
    destroy: {
      args: {
        force: true,
      },
    },
  },
  regions: [stackUnderTest.region],
});

thirdInteg.assertions
  .awsApiCall('TransitGateway', 'describeTransitGateways', {
    Filter: 'Name=tag:Name, Values:TestIpv4BlocksTransitGateway',
  })
  .expect(
    ExpectedResult.objectLike({
      TransitGateways: [
        {
          Options: {
            AmazonSideAsn: 65523,
            TransitGatewayCidrBlocks: ['10.0.0.0/20'],
            AutoAcceptSharedAttachments: 'enable',
            DefaultRouteTableAssociation: 'enable',
            DefaultRouteTablePropagation: 'enable',
            VpnEcmpSupport: 'enable',
            DnsSupport: 'enable',
          },
        },
      ],
    }),
  )
  .waitForAssertions({ totalTimeout: cdk.Duration.minutes(10) });

// Fourth integration test
const fourthInteg = new IntegTest(app, 'NewFourthTransitGatewayTest', {
  testCases: [stackUnderTest], // Define a list of cases for this test
  cdkCommandOptions: {
    deploy: {
      args: {
        rollback: false,
      },
    },
    // Customize the integ-runner parameters
    destroy: {
      args: {
        force: true,
      },
    },
  },
  regions: [stackUnderTest.region],
});

fourthInteg.assertions
  .awsApiCall('TransitGateway', 'describeTransitGateways', {
    Filter: 'Name=tag:Name, Values:TestIpv6BlocksTransitGateway',
  })
  .expect(
    ExpectedResult.objectLike({
      TransitGateways: [
        {
          Options: {
            AmazonSideAsn: 65524,
            TransitGatewayCidrBlocks: ['5000:aaaa::/64'],
            AutoAcceptSharedAttachments: 'enable',
            DefaultRouteTableAssociation: 'enable',
            DefaultRouteTablePropagation: 'enable',
            VpnEcmpSupport: 'disable',
            DnsSupport: 'disable',
          },
        },
      ],
    }),
  )
  .waitForAssertions({ totalTimeout: cdk.Duration.minutes(10) });
