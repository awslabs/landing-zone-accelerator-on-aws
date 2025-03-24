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

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as t from './common';
import * as i from './models/customizations-config';
import { ReplacementsConfig } from './replacements-config';

export class FirewallStaticReplacementsConfig implements i.IFirewallStaticReplacementsConfig {
  readonly key: string = '';
  readonly value: string = '';
}

export class Ec2FirewallInstanceConfig implements i.IEc2FirewallInstanceConfig {
  readonly name: string = '';
  readonly launchTemplate: LaunchTemplateConfig = new LaunchTemplateConfig();
  readonly vpc: string = '';
  readonly account: string | undefined = undefined;
  readonly configFile: string | undefined = undefined;
  readonly configDir: string | undefined = undefined;
  readonly detailedMonitoring: boolean | undefined = undefined;
  readonly licenseFile: string | undefined = undefined;
  readonly staticReplacements: FirewallStaticReplacementsConfig[] | undefined = undefined;
  readonly terminationProtection: boolean | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class Ec2FirewallAutoScalingGroupConfig implements i.IEc2FirewallAutoScalingGroupConfig {
  readonly name: string = '';
  readonly autoscaling = new AutoScalingConfig();
  readonly launchTemplate = new LaunchTemplateConfig();
  readonly vpc: string = '';
  readonly account: string | undefined = undefined;
  readonly configFile: string | undefined = undefined;
  readonly configDir: string | undefined = undefined;
  readonly licenseFile: string | undefined = undefined;
  readonly staticReplacements: FirewallStaticReplacementsConfig[] | undefined = undefined;
  readonly tags: t.Tag[] | undefined = undefined;
}

export class Ec2FirewallConfig implements i.IEc2FirewallConfig {
  readonly autoscalingGroups: Ec2FirewallAutoScalingGroupConfig[] | undefined = undefined;
  readonly instances: Ec2FirewallInstanceConfig[] | undefined = undefined;
  readonly managerInstances: Ec2FirewallInstanceConfig[] | undefined = undefined;
  readonly targetGroups: TargetGroupItemConfig[] | undefined = undefined;
}

export class CloudFormationStackConfig implements i.ICloudFormationStack {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly description: string = '';
  readonly name: string = '';
  readonly regions: t.Region[] = ['us-east-1'];
  readonly runOrder: number = 1;
  readonly template: string = '';
  readonly terminationProtection: boolean = false;
  readonly parameters: t.CfnParameter[] | undefined = undefined;
}

export class CloudFormationStackSetConfig implements i.ICloudFormationStackSet {
  readonly capabilities = undefined;
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly description: string = '';
  readonly name: string = '';
  readonly regions: t.Region[] = ['us-east-1'];
  readonly template: string = '';
  readonly parameters: t.CfnParameter[] | undefined = undefined;
  readonly operationPreferences: t.OperationPreferences | undefined = undefined;
  readonly dependsOn: string[] = [];
  readonly administrationRoleArn?: string;
  readonly executionRoleName?: string;
}

export class AlbListenerFixedResponseConfig implements i.IAlbListenerFixedResponseConfig {
  readonly statusCode: string = '';
  readonly contentType: string | undefined = undefined;
  readonly messageBody: string | undefined = undefined;
}

export class AlbListenerForwardConfigTargetGroupStickinessConfig implements i.IAlbListenerTargetGroupStickinessConfig {
  readonly durationSeconds: number | undefined = undefined;
  readonly enabled: boolean | undefined = undefined;
}

export class AlbListenerForwardConfig implements i.IAlbListenerForwardConfig {
  readonly targetGroupStickinessConfig: AlbListenerForwardConfigTargetGroupStickinessConfig | undefined = undefined;
}

export class AlbListenerRedirectConfig implements i.IAlbListenerRedirectConfig {
  readonly statusCode: string | undefined = undefined;
  readonly host: string | undefined = undefined;
  readonly path: string | undefined = undefined;
  readonly port: number | undefined = undefined;
  readonly protocol: string | undefined = undefined;
  readonly query: string | undefined = undefined;
}

export class ApplicationLoadBalancerListenerConfig implements i.IAlbListenerConfig {
  readonly name: string = '';
  readonly port: number = 80;
  readonly protocol: i.AlbListenerProtocolEnum = 'HTTP';
  readonly type: i.AlbListenerTypeEnum = 'forward';
  readonly certificate: string | undefined = undefined;
  readonly sslPolicy: i.SslPolicyAlbEnum | undefined = undefined;
  readonly targetGroup: string = '';
  readonly fixedResponseConfig: AlbListenerFixedResponseConfig | undefined = undefined;
  readonly forwardConfig: AlbListenerForwardConfig | undefined = undefined;
  readonly order: number | undefined = undefined;
  readonly redirectConfig: AlbListenerRedirectConfig | undefined = undefined;
}

export class ApplicationLoadBalancerAttributesConfig implements i.IAlbAttributesConfig {
  readonly deletionProtection: boolean | undefined = undefined;
  readonly idleTimeout: number | undefined = undefined;
  readonly routingHttpDesyncMitigationMode: i.AlbRoutingHttpConfigMitigationModeEnum | undefined = undefined;
  readonly routingHttpDropInvalidHeader: boolean | undefined = undefined;
  readonly routingHttpXAmznTlsCipherEnable: boolean | undefined = undefined;
  readonly routingHttpXffClientPort: boolean | undefined = undefined;
  readonly routingHttpXffHeaderProcessingMode: i.RoutingHttpXffHeaderProcessingModeEnum | undefined = undefined;
  readonly http2Enabled: boolean | undefined = undefined;
  readonly wafFailOpen: boolean | undefined = undefined;
}

export class ApplicationLoadBalancerConfig implements i.IApplicationLoadBalancerConfig {
  readonly name: string = '';
  readonly subnets: string[] = [];
  readonly securityGroups: string[] = [];
  readonly scheme: i.AlbSchemeEnum | undefined = undefined;
  readonly attributes: ApplicationLoadBalancerAttributesConfig | undefined = undefined;
  readonly listeners: ApplicationLoadBalancerListenerConfig[] | undefined = undefined;
  readonly shareTargets: t.ShareTargets | undefined = undefined;
}

export class TargetGroupAttributeConfig implements i.ITargetGroupAttributeTypes {
  readonly deregistrationDelay: number | undefined = undefined;
  readonly stickiness: boolean | undefined = undefined;
  readonly stickinessType: i.TargetGroupAttributeStickinessType | undefined = undefined;
  readonly algorithm: i.TargetGroupAttributeAlgorithm | undefined = undefined;
  readonly slowStart: number | undefined = undefined;
  readonly appCookieName: string | undefined = undefined;
  readonly appCookieDuration: number | undefined = undefined;
  readonly lbCookieDuration: number | undefined = undefined;
  readonly connectionTermination: boolean | undefined = undefined;
  readonly preserveClientIp: boolean | undefined = undefined;
  readonly proxyProtocolV2: boolean | undefined = undefined;
  readonly targetFailover: i.TargetGroupTargetFailoverType | undefined = undefined;
}

export class TargetGroupHealthCheckConfig implements i.ITargetGroupHealthCheckType {
  readonly interval: number | undefined = undefined;
  readonly path: string | undefined = undefined;
  readonly protocol: i.TargetGroupHealthCheckProtocolType | undefined = undefined;
  readonly port: number | undefined = undefined;
  readonly timeout: number | undefined = undefined;
}

export class TargetGroupThresholdConfig implements i.ITargetGroupThresholdType {
  readonly healthy: number | undefined = undefined;
  readonly unhealthy: number | undefined = undefined;
}

export class TargetGroupMatcherConfig implements i.ITargetGroupMatcherType {
  readonly grpcCode: string | undefined = undefined;
  readonly httpCode: string | undefined = undefined;
}

export class NlbTargetTypeConfig implements i.INlbTargetType {
  readonly account: string = '';
  readonly region: string = '';
  readonly nlbName: string = '';
}

export class TargetGroupItemConfig implements i.ITargetGroupItem {
  readonly name: string = '';
  readonly port: number = 80;
  readonly protocol: i.TargetGroupProtocolType = 'TCP';
  readonly protocolVersion: i.TargetGroupProtocolVersionType | undefined = undefined;
  readonly type: i.TargetGroupType = 'instance';
  readonly attributes: TargetGroupAttributeConfig | undefined = undefined;
  readonly healthCheck: TargetGroupHealthCheckConfig | undefined = undefined;
  readonly targets: (string | NlbTargetTypeConfig)[] | undefined = undefined;
  readonly threshold: TargetGroupThresholdConfig | undefined = undefined;
  readonly matcher: TargetGroupMatcherConfig | undefined = undefined;
  readonly shareTargets: t.ShareTargets | undefined = undefined;
}

export class NetworkLoadBalancerListenerConfig implements i.INlbListenerConfig {
  readonly name: string = '';
  readonly certificate: string | undefined = undefined;
  readonly port: number | undefined = undefined;
  readonly protocol: i.NlbProtocolEnum | undefined = undefined;
  readonly alpnPolicy: i.AlpnPolicyEnum | undefined = undefined;
  readonly sslPolicy: i.SslPolicyNlbEnum | undefined = undefined;
  readonly targetGroup: string = '';
}

export class NetworkLoadBalancerConfig implements i.INetworkLoadBalancerConfig {
  readonly name: string = '';
  readonly subnets: string[] = [];
  readonly scheme: i.LoadBalancerSchemeEnum | undefined = undefined;
  readonly deletionProtection: boolean | undefined = undefined;
  readonly crossZoneLoadBalancing: boolean | undefined = undefined;
  readonly listeners: NetworkLoadBalancerListenerConfig[] | undefined = undefined;
}

export class EbsItemConfig implements i.IEbsItem {
  readonly deleteOnTermination: boolean | undefined = undefined;
  readonly encrypted: boolean | undefined = undefined;
  readonly iops: number | undefined = undefined;
  readonly kmsKeyId: string | undefined = undefined;
  readonly snapshotId: string | undefined = undefined;
  readonly throughput: number | undefined = undefined;
  readonly volumeSize: number | undefined = undefined;
  readonly volumeType: string | undefined = undefined;
}

export class BlockDeviceMappingItem implements i.IBlockDeviceMappingItem {
  readonly deviceName: string = '';
  readonly ebs: EbsItemConfig | undefined = undefined;
}

export class PrivateIpAddressConfig implements i.IPrivateIpAddressItem {
  readonly primary: boolean | undefined = undefined;
  readonly privateIpAddress: string | undefined = undefined;
}

export class NetworkInterfaceItemConfig implements i.INetworkInterfaceItem {
  readonly associateCarrierIpAddress: boolean | undefined = undefined;
  readonly associateElasticIp: boolean | undefined = undefined;
  readonly associatePublicIpAddress: boolean | undefined = undefined;
  readonly deleteOnTermination: boolean | undefined = undefined;
  readonly description: string | undefined = undefined;
  readonly deviceIndex: number | undefined = undefined;
  readonly groups: string[] | undefined = undefined;
  readonly interfaceType: string | undefined = undefined;
  readonly networkCardIndex: number | undefined = undefined;
  readonly networkInterfaceId: string | undefined = undefined;
  readonly privateIpAddress: string | undefined = undefined;
  readonly secondaryPrivateIpAddressCount: number | undefined = undefined;
  readonly sourceDestCheck: boolean | undefined = undefined;
  readonly subnetId: string | undefined = undefined;
  readonly privateIpAddresses: PrivateIpAddressConfig[] | undefined = undefined;
}

export class LaunchTemplateConfig implements i.ILaunchTemplateConfig {
  readonly name: string = '';
  readonly blockDeviceMappings: BlockDeviceMappingItem[] | undefined = undefined;
  readonly securityGroups: string[] | undefined = undefined;
  readonly keyPair: string | undefined = undefined;
  readonly iamInstanceProfile: string | undefined = undefined;
  readonly imageId: string = '';
  readonly instanceType: string = '';
  readonly enforceImdsv2: boolean | undefined = undefined;
  readonly networkInterfaces: NetworkInterfaceItemConfig[] | undefined = undefined;
  readonly userData: string | undefined = undefined;
}

export class AutoScalingConfig implements i.IAutoScalingConfig {
  readonly name: string = '';
  readonly minSize: number = 0;
  readonly maxSize: number = 4;
  readonly desiredSize: number = 2;
  readonly launchTemplate: string = '';
  readonly healthCheckGracePeriod: number | undefined = undefined;
  readonly healthCheckType: i.AutoScalingHealthCheckTypeEnum | undefined = undefined;
  readonly maxInstanceLifetime: number | undefined = undefined;
  targetGroups: string[] | undefined = undefined;
  subnets: string[] = [];
}

export class AppConfigItem implements i.IAppConfigItem {
  readonly name: string = '';
  readonly vpc: string = '';
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly targetGroups: TargetGroupItemConfig[] | undefined = undefined;
  readonly networkLoadBalancer: NetworkLoadBalancerConfig | undefined = undefined;
  readonly launchTemplate: LaunchTemplateConfig | undefined = undefined;
  readonly autoscaling: AutoScalingConfig | undefined = undefined;
  readonly applicationLoadBalancer: ApplicationLoadBalancerConfig | undefined = undefined;
}

export class PortfolioAssociationConfig implements i.IPortfolioAssociatoinConfig {
  readonly type: i.PortfolioAssociationType = 'Role';
  readonly name: string = '';
  readonly propagateAssociation: boolean = false;
}

export class ProductVersionConfig implements i.IProductVersionConfig {
  readonly name: string = '';
  readonly description: string = '';
  readonly template: string = '';
}

export class ProductSupportConfig implements i.IProductSupportConfig {
  readonly email: string | undefined = undefined;
  readonly url: string | undefined = undefined;
  readonly description: string | undefined = undefined;
}

export class TagOptionsConfig implements i.ITagOptionsConfig {
  readonly key: string = '';
  readonly values: string[] = [];
}

export class ProductLaunchConstraintConfig implements i.IProductLaunchConstraintConfig {
  readonly type: i.ProductLaunchConstraintType = 'Role';
  readonly role: string = '';
}

export class ProductConstraintConfig implements i.IProductConstraintConfig {
  launch: ProductLaunchConstraintConfig | undefined;
  tagUpdate: boolean | undefined;
  notifications: string[] | undefined;
}

export class ProductConfig implements i.IProductConfig {
  readonly name: string = '';
  readonly owner: string = '';
  readonly versions: ProductVersionConfig[] = [];
  readonly description: string | undefined = undefined;
  readonly distributor: string | undefined = undefined;
  readonly support: ProductSupportConfig | undefined = undefined;
  readonly tagOptions: TagOptionsConfig[] | undefined = undefined;
  readonly constraints: ProductConstraintConfig | undefined = undefined;
}

export class PortfolioConfig implements i.IPortfolioConfig {
  readonly name: string = '';
  readonly provider: string = '';
  readonly account: string = '';
  readonly regions: t.Region[] = [];
  readonly portfolioAssociations: PortfolioAssociationConfig[] = [];
  readonly products: ProductConfig[] = [];
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  readonly shareTagOptions: boolean | undefined = undefined;
  readonly tagOptions: TagOptionsConfig[] | undefined = undefined;
}

export class CustomizationConfig implements i.ICustomizationConfig {
  readonly cloudFormationStacks: CloudFormationStackConfig[] = [];
  readonly cloudFormationStackSets: CloudFormationStackSetConfig[] = [];
  readonly serviceCatalogPortfolios: PortfolioConfig[] = [];
}

export class CustomizationsConfig implements i.ICustomizationsConfig {
  static readonly FILENAME = 'customizations-config.yaml';

  readonly createCfnStackSetExecutionRole: boolean | undefined = undefined;
  readonly customizations: CustomizationConfig = new CustomizationConfig();
  readonly applications: AppConfigItem[] = [];
  readonly firewalls: Ec2FirewallConfig | undefined = undefined;

  /**
   *
   * @param values
   */
  constructor(values?: i.ICustomizationsConfig) {
    Object.assign(this, values);
  }

  public getCustomStacks(): CloudFormationStackConfig[] {
    return this.customizations?.cloudFormationStacks ?? [];
  }
  public getAppStacks(): AppConfigItem[] {
    return this.applications ?? [];
  }

  /**
   * Load from config file content
   * @param dir
   * @param replacementsConfig
   * @returns
   */
  static load(dir: string, replacementsConfig?: ReplacementsConfig): CustomizationsConfig {
    const initialBuffer = fs.readFileSync(path.join(dir, CustomizationsConfig.FILENAME), 'utf8');
    const buffer = replacementsConfig ? replacementsConfig.preProcessBuffer(initialBuffer) : initialBuffer;
    const values = t.parseCustomizationsConfig(yaml.load(buffer));
    return new CustomizationsConfig(values);
  }
}
