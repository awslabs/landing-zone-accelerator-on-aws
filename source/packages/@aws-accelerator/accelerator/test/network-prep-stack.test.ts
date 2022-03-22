import * as cdk from 'aws-cdk-lib';
import * as path from 'path';

import { SynthUtils } from '@aws-cdk/assert';

import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { NetworkPrepStack } from '../lib/stacks/network-prep-stack';
import {
  ACCOUNT_CONFIG,
  GLOBAL_CONFIG,
  IAM_CONFIG,
  NETWORK_CONFIG,
  ORGANIZATION_CONFIG,
  SECURITY_CONFIG,
} from './configs/test-config';

const testNamePrefix = 'Construct(NetworkPrepStack): ';

/**
 * NetworkPrepStack
 */
const app = new cdk.App({
  context: { 'config-dir': path.join(__dirname, 'configs') },
});
const configDirPath = app.node.tryGetContext('config-dir');

const env = {
  account: '333333333333',
  region: 'us-east-1',
};

const props: AcceleratorStackProps = {
  env,
  configDirPath,
  accountsConfig: ACCOUNT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  iamConfig: IAM_CONFIG,
  networkConfig: NETWORK_CONFIG,
  organizationConfig: ORGANIZATION_CONFIG,
  securityConfig: SECURITY_CONFIG,
  partition: 'aws',
};

const stack = new NetworkPrepStack(
  app,
  `${AcceleratorStackNames[AcceleratorStage.NETWORK_PREP]}-${env.account}-${env.region}`,
  props,
);

/**
 * NetworkPrepStack construct test
 */
describe('NetworkPrepStack', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of TransitGatewayRouteTable resource test
   */
  test(`${testNamePrefix} TransitGatewayRouteTable resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::TransitGatewayRouteTable', 4);
  });

  /**
   * Number of TransitGateway resource test
   */
  test(`${testNamePrefix} TransitGateway resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::TransitGateway', 1);
  });

  /**
   * Number of RAM ResourceShare resource test
   */
  test(`${testNamePrefix} RAM ResourceShare resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::RAM::ResourceShare', 1);
  });

  /**
   * Number of SSM parameter resource test
   */
  test(`${testNamePrefix} SSM parameter resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SSM::Parameter', 7);
  });

  /**
   * CoreTransitGatewayRouteTable TransitGatewayRouteTable resource configuration test
   */
  test(`${testNamePrefix} CoreTransitGatewayRouteTable TransitGatewayRouteTable resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CoreTransitGatewayRouteTableD73AD6A9: {
          Type: 'AWS::EC2::TransitGatewayRouteTable',
          Properties: {
            Tags: [
              {
                Key: 'Name',
                Value: 'core',
              },
            ],
            TransitGatewayId: {
              Ref: 'MainTransitGateway66204EF2',
            },
          },
        },
      },
    });
  });

  /**
   * MainTransitGateway TransitGateway resource configuration test
   */
  test(`${testNamePrefix} MainTransitGateway TransitGateway resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        MainTransitGateway66204EF2: {
          Type: 'AWS::EC2::TransitGateway',
          Properties: {
            AmazonSideAsn: 65521,
            AutoAcceptSharedAttachments: 'enable',
            DefaultRouteTableAssociation: 'disable',
            DefaultRouteTablePropagation: 'disable',
            DnsSupport: 'enable',
            Tags: [
              {
                Key: 'Name',
                Value: 'Main',
              },
            ],
            VpnEcmpSupport: 'enable',
          },
        },
      },
    });
  });

  /**
   * RAM ResourceShare MainTransitGatewayShareMainTransitGatewayShareResourceShare  resource configuration test
   */
  test(`${testNamePrefix} RAM ResourceShare MainTransitGatewayShareMainTransitGatewayShareResourceShare resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        MainTransitGatewayShareMainTransitGatewayShareResourceShareC2C21F6E: {
          Type: 'AWS::RAM::ResourceShare',
          Properties: {
            Name: 'Main_TransitGatewayShare',
            Principals: ['Sandbox-arn', '222222222222'],
            ResourceArns: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':ec2:us-east-1:333333333333:transit-gateway/',
                    {
                      Ref: 'MainTransitGateway66204EF2',
                    },
                  ],
                ],
              },
            ],
          },
        },
      },
    });
  });

  /**
   * CoreTransitGatewayRouteTable SegregatedTransitGatewayRouteTable resource configuration test
   */
  test(`${testNamePrefix} CoreTransitGatewayRouteTable SegregatedTransitGatewayRouteTable resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SegregatedTransitGatewayRouteTableFBA11CE4: {
          Type: 'AWS::EC2::TransitGatewayRouteTable',
          Properties: {
            Tags: [
              {
                Key: 'Name',
                Value: 'segregated',
              },
            ],
            TransitGatewayId: {
              Ref: 'MainTransitGateway66204EF2',
            },
          },
        },
      },
    });
  });

  /**
   * CoreTransitGatewayRouteTable SharedTransitGatewayRouteTable resource configuration test
   */
  test(`${testNamePrefix} CoreTransitGatewayRouteTable SharedTransitGatewayRouteTable resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SharedTransitGatewayRouteTableDEC04AD4: {
          Type: 'AWS::EC2::TransitGatewayRouteTable',
          Properties: {
            Tags: [
              {
                Key: 'Name',
                Value: 'shared',
              },
            ],
            TransitGatewayId: {
              Ref: 'MainTransitGateway66204EF2',
            },
          },
        },
      },
    });
  });

  /**
   * SSM parameter SsmParamMainTransitGatewayId resource configuration test
   */
  test(`${testNamePrefix} SSM parameter SsmParamMainTransitGatewayId resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParamMainTransitGatewayId76D30719: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/network/transitGateways/Main/id',
            Type: 'String',
            Value: {
              Ref: 'MainTransitGateway66204EF2',
            },
          },
        },
      },
    });
  });

  /**
   * CoreTransitGatewayRouteTable StandaloneTransitGatewayRouteTable resource configuration test
   */
  test(`${testNamePrefix} CoreTransitGatewayRouteTable StandaloneTransitGatewayRouteTable resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        StandaloneTransitGatewayRouteTableD8B42C98: {
          Type: 'AWS::EC2::TransitGatewayRouteTable',
          Properties: {
            Tags: [
              {
                Key: 'Name',
                Value: 'standalone',
              },
            ],
            TransitGatewayId: {
              Ref: 'MainTransitGateway66204EF2',
            },
          },
        },
      },
    });
  });

  /**
   * SSM parameter SsmParamMaincoreTransitGatewayRouteTableId resource configuration test
   */
  test(`${testNamePrefix} SSM parameter SsmParamMaincoreTransitGatewayRouteTableId resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParamMaincoreTransitGatewayRouteTableIdC4F7B376: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/network/transitGateways/Main/routeTables/core/id',
            Type: 'String',
            Value: {
              Ref: 'CoreTransitGatewayRouteTableD73AD6A9',
            },
          },
        },
      },
    });
  });

  /**
   * SSM parameter SsmParamMainsegregatedTransitGatewayRouteTableId resource configuration test
   */
  test(`${testNamePrefix} SSM parameter SsmParamMainsegregatedTransitGatewayRouteTableId resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParamMainsegregatedTransitGatewayRouteTableId8DCAFE8D: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/network/transitGateways/Main/routeTables/segregated/id',
            Type: 'String',
            Value: {
              Ref: 'SegregatedTransitGatewayRouteTableFBA11CE4',
            },
          },
        },
      },
    });
  });

  /**
   * SSM parameter SsmParamMainsharedTransitGatewayRouteTableId resource configuration test
   */
  test(`${testNamePrefix} SSM parameter SsmParamMainsharedTransitGatewayRouteTableId resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParamMainsharedTransitGatewayRouteTableId2B981DF1: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/network/transitGateways/Main/routeTables/shared/id',
            Type: 'String',
            Value: {
              Ref: 'SharedTransitGatewayRouteTableDEC04AD4',
            },
          },
        },
      },
    });
  });

  /**
   * SSM parameter SsmParamMainstandaloneTransitGatewayRouteTableId resource configuration test
   */
  test(`${testNamePrefix} SSM parameter SsmParamMainstandaloneTransitGatewayRouteTableId resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParamMainstandaloneTransitGatewayRouteTableIdE6B97388: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/network/transitGateways/Main/routeTables/standalone/id',
            Type: 'String',
            Value: {
              Ref: 'StandaloneTransitGatewayRouteTableD8B42C98',
            },
          },
        },
      },
    });
  });

  /**
   * SSM parameter SsmParamMainTransitGatewayId resource configuration test
   */
  test(`${testNamePrefix} SSM parameter SsmParamStackId resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParamStackId521A78D3: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/AWSAccelerator-NetworkPrepStack-333333333333-us-east-1/stack-id',
            Type: 'String',
            Value: {
              Ref: 'AWS::StackId',
            },
          },
        },
      },
    });
  });
});
