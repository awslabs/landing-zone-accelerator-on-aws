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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as fs from 'fs';
import { NetworkInterfaceItemConfig } from '@aws-accelerator/config';

export interface ILaunchTemplateResource extends cdk.IResource {
  /**
   * The version number.
   */
  readonly version: string;
  /**
   * The ID of the AWS::EC2::LaunchTemplate . You must specify either a LaunchTemplateName or a LaunchTemplateId .
   */
  readonly launchTemplateId: string;
  /**
   * The name of the AWS::EC2::LaunchTemplate . You must specify either a LaunchTemplateName or a LaunchTemplateId .
   */
  readonly launchTemplateName: string;
}

export type EbsProperty = {
  deleteOnTermination?: boolean;
  encrypted?: boolean;
  iops?: number;
  kmsKeyId?: string;
  snapshotId?: string;
  throughput?: number;
  volumeSize?: number;
  volumeType?: string;
};

export type BlockDeviceMappingItem = {
  deviceName: string;
  ebs?: EbsProperty;
};

export interface LaunchTemplateProps {
  /*
   * Path to user data.
   */
  readonly userData?: string;
  /*
   * VpcName
   */
  readonly vpc: string;
  /*
   * Name of Launch Template
   */
  readonly name: string;
  /*
   * Name of Application
   */
  readonly appName: string;
  readonly blockDeviceMappings?: BlockDeviceMappingItem[];
  readonly securityGroups?: string[];
  readonly networkInterfaces?: NetworkInterfaceItemConfig[];
  readonly instanceType: string;
  readonly keyPair?: string;
  readonly iamInstanceProfile?: string;
  readonly imageId: string;
  readonly enforceImdsv2?: boolean;
}

export class LaunchTemplate extends cdk.Resource implements ILaunchTemplateResource {
  public readonly version: string;
  public readonly launchTemplateId: string;
  public readonly launchTemplateName: string;

  constructor(scope: Construct, id: string, props: LaunchTemplateProps) {
    super(scope, id);

    let metadataOptions: cdk.aws_ec2.CfnLaunchTemplate.MetadataOptionsProperty;

    if (props.enforceImdsv2 === false) {
      metadataOptions = { httpTokens: 'optional' };
    } else {
      metadataOptions = { httpTokens: 'required' };
    }

    let networkInterfaceProps: cdk.aws_ec2.CfnLaunchTemplate.NetworkInterfaceProperty[] | undefined = undefined;
    if (props.networkInterfaces) {
      networkInterfaceProps = this.setNetworkInterfaceProps(props.networkInterfaces);
    }

    const launchTemplate = new cdk.aws_ec2.CfnLaunchTemplate(this, 'LaunchTemplate', {
      launchTemplateData: {
        blockDeviceMappings: props.blockDeviceMappings ?? undefined,
        securityGroupIds: props.securityGroups ?? undefined,
        networkInterfaces: networkInterfaceProps ?? undefined,
        instanceType: props.instanceType,
        keyName: props.keyPair ?? undefined,
        imageId: props.imageId,
        iamInstanceProfile: { name: props.iamInstanceProfile ?? undefined },
        userData: props.userData ? cdk.Fn.base64(fs.readFileSync(props.userData, 'utf8')) : undefined,
        metadataOptions,
      },
      launchTemplateName: props.name,
    });

    this.launchTemplateId = launchTemplate.ref;
    this.launchTemplateName = launchTemplate.launchTemplateName!;
    this.version = launchTemplate.attrLatestVersionNumber;
  }

  private setNetworkInterfaceProps(
    interfaces: NetworkInterfaceItemConfig[],
  ): cdk.aws_ec2.CfnLaunchTemplate.NetworkInterfaceProperty[] {
    const networkInterfaceProps: cdk.aws_ec2.CfnLaunchTemplate.NetworkInterfaceProperty[] = [];
    for (const networkInterface of interfaces) {
      networkInterfaceProps.push({
        associateCarrierIpAddress: networkInterface.associateCarrierIpAddress,
        associatePublicIpAddress: networkInterface.associatePublicIpAddress,
        deleteOnTermination: networkInterface.deleteOnTermination,
        description: networkInterface.description,
        deviceIndex: networkInterface.deviceIndex,
        groups: networkInterface.groups,
        interfaceType: networkInterface.interfaceType,
        networkCardIndex: networkInterface.networkCardIndex,
        networkInterfaceId: networkInterface.networkInterfaceId,
        privateIpAddress: networkInterface.privateIpAddress,
        privateIpAddresses: networkInterface.privateIpAddresses,
        secondaryPrivateIpAddressCount: networkInterface.secondaryPrivateIpAddressCount,
        subnetId: networkInterface.subnetId,
      });
    }
    return networkInterfaceProps;
  }
}
