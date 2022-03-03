import * as cdk from 'aws-cdk-lib';
import { SynthUtils } from '@aws-cdk/assert';
import { TransitGatewayRouteTableAssociation } from '../../lib/aws-ec2/transit-gateway';

const testNamePrefix = 'Construct(TransitGatewayRouteTableAssociation): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new TransitGatewayRouteTableAssociation(stack, 'TransitGatewayRouteTableAssociation', {
  transitGatewayAttachmentId: 'transitGatewayAttachmentId',
  transitGatewayRouteTableId: 'transitGatewayRouteTableId',
});
/**
 * TransitGatewayRouteTableAssociation construct test
 */
describe('TransitGatewayRouteTableAssociation', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });
  /**
   * Number of TransitGatewayRouteTableAssociation resource test
   */
  test(`${testNamePrefix} TransitGatewayRouteTableAssociation resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::TransitGatewayRouteTableAssociation', 1);
  });

  /**
   * TransitGatewayRouteTableAssociation resource configuration test
   */
  test(`${testNamePrefix} TransitGatewayRouteTableAssociation resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TransitGatewayRouteTableAssociation19E386E4: {
          Type: 'AWS::EC2::TransitGatewayRouteTableAssociation',
          Properties: {
            TransitGatewayAttachmentId: 'transitGatewayAttachmentId',
            TransitGatewayRouteTableId: 'transitGatewayRouteTableId',
          },
        },
      },
    });
  });
});
