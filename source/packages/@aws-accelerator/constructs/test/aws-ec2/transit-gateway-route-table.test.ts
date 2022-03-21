import * as cdk from 'aws-cdk-lib';
import { SynthUtils } from '@aws-cdk/assert';
import { TransitGatewayRouteTable } from '../../lib/aws-ec2/transit-gateway-route-table';

const testNamePrefix = 'Construct(TransitGatewayRouteTable): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new TransitGatewayRouteTable(stack, 'TransitGatewayRouteTable', {
  name: 'core',
  transitGatewayId: 'tgw0001',
  tags: [{ key: 'Test-Key', value: 'Test-Value' }],
});
/**
 * TransitGatewayRouteTable construct test
 */
describe('TransitGatewayRouteTable', () => {
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
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::TransitGatewayRouteTable', 1);
  });

  /**
   * TransitGatewayRouteTable resource configuration test
   */
  test(`${testNamePrefix} TransitGatewayRouteTable resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TransitGatewayRouteTableCoreTransitGatewayRouteTableD6BC94E0: {
          Type: 'AWS::EC2::TransitGatewayRouteTable',
          Properties: {
            Tags: [
              {
                Key: 'Name',
                Value: 'core',
              },
              {
                Key: 'Test-Key',
                Value: 'Test-Value',
              },
            ],
            TransitGatewayId: 'tgw0001',
          },
        },
      },
    });
  });
});
