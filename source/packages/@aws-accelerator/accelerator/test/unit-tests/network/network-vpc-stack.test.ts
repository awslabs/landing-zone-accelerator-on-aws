import { describe } from '@jest/globals';
import { snapShotTest } from '../../snapshot-test';
import { Create } from '../../accelerator-test-helpers';
import { AcceleratorStage } from '../../../lib/accelerator-stage';
import path from 'path';
import { readFileSync } from 'fs';
import { Template } from 'aws-cdk-lib/assertions';
import { Stack } from 'aws-cdk-lib';

describe('NetworkVpcStack tests', () => {
  let originalCwd: string;
  let testDir: string;
  let existingTemplate: Template;
  let newTemplate: Template;

  beforeAll(() => {
    originalCwd = process.cwd();
    testDir = path.join(process.cwd(), 'test');
    process.chdir(testDir);

    const existingTemplateString = readFileSync(
      'cfn-templates/666666666666/us-east-1/AWSAccelerator-NetworkVpcStack-666666666666-us-east-1.json',
    ).toString();
    existingTemplate = Template.fromString(existingTemplateString);

    const stack = Create.stack(`Network-us-east-1`, {
      stage: AcceleratorStage.NETWORK_VPC,
      configFolderName: 'network-refactor',
    }) as Stack;
    newTemplate = Template.fromStack(stack);
  });

  afterAll(() => {
    process.chdir(originalCwd);
  });

  snapShotTest(
    'Construct(NetworkVpcStack): ',
    Create.stackProvider(`Network-us-east-1`, {
      stage: AcceleratorStage.NETWORK_VPC,
      configFolderName: 'network-refactor',
    }),
  );

  describe('Route Table Resources', () => {
    it.each([
      'AWS::EC2::RouteTable',
      'Custom::PrefixListRoute',
      'AWS::EC2::Route',
      'AWS::EC2::LocalGatewayRouteTableVPCAssociation',
      'AWS::EC2::GatewayRouteTableAssociation',
    ])('Should contains same amount of %s', (type: string) => {
      const oldTemplateCount = Object.keys(existingTemplate.findResources(type)).length;
      const newTemplateCount = Object.keys(newTemplate.findResources(type)).length;
      expect(oldTemplateCount).toEqual(newTemplateCount);
    });
    it.each(['AWS::EC2::Subnet', 'Custom::IpamSubnet'])(
      'Should contains same amount of %s',
      (type: string) => {
        const oldTemplateCount = Object.keys(existingTemplate.findResources(type)).length;
        const newTemplateCount = Object.keys(newTemplate.findResources(type)).length;
        expect(oldTemplateCount).toEqual(newTemplateCount);
      },
    );
    // it.each(['AWS::EC2::Subnet', 'Custom::IpamSubnet', 'AWS::EC2::SubnetRouteTableAssociation'])(
    //   'Should contains same amount of %s',
    //   (type: string) => {
    //     const oldTemplateCount = Object.keys(existingTemplate.findResources(type)).length;
    //     const newTemplateCount = Object.keys(newTemplate.findResources(type)).length;
    //     expect(oldTemplateCount).toEqual(newTemplateCount);
    //   },
    // );
  });
});
