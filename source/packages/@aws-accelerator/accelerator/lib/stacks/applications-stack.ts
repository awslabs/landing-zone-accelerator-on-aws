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
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as path from 'path';
import { NagSuppressions } from 'cdk-nag';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import {
  AppConfigItem,
  VpcConfig,
  VpcTemplatesConfig,
  ApplicationLoadBalancerListenerConfig,
} from '@aws-accelerator/config';
import {
  TargetGroup,
  NetworkLoadBalancer,
  ApplicationLoadBalancer,
  LaunchTemplate,
  AutoscalingGroup,
} from '@aws-accelerator/constructs';

export type PrivateIpAddressConfig = {
  primary: boolean | undefined;
  privateIpAddress: string | undefined;
};
export type NetworkInterfaceItemConfig = {
  associateCarrierIpAddress: boolean | undefined;
  associateElasticIp: boolean | undefined;
  associatePublicIpAddress: boolean | undefined;
  deleteOnTermination: boolean | undefined;
  description: string | undefined;
  deviceIndex: number | undefined;
  groups: string[] | undefined;
  interfaceType: string | undefined;
  networkCardIndex: number | undefined;
  networkInterfaceId: string | undefined;
  privateIpAddress: string | undefined;
  secondaryPrivateIpAddressCount: number | undefined;
  sourceDestCheck: boolean | undefined;
  subnetId: string | undefined;
  privateIpAddresses: PrivateIpAddressConfig[] | undefined;
};
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
export type TargetGroupItem = {
  name: string;
  targetGroup: TargetGroup;
};

export type AlbListenerConfig = {
  name: string;
  port: number;
  protocol: 'HTTP' | 'HTTPS';
  type: 'fixed-response' | 'forward' | 'redirect';
  certificate: string | undefined;
  sslPolicy?: string;
  targetGroup: string;
  fixedResponseConfig?: {
    messageBody?: string;
    contentType?: string;
    statusCode: string;
  };
  forwardConfig?: {
    targetGroupStickinessConfig?: {
      durationSeconds?: number;
      enabled?: boolean;
    };
  };
  order?: number;
  redirectConfig?: {
    statusCode?: string;
    host?: string;
    path?: string;
    port?: number;
    protocol?: string;
    query?: string;
  };
};
export interface ApplicationStackProps extends AcceleratorStackProps {
  readonly appConfigItem: AppConfigItem;
}

export class ApplicationsStack extends AcceleratorStack {
  private securityGroupMap: Map<string, string>;
  private subnetMap: Map<string, string>;
  private vpcMap: Map<string, string>;
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);
    this.props = props;

    // Set initial private properties
    [this.securityGroupMap, this.subnetMap, this.vpcMap] = this.setInitialMaps(props);

    //Create application config resources
    this.createApplicationConfigResources(props, props.appConfigItem);

    // Create SSM parameters
    this.createSsmParameters();

    this.logger.info('Completed stack synthesis');
  }

  /**
   * Set security group, subnet, and VPC maps for this stack's account and region
   * @param props ApplicationStackProps
   * @returns Map of security group, subnet and VPC
   */
  private setInitialMaps(props: ApplicationStackProps): Map<string, string>[] {
    let securityGroupMap = new Map<string, string>();
    let subnetMap = new Map<string, string>();
    let vpcMap = new Map<string, string>();

    const allVpcItems = [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])] ?? [];
    const allAppConfigs: AppConfigItem[] = props.customizationsConfig.applications ?? [];

    for (const appConfigItem of allAppConfigs) {
      [vpcMap, subnetMap, securityGroupMap] = this.setInitialMapProcessApp(
        appConfigItem,
        allVpcItems,
        vpcMap,
        subnetMap,
        securityGroupMap,
      );
    }
    return [securityGroupMap, subnetMap, vpcMap];
  }
  private setInitialMapProcessApp(
    appConfigItem: AppConfigItem,
    allVpcItems: (VpcConfig | VpcTemplatesConfig)[],
    vpcMap: Map<string, string>,
    subnetMap: Map<string, string>,
    securityGroupMap: Map<string, string>,
  ) {
    for (const vpcItem of allVpcItems) {
      //only process items in the same vpc
      if (vpcItem.name === appConfigItem.vpc) {
        [vpcMap, subnetMap, securityGroupMap] = this.setInitialMapProcessAppVpcItem(
          vpcItem,
          vpcMap,
          subnetMap,
          securityGroupMap,
        );
      }
    }
    return [vpcMap, subnetMap, securityGroupMap];
  }

  private setInitialMapProcessAppVpcItem(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    vpcMap: Map<string, string>,
    subnetMap: Map<string, string>,
    securityGroupMap: Map<string, string>,
  ) {
    // Get account IDs
    const vpcAccountIds = this.getVpcAccountIds(vpcItem);
    if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
      // Set VPC ID
      const vpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        `/accelerator/network/vpc/${vpcItem.name}/id`,
      );
      vpcMap.set(vpcItem.name, vpcId);
      // Set subnet IDs
      for (const subnetItem of vpcItem.subnets ?? []) {
        const subnetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/vpc/${vpcItem.name}/subnet/${subnetItem.name}/id`,
        );
        subnetMap.set(`${vpcItem.name}_${subnetItem.name}`, subnetId);
      }
      // Set security group IDs
      for (const securityGroupItem of vpcItem.securityGroups ?? []) {
        const securityGroupId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/vpc/${vpcItem.name}/securityGroup/${securityGroupItem.name}/id`,
        );
        securityGroupMap.set(`${vpcItem.name}_${securityGroupItem.name}`, securityGroupId);
      }
    }
    return [vpcMap, subnetMap, securityGroupMap];
  }

  private createApplicationConfigResources(props: ApplicationStackProps, appConfigItem: AppConfigItem) {
    const allVpcItems = [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])] ?? [];
    const accessLogsBucket = `${
      AcceleratorStack.ACCELERATOR_ELB_LOGS_BUCKET_PREFIX
    }-${this.props.accountsConfig.getLogArchiveAccountId()}-${this.props.centralizedLoggingRegion}`;

    for (const vpcItem of allVpcItems) {
      if (vpcItem.name === appConfigItem.vpc) {
        // Get account IDs
        const vpcAccountIds = this.getVpcAccountIds(vpcItem);

        if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
          // Create target group resource
          const targetGroups = this.createTargetGroup(appConfigItem);
          // Create network load balancer resource
          this.createNetworkLoadBalancer(appConfigItem, targetGroups, accessLogsBucket);
          // Create application load balancer resource
          this.createApplicationLoadBalancer(appConfigItem, targetGroups, accessLogsBucket);
          // create launch template resource
          const lt = this.createLaunchTemplate(appConfigItem);
          // create autoscaling group resource
          this.createAutoScalingGroup(appConfigItem, targetGroups, lt);
        }
      }
    }
  }
  private createApplicationLoadBalancer(
    appConfigItem: AppConfigItem,
    targetGroups: TargetGroupItem[] | undefined,
    accessLogsBucket: string,
  ) {
    if (appConfigItem.applicationLoadBalancer) {
      const subnets = this.getSubnets(appConfigItem.applicationLoadBalancer.subnets ?? [], appConfigItem.vpc);
      const getSecurityGroups = this.getSecurityGroups(
        appConfigItem.applicationLoadBalancer.securityGroups ?? [],
        appConfigItem.vpc,
      );

      new ApplicationLoadBalancer(this, `ApplicationLoadBalancer_${appConfigItem.name}`, {
        name: appConfigItem.applicationLoadBalancer.name,
        subnets,
        securityGroups: getSecurityGroups!,
        scheme: appConfigItem.applicationLoadBalancer.scheme! ?? 'internal',
        accessLogsBucket,
        attributes: appConfigItem.applicationLoadBalancer.attributes ?? undefined,
        listeners: this.getAlbListenerTargetGroupArn(
          appConfigItem.applicationLoadBalancer?.listeners ?? undefined,
          targetGroups,
        ),
      });
    }
  }
  private getAlbListenerTargetGroupArn(
    listeners: AlbListenerConfig[] | undefined,
    targetGroups: TargetGroupItem[] | undefined,
  ) {
    const output = [];
    if (listeners) {
      for (const listener of listeners) {
        const targetGroupValues = targetGroups! ?? [];
        const filteredTargetGroup = targetGroupValues.find(element => {
          return element.name === listener.targetGroup;
        });
        if (!filteredTargetGroup) {
          this.logger.error(`ALB Listener ${listener.name} does not have a valid target group ${listener.targetGroup}`);
          throw new Error(`Configuration validation failed at runtime..`);
        }
        listener.targetGroup = filteredTargetGroup.targetGroup.targetGroupArn;
        output.push(listener as ApplicationLoadBalancerListenerConfig);
      }
    } else {
      return undefined;
    }
    if (output.length > 0) {
      return output;
    } else {
      return undefined;
    }
  }

  private createLaunchTemplate(appConfigItem: AppConfigItem) {
    if (appConfigItem.launchTemplate) {
      const getSecurityGroups = this.getSecurityGroups(
        appConfigItem.launchTemplate.securityGroups ?? [],
        appConfigItem.vpc,
      );
      return new LaunchTemplate(
        this,
        `LaunchTemplate-${pascalCase(appConfigItem.name)}-${pascalCase(appConfigItem.launchTemplate.name)}`,
        {
          name: appConfigItem.launchTemplate.name,
          appName: appConfigItem.name,
          vpc: appConfigItem.vpc,
          blockDeviceMappings: this.processBlockDeviceReplacements(
            appConfigItem.launchTemplate.blockDeviceMappings ?? [],
            appConfigItem.name,
          ),
          userData: path.join(this.props.configDirPath, appConfigItem.launchTemplate.userData!) ?? undefined,
          securityGroups: getSecurityGroups ?? undefined,
          networkInterfaces:
            this.replaceNetworkInterfaceValues(
              appConfigItem.launchTemplate.networkInterfaces ?? [],
              appConfigItem.vpc,
            ) ?? undefined,
          instanceType: appConfigItem.launchTemplate.instanceType,
          keyPair: appConfigItem.launchTemplate.keyPair ?? undefined,
          iamInstanceProfile: appConfigItem.launchTemplate.iamInstanceProfile ?? undefined,
          imageId: this.replaceImageId(appConfigItem.launchTemplate.imageId ?? ''),
          enforceImdsv2: appConfigItem.launchTemplate.enforceImdsv2 ?? true,
        },
      );
    } else {
      return undefined;
    }
  }
  private replaceNetworkInterfaceValues(networkInterfaces: NetworkInterfaceItemConfig[], vpc: string) {
    for (const networkInterface of networkInterfaces) {
      const securityGroups: string[] | undefined = this.getSecurityGroups(networkInterface.groups! ?? [], vpc);
      if (securityGroups) {
        networkInterface.groups = securityGroups;
      }
      if (networkInterface.subnetId) {
        const subnetIdValue = this.subnetMap.get(`${vpc}_${networkInterface.subnetId}`);
        if (!subnetIdValue) {
          this.logger.error(`Network Interfaces: subnet ${networkInterface.subnetId} not found in VPC ${vpc}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
      }
    }
    if (networkInterfaces.length === 0) {
      return undefined;
    } else {
      return networkInterfaces;
    }
  }

  private createAutoScalingGroup(
    appConfigItem: AppConfigItem,
    targetGroupsInput: TargetGroupItem[] | undefined,
    lt: LaunchTemplate | undefined,
  ) {
    if (appConfigItem.autoscaling) {
      const targetGroupValues = targetGroupsInput!.map(obj => {
        return obj.targetGroup.targetGroupArn;
      });
      let targetGroups: string[] | undefined;
      if (targetGroupValues.length === 0) {
        targetGroups = undefined;
      } else {
        targetGroups = targetGroupValues;
      }
      const subnets: string[] = [];
      for (const subnet of appConfigItem.autoscaling.subnets ?? []) {
        const subnetId = this.subnetMap.get(`${appConfigItem.vpc}_${subnet}`);
        if (!subnetId) {
          this.logger.error(`Create Autoscaling Groups: subnet ${subnet} not found in VPC ${appConfigItem.vpc}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
        subnets.push(subnetId);
      }

      if (lt === undefined) {
        this.logger.error(` Launch template is undefined for ${appConfigItem.name}`);
        throw new Error(`Configuration validation failed at runtime.`);
      }

      new AutoscalingGroup(
        this,
        `AutoScalingGroup${pascalCase(appConfigItem.name)}${pascalCase(appConfigItem.autoscaling.name)}`,
        {
          name: appConfigItem.autoscaling.name,
          minSize: appConfigItem.autoscaling.minSize,
          maxSize: appConfigItem.autoscaling.maxSize,
          desiredSize: appConfigItem.autoscaling.desiredSize,
          launchTemplateVersion: lt.version,
          launchTemplateId: lt.launchTemplateId,
          healthCheckGracePeriod: appConfigItem.autoscaling.healthCheckGracePeriod ?? undefined,
          healthCheckType: appConfigItem.autoscaling.healthCheckType ?? undefined,
          targetGroups,
          subnets,
        },
      );
    }

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/AutoScalingGroup${pascalCase(appConfigItem.name)}${pascalCase(
        appConfigItem.autoscaling!.name,
      )}/Resource`,
      [
        {
          id: 'AwsSolutions-AS3',
          reason: 'Scaling policies are not offered as a part of this solution',
        },
      ],
    );
  }

  private createNetworkLoadBalancer(
    appConfigItem: AppConfigItem,
    targetGroups: TargetGroupItem[] | undefined,
    accessLogsBucket: string,
  ) {
    if (appConfigItem.networkLoadBalancer) {
      const subnets = this.getSubnets(appConfigItem.networkLoadBalancer.subnets ?? [], appConfigItem.vpc);
      const nlb = new NetworkLoadBalancer(
        this,
        pascalCase(`AppNlb${appConfigItem.name}${appConfigItem.networkLoadBalancer?.name}`),
        {
          name: appConfigItem.networkLoadBalancer?.name,
          appName: appConfigItem.name,
          vpcName: appConfigItem.vpc,
          subnets: subnets,
          scheme: appConfigItem.networkLoadBalancer?.scheme ?? undefined,
          deletionProtection: appConfigItem.networkLoadBalancer.deletionProtection ?? undefined,
          crossZoneLoadBalancing: appConfigItem.networkLoadBalancer.crossZoneLoadBalancing ?? undefined,
          accessLogsBucket,
        },
      );

      for (const listener of appConfigItem.networkLoadBalancer.listeners ?? []) {
        const targetGroupValues = targetGroups! ?? [];
        const filteredTargetGroup = targetGroupValues.find(element => {
          return element.name === listener.targetGroup;
        });
        if (!filteredTargetGroup) {
          this.logger.error(`NLB Listener ${listener.name} does not have a valid target group ${listener.targetGroup}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
        new cdk.aws_elasticloadbalancingv2.CfnListener(
          this,
          pascalCase(`Listener${appConfigItem.name}${listener.name}`),
          {
            defaultActions: [
              {
                type: 'forward',
                forwardConfig: {
                  targetGroups: [
                    {
                      targetGroupArn: filteredTargetGroup.targetGroup.targetGroupArn,
                    },
                  ],
                },
                targetGroupArn: filteredTargetGroup.targetGroup.targetGroupArn,
              },
            ],
            loadBalancerArn: nlb.networkLoadBalancerArn,
            alpnPolicy: [listener.alpnPolicy!],
            certificates: [{ certificateArn: this.getCertificate(listener.certificate) }],
            port: listener.port!,
            protocol: listener.protocol!,
            sslPolicy: listener.sslPolicy!,
          },
        );
      }
    }
  }

  private getCertificate(certificate: string | undefined) {
    if (certificate) {
      //check if user provided arn. If so do nothing, if not get it from ssm
      if (certificate.match('\\arn:*')) {
        return certificate;
      } else {
        return cdk.aws_ssm.StringParameter.valueForStringParameter(this, `/accelerator/acm/${certificate}/arn`);
      }
    }
    return undefined;
  }
  private getSubnets(subnets: string[], vpc: string) {
    const output: string[] = [];
    for (const subnet of subnets ?? []) {
      const subnetId = this.subnetMap.get(`${vpc}_${subnet}`);
      if (!subnetId) {
        this.logger.error(`Subnet ${subnet} not found in VPC ${vpc}`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
      output.push(subnetId);
    }
    return output;
  }
  private getSecurityGroups(securityGroups: string[], vpc: string) {
    const output: string[] = [];
    for (const sg of securityGroups ?? []) {
      const sgId = this.securityGroupMap.get(`${vpc}_${sg}`);
      if (!sgId) {
        this.logger.error(`Security group ${sg} does not exist in VPC ${vpc}`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
      output.push(sgId);
    }
    if (output.length === 0) {
      return undefined;
    } else {
      return output;
    }
  }

  private createTargetGroup(appConfigItem: AppConfigItem) {
    const output = [];
    const vpcId = this.vpcMap.get(appConfigItem.vpc);
    if (!vpcId) {
      this.logger.error(`Unable to locate VPC ${appConfigItem.vpc}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
    if (appConfigItem.targetGroups) {
      for (const targetGroup of appConfigItem.targetGroups) {
        const tg = new TargetGroup(this, pascalCase(`AppTargetGroup${appConfigItem.name}${targetGroup.name}`), {
          name: targetGroup.name,
          port: targetGroup.port,
          protocol: targetGroup.protocol,
          protocolVersion: targetGroup.protocolVersion! || undefined,
          type: targetGroup.type,
          attributes: targetGroup.attributes ?? undefined,
          healthCheck: targetGroup.healthCheck ?? undefined,
          threshold: targetGroup.threshold ?? undefined,
          matcher: targetGroup.matcher ?? undefined,
          vpc: vpcId,
        });
        const outputItem = { name: targetGroup.name, targetGroup: tg };
        output.push(outputItem);

        this.ssmParameters.push({
          logicalId: pascalCase(`SsmTg${appConfigItem.name}${appConfigItem.vpc}${targetGroup.name}Arn`),
          parameterName: `/accelerator/application/targetGroup/${appConfigItem.name}/${appConfigItem.vpc}/${targetGroup.name}/arn`,
          stringValue: tg.targetGroupArn,
        });
      }
    }
    if (output.length === 0) {
      return undefined;
    } else {
      return output;
    }
  }
}
