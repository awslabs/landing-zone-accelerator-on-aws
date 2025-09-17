import { describe, it, expect, beforeAll, vi } from 'vitest';

import { snapShotTest } from '../../snapshot-test';
import { Create } from '../../accelerator-test-helpers';
import { AcceleratorStage } from '../../../lib/accelerator-stage';
import path from 'path';
import fs from 'fs';
import { Template } from 'aws-cdk-lib/assertions';
import { Stack } from 'aws-cdk-lib';

describe('NetworkVpcStack tests', () => {
  let testDir: string;
  let existingTemplate: Template;
  let newTemplate: Template;

  beforeAll(() => {
    testDir = path.join(__dirname, '../../../test');

    const existingTemplateString = fs
      .readFileSync(
        path.join(
          testDir,
          'cfn-templates/666666666666/us-east-1/AWSAccelerator-NetworkVpcStack-666666666666-us-east-1.json',
        ),
      )
      .toString();
    existingTemplate = Template.fromString(existingTemplateString);

    const originalReadFileSync = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, ...args) => {
      if (typeof filePath === 'string' && filePath.startsWith('cfn-templates')) {
        const correctedPath = path.join(testDir, filePath);
        return originalReadFileSync(correctedPath, ...args);
      }
      return originalReadFileSync(filePath, ...args);
    });

    const stack = Create.stack(`Network-us-east-1`, {
      stage: AcceleratorStage.NETWORK_VPC,
      configFolderName: 'network-refactor',
    }) as Stack;
    newTemplate = Template.fromStack(stack);
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

    it.each(['AWS::EC2::Subnet', 'Custom::IpamSubnet'])('Should contains same amount of %s', (type: string) => {
      const oldTemplateCount = Object.keys(existingTemplate.findResources(type)).length;
      const newTemplateCount = Object.keys(newTemplate.findResources(type)).length;
      expect(oldTemplateCount).toEqual(newTemplateCount);
    });

    it.each(['AWS::EC2::SecurityGroup', 'AWS::EC2::SecurityGroupIngress', 'AWS::EC2::SecurityGroupEgress'])(
      'Should contains same amount of %s',
      (type: string) => {
        const oldTemplateCount = Object.keys(existingTemplate.findResources(type)).length;
        const newTemplateCount = Object.keys(newTemplate.findResources(type)).length;
        expect(oldTemplateCount).toEqual(newTemplateCount);
      },
    );
  });

  describe('NACL Resources', () => {
    it.each(['AWS::EC2::NetworkAcl', 'AWS::EC2::NetworkAclEntry', 'AWS::EC2::SubnetNetworkAclAssociation'])(
      'Should contains same amount of %s',
      (type: string) => {
        const oldTemplateCount = Object.keys(existingTemplate.findResources(type)).length;
        const newTemplateCount = Object.keys(newTemplate.findResources(type)).length;
        expect(oldTemplateCount).toEqual(newTemplateCount);
      },
    );
  });

  describe('Load Balancer Resources', () => {
    it.each(['AWS::ElasticLoadBalancingV2::LoadBalancer'])('Should contains same amount of %s', (type: string) => {
      const oldTemplateCount = Object.keys(existingTemplate.findResources(type)).length;
      const newTemplateCount = Object.keys(newTemplate.findResources(type)).length;
      expect(oldTemplateCount).toEqual(newTemplateCount);
    });
  });
});
