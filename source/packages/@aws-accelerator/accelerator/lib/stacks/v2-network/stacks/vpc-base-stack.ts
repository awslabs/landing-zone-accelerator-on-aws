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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

import { pascalCase } from 'pascal-case';

import { AcceleratorKeyType, AcceleratorStack, NagSuppressionRuleIds } from '../../accelerator-stack';
import { ipamPoolIdType, V2NetworkStacksBaseProps } from '../utils/types';
import { SsmResourceType, MetadataKeys } from '@aws-accelerator/utils';
import {
  SsmParameterLookup,
  IResourceShareItem,
  ResourceShare,
  ResourceShareItem,
  ResourceShareOwner,
  DeleteDefaultSecurityGroupRules,
  LzaLambda,
  VpnConnection,
  VpnConnectionProps,
  VpnTunnelOptionsSpecifications,
  CloudWatchLogGroups,
  PutSsmParameter,
  SsmParameterProps,
} from '@aws-accelerator/constructs';
import { VpcDetails } from '../constructs/vpc-details';
import {
  CustomerGatewayConfig,
  IpamAllocationConfig,
  VpcConfig,
  VpcIpv6Config,
  VpcTemplatesConfig,
  VpnConnectionConfig,
  VpcFlowLogsConfig,
} from '@aws-accelerator/config';
import { hasAdvancedVpnOptions, isIpv4 } from '../../network-stacks/utils/validation-utils';
import { getFirewallInstanceConfig } from '../../network-stacks/utils/getter-utils';
import { NetworkStackGeneration, V2StackComponentsList } from '../utils/enums';
import { isV2Resource } from '../utils/functions';

export class VpcBaseStack extends AcceleratorStack {
  private v2StackProps: V2NetworkStacksBaseProps;
  private vpcDetails: VpcDetails;

  private vpc: cdk.aws_ec2.CfnVPC | undefined;
  private vpcId: string;
  private cloudwatchKey: cdk.aws_kms.IKey | undefined;
  private lambdaKey: cdk.aws_kms.IKey | undefined;
  private ipamPoolIds: ipamPoolIdType[] = [];
  private logRetentionInDays: number;
  private virtualPrivateGatewayId: string | undefined;

  constructor(scope: Construct, id: string, props: V2NetworkStacksBaseProps) {
    super(scope, id, props);
    this.v2StackProps = props;

    this.logRetentionInDays = this.props.globalConfig.cloudwatchLogRetentionInDays;
    this.cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);
    this.lambdaKey = this.getAcceleratorKey(AcceleratorKeyType.LAMBDA_KEY);
    this.vpcDetails = new VpcDetails(this, 'VpcDetails', props);
    this.ipamPoolIds = this.getIpamPoolIds();

    //
    // Add Stack metadata
    //
    this.addMetadata(MetadataKeys.LZA_LOOKUP, {
      accountName: this.props.accountsConfig.getAccountNameById(this.account),
      region: cdk.Stack.of(this).region,
      stackGeneration: NetworkStackGeneration.V2,
    });

    //
    // Create VPC
    //
    const vpcDetails = this.createOrGetVpc();
    this.vpc = vpcDetails.vpc;
    this.vpcId = vpcDetails.id;

    if (this.vpcDetails.egressOnlyIgw) {
      this.addEgressOnlyIgw();
    }

    if (this.vpcDetails.internetGateway) {
      this.addInternetGateway();
    }

    if (this.vpcDetails.virtualPrivateGateway) {
      this.addVirtualPrivateGateway(this.vpcDetails.virtualPrivateGateway.asn);
    }

    if (this.vpcDetails.dhcpOptionName) {
      this.addDhcpOptions(this.vpcDetails.dhcpOptionName);
    }

    this.createAdditionalIpv4Cidrs();

    this.createIpv6Cidrs();

    if (this.vpcDetails.useCentralEndpoints) {
      this.addCentralEndpointTags();
    }

    this.addVpcFlowLogs();

    if (this.vpcDetails.deleteDefaultSecurityGroup) {
      this.deleteDefaultSecurityGroupRules();
    }

    //
    // Create VPN custom resource handler if needed
    const customResourceHandler = this.vpcDetails.advancedVpnTypes.includes('vpc')
      ? this.createVpnOnEventHandler()
      : undefined;

    //
    // Create VPN connections
    this.createVpnConnections(customResourceHandler);

    //
    // Create cross-account/cross-region SSM parameters
    //
    this.createSharedParameters();

    //
    // Create SSM Parameters
    //
    this.createSsmParameters();

    //
    // Create NagSuppressions
    //
    this.addResourceSuppressionsByPath();
  }

  /**
   * Function to get central endpoint vpc account id
   * @returns
   */
  private getCentralEndpointVpcAccountId(): string {
    const centralEndpointVpcAccountIds: string[] = [];
    if (this.vpcDetails.useCentralEndpoints) {
      if (!this.vpcDetails.centralEndpointVpc) {
        const errorMessage = 'Attempting to use central endpoints with no Central Endpoints defined.';
        this.logger.error(errorMessage);
        throw new Error(`Configuration validation failed at runtime. ${errorMessage}`);
      }
      centralEndpointVpcAccountIds.push(...this.getVpcAccountIds(this.vpcDetails.centralEndpointVpc));
      if (centralEndpointVpcAccountIds.length !== 1) {
        const errorMessage =
          'Attempting to use central endpoints without an account ID for the Central Endpoints defined.';
        this.logger.error(errorMessage);
        throw new Error(`Configuration validation failed at runtime. ${errorMessage}`);
      }
    }
    return centralEndpointVpcAccountIds[0];
  }

  /**
   * Function to create v2 stack specific vpc or get existing vpc id
   * @returns
   */
  private createOrGetVpc(): { vpc: cdk.aws_ec2.CfnVPC | undefined; id: string } {
    if (isV2Resource(this.v2StackProps.v2NetworkResources, this.vpcDetails.name, V2StackComponentsList.VPC)) {
      this.logger.info(`Creating VPC ${this.vpcDetails.name} in stack ${this.stackName}`);
      let ipv4IpamPoolId: string | undefined;
      let ipv4NetmaskLength: number | undefined;

      if (this.vpcDetails.ipamAllocations.length > 0) {
        const vpcIpamPoolDetails = this.getVpcIpamPoolDetails(this.vpcDetails.ipamAllocations);
        ipv4IpamPoolId = vpcIpamPoolDetails.id;
        ipv4NetmaskLength = vpcIpamPoolDetails.netmaskLength;
      }

      const cfnVPC = new cdk.aws_ec2.CfnVPC(this, pascalCase(`${this.vpcDetails.name}Vpc`), {
        cidrBlock: this.vpcDetails.primaryCidr,
        enableDnsHostnames: this.vpcDetails.enableDnsHostnames,
        enableDnsSupport: this.vpcDetails.enableDnsSupport,
        instanceTenancy: this.vpcDetails.instanceTenancy,
        ipv4IpamPoolId,
        ipv4NetmaskLength,
        tags: [{ key: 'Name', value: this.vpcDetails.name }, ...(this.vpcDetails.tags ?? [])],
      });

      cfnVPC.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.VPC,
        vpcName: this.vpcDetails.name,
      });

      this.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(this.vpcDetails.name)}VpcId`),
        parameterName: this.getSsmPath(SsmResourceType.VPC, [this.vpcDetails.name]),
        stringValue: cfnVPC.ref,
      });

      if (this.vpcDetails.primaryCidr) {
        this.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(this.vpcDetails.name)}VpcIpv4CidrBlock`),
          parameterName: this.getSsmPath(SsmResourceType.VPC_IPV4_CIDR_BLOCK, [this.vpcDetails.name]),
          stringValue: this.vpcDetails.primaryCidr,
        });
      }

      return { vpc: cfnVPC, id: cfnVPC.ref };
    } else {
      this.logger.info(`Using existing VPC ${this.vpcDetails.name} in stack ${this.stackName}`);
      const vpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.VPC, [this.vpcDetails.name]),
      );

      return {
        vpc: undefined,
        id: vpcId,
      };
    }
  }

  /**
   * Function to add egress only IGW
   */
  private addEgressOnlyIgw(): void {
    if (
      isV2Resource(this.v2StackProps.v2NetworkResources, this.vpcDetails.name, V2StackComponentsList.EGRESS_ONLY_IGW)
    ) {
      this.logger.info(`Adding Egress Only Internet Gateway to VPC ${this.vpcDetails.name} in stack ${this.stackName}`);
      const egressOnlyIgw = new cdk.aws_ec2.CfnEgressOnlyInternetGateway(
        this,
        `${this.vpcDetails.name}VpcEgressOnlyIgw`,
        {
          vpcId: this.vpcId,
        },
      );

      this.addSsmParameter({
        logicalId: pascalCase(`SsmParam${this.vpcDetails.name}EgressOnlyIgwId`),
        parameterName: this.getSsmPath(SsmResourceType.VPC_EGRESS_ONLY_IGW, [this.vpcDetails.name]),
        stringValue: egressOnlyIgw.ref,
      });

      egressOnlyIgw.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.EGRESS_ONLY_IGW,
        vpcName: this.vpcDetails.name,
      });
    }
  }

  /**
   * Function to add IGW
   */
  private addInternetGateway(): void {
    if (
      isV2Resource(this.v2StackProps.v2NetworkResources, this.vpcDetails.name, V2StackComponentsList.INTERNET_GATEWAY)
    ) {
      this.logger.info(`Adding Internet Gateway to VPC ${this.vpcDetails.name} in stack ${this.stackName}`);
      const cfnInternetGateway = new cdk.aws_ec2.CfnInternetGateway(this, `${this.vpcDetails.name}VpcInternetGateway`, {
        tags: [{ key: 'Name', value: this.vpcDetails.name }, ...(this.vpcDetails.tags ?? [])],
      });

      const internetGatewayId = cfnInternetGateway.ref;

      const cfnVPCGatewayAttachment = new cdk.aws_ec2.CfnVPCGatewayAttachment(
        this,
        `${this.vpcDetails.name}VpcInternetGatewayAttachment`,
        {
          vpcId: this.vpcId,
          internetGatewayId: internetGatewayId,
        },
      );

      this.addSsmParameter({
        logicalId: pascalCase(`SsmParam${this.vpcDetails.name}InternetGatewayId`),
        parameterName: this.getSsmPath(SsmResourceType.IGW, [this.vpcDetails.name]),
        stringValue: internetGatewayId,
      });

      cfnVPCGatewayAttachment.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.INTERNET_GATEWAY_ATTACHMENT,
        vpcName: this.vpcDetails.name,
      });
    }
  }

  /**
   * Function to add virtual private gateway
   * @param asn
   */
  private addVirtualPrivateGateway(asn?: number): void {
    if (
      isV2Resource(
        this.v2StackProps.v2NetworkResources,
        this.vpcDetails.name,
        V2StackComponentsList.VIRTUAL_PRIVATE_GATEWAY,
      )
    ) {
      this.logger.info(`Adding Virtual Private Gateway to VPC ${this.vpcDetails.name} in stack ${this.stackName}`);
      const vpnGateway = new cdk.aws_ec2.VpnGateway(this, `${this.vpcDetails.name}VpcVirtualPrivateGateway`, {
        amazonSideAsn: asn,
        type: 'ipsec.1',
      });

      this.virtualPrivateGatewayId = vpnGateway.gatewayId;

      const cfnVPCGatewayAttachment = new cdk.aws_ec2.CfnVPCGatewayAttachment(
        this,
        `${this.vpcDetails.name}VpcVirtualPrivateGatewayAttachment`,
        {
          vpcId: this.vpcId,
          vpnGatewayId: this.virtualPrivateGatewayId,
        },
      );

      this.addSsmParameter({
        logicalId: pascalCase(`SsmParam${this.vpcDetails.name}VpcVirtualPrivateGatewayId`),
        parameterName: this.getSsmPath(SsmResourceType.VPN_GW, [this.vpcDetails.name]),
        stringValue: this.virtualPrivateGatewayId,
      });

      cfnVPCGatewayAttachment.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.VIRTUAL_PRIVATE_GATEWAY_ATTACHMENT,
        vpcName: this.vpcDetails.name,
        virtualPrivateGatewayId: this.virtualPrivateGatewayId,
        asn,
      });
    }
  }

  /**
   * Function to add dhcp options
   * @param dhcpOptionName
   */
  private addDhcpOptions(dhcpOptionName: string): void {
    if (
      isV2Resource(
        this.v2StackProps.v2NetworkResources,
        this.vpcDetails.name,
        V2StackComponentsList.VPC_DHCP_OPTIONS_ASSOCIATION,
        dhcpOptionName,
      )
    ) {
      this.logger.info(
        `Associating DHCP option ${dhcpOptionName} to VPC ${this.vpcDetails.name} in stack ${this.stackName}`,
      );
      const dhcpOptionsId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.DHCP_OPTION_ID, [dhcpOptionName]),
      );

      const cfnVPCDHCPOptionsAssociation = new cdk.aws_ec2.CfnVPCDHCPOptionsAssociation(
        this,
        `${this.vpcDetails.name}VpcDhcpOptionsAssociation`,
        {
          dhcpOptionsId,
          vpcId: this.vpcId,
        },
      );

      cfnVPCDHCPOptionsAssociation.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.VPC_DHCP_OPTIONS_ASSOCIATION,
        vpcName: this.vpcDetails.name,
        dhcpOptionsId,
      });
    }
  }

  /**
   * Function to create additional IPV4 CIDRs
   */
  private createAdditionalIpv4Cidrs(): void {
    if (this.vpcDetails.cidrs && this.vpcDetails.cidrs.length > 1) {
      let index = 1;
      for (const cidr of this.vpcDetails.cidrs.slice(1)) {
        if (
          isV2Resource(
            this.v2StackProps.v2NetworkResources,
            this.vpcDetails.name,
            V2StackComponentsList.ADDITIONAL_CIDR_BLOCK,
            cidr,
          )
        ) {
          this.logger.info(
            `Adding additional IPV4 cidr ${cidr} to VPC ${this.vpcDetails.name} in stack ${this.stackName}`,
          );
          this.addIpv4Cidr({
            logicalId: pascalCase(`${this.vpcDetails.name}StaticVpcCidrBlock${index}`),
            cidrBlock: cidr,
          });
          index++;
        }
      }
    }

    // IPAM allocations
    if (this.vpcDetails.ipamAllocations.length > 1) {
      const newIpamAllocations = this.v2StackProps.v2NetworkResources.filter(
        item =>
          item.resourceType === V2StackComponentsList.ADDITIONAL_IPAM_ALLOCATION &&
          item.vpcName === this.vpcDetails.name,
      );

      for (const newIpamAllocation of newIpamAllocations) {
        const newIpamAllocationArray = newIpamAllocation.resourceName!.split('|');
        const ipamPoolName = newIpamAllocationArray[0];
        const netmaskLength = Number(newIpamAllocationArray[1]);
        const index = Number(newIpamAllocationArray[2]);
        const poolDetails = this.ipamPoolIds.find(item => item.name === ipamPoolName);

        if (!poolDetails) {
          this.logger.error(`VPC ${this.vpcDetails.name} IPAM pool ${ipamPoolName} not found`);
          throw new Error(
            `Configuration validation failed at runtime. VPC ${this.vpcDetails.name} IPAM pool not found`,
          );
        }

        this.logger.info(
          `Adding additional IPv4 CIDR from IPAM pool ${ipamPoolName} with ${netmaskLength} netmaskLength to VPC ${this.vpcDetails.name} in stack ${this.stackName}`,
        );
        this.addIpv4Cidr({
          logicalId: pascalCase(`${this.vpcDetails.name}IpamVpcCidrBlock${ipamPoolName}${netmaskLength}${index}`),
          ipv4IpamPoolId: poolDetails.id,
          ipv4NetmaskLength: netmaskLength,
        });
      }
    }
  }

  /**
   * Function to create IPV6 cidrs
   */
  private createIpv6Cidrs(): void {
    if (this.vpcDetails.ipv6Cidrs.length > 0) {
      const amazonProvidedCidrs = this.vpcDetails.ipv6Cidrs.filter(cidrItem => cidrItem.amazonProvided);

      amazonProvidedCidrs.map((cidrItem, index) => {
        if (
          isV2Resource(
            this.v2StackProps.v2NetworkResources,
            this.vpcDetails.name,
            V2StackComponentsList.ADDITIONAL_CIDR_BLOCK,
            `amazonProvided|${index}`,
          )
        ) {
          this.logger.info(
            `Adding additional amazonProvided IPV6 cidr to VPC ${this.vpcDetails.name} in stack ${this.stackName}`,
          );
          this.addIpv6Cidr(index, cidrItem);
        }
      });

      const byoipPoolCidrs = this.vpcDetails.ipv6Cidrs.filter(cidrItem => cidrItem.byoipPoolId && cidrItem.cidrBlock);

      byoipPoolCidrs.map((cidrItem, index) => {
        if (
          isV2Resource(
            this.v2StackProps.v2NetworkResources,
            this.vpcDetails.name,
            V2StackComponentsList.ADDITIONAL_CIDR_BLOCK,
            `${cidrItem.byoipPoolId}|${cidrItem.cidrBlock}|${index}`,
          )
        ) {
          this.logger.info(
            `Adding additional IPAM IPV6 cidr ${cidrItem.cidrBlock} form IPAM pool ${cidrItem.byoipPoolId} to VPC ${this.vpcDetails.name} in stack ${this.stackName}`,
          );
          this.addIpv6Cidr(index, cidrItem);
        }
      });
    }
  }

  /**
   * Function to add VPC flow logs
   */
  private addVpcFlowLogs(): void {
    if (this.vpcDetails.vpcFlowLogsConfig) {
      this.createVpcFlowLogs(this.vpcDetails.vpcFlowLogsConfig);
    } else {
      if (this.vpc) {
        NagSuppressions.addResourceSuppressions(this.vpc, [
          { id: 'AwsSolutions-VPC7', reason: 'VPC does not have flow logs configured' },
        ]);
      }
    }
  }

  /**
   * Function to configure delete default security group rules
   */
  private deleteDefaultSecurityGroupRules(): void {
    if (
      isV2Resource(
        this.v2StackProps.v2NetworkResources,
        this.vpcDetails.name,
        V2StackComponentsList.DELETE_DEFAULT_SECURITY_GROUP_RULES,
      )
    ) {
      this.logger.info(
        `Delete default security group ingress and egress rules for ${this.vpcDetails.name} in stack ${this.stackName}`,
      );
      const deleteDefaultSecurityGroupRules = new DeleteDefaultSecurityGroupRules(
        this,
        pascalCase(`DeleteSecurityGroupRules-${this.vpcDetails.name}`),
        {
          vpcId: this.vpcId,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetentionInDays,
        },
      );

      const cfnResource = deleteDefaultSecurityGroupRules.resource.node.defaultChild as cdk.CfnResource;

      cfnResource.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.DELETE_DEFAULT_SECURITY_GROUP_RULES,
        vpcName: this.vpcDetails.name,
      });
    }
  }

  /**
   * Creates a custom resource onEventHandler for VPN connections
   * requiring advanced configuration parameters
   * @returns cdk.aws_lambda.IFunction
   */
  private createVpnOnEventHandler(): cdk.aws_lambda.IFunction {
    const lambdaExecutionPolicy = cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AWSLambdaBasicExecutionRole',
    );

    const managedVpnPolicy = new cdk.aws_iam.ManagedPolicy(this, 'VpnOnEventHandlerPolicy', {
      statements: [
        new cdk.aws_iam.PolicyStatement({
          sid: 'S2SVPNCRUD',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'ec2:CreateTags',
            'ec2:CreateVpnConnection',
            'ec2:DeleteTags',
            'ec2:DeleteVpnConnection',
            'ec2:DescribeVpnConnections',
            'ec2:ModifyVpnConnectionOptions',
            'ec2:ModifyVpnTunnelOptions',
          ],
          resources: ['*'],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'LogDeliveryCRUD',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogDelivery',
            'logs:GetLogDelivery',
            'logs:UpdateLogDelivery',
            'logs:DeleteLogDelivery',
            'logs:ListLogDeliveries',
          ],
          resources: ['*'],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'S2SVPNLoggingCWL',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:PutResourcePolicy', 'logs:DescribeResourcePolicies', 'logs:DescribeLogGroups'],
          resources: ['*'],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'S2SVPNAssumeRole',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [
            `arn:${this.partition}:iam::*:role/${this.acceleratorResourceNames.roles.crossAccountVpnRoleName}`,
          ],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'SecretsManagerReadOnly',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue', 'kms:Decrypt'],
          resources: ['*'],
        }),
      ],
    });
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.addNagSuppression({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: managedVpnPolicy.node.path,
          reason: 'Managed policy allows access for VPN CRUD operations',
        },
      ],
    });
    //
    // Create event handler role
    const vpnRole = new cdk.aws_iam.Role(this, 'VpnRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`lambda.amazonaws.com`),
      description: 'Landing Zone Accelerator site-to-site VPN custom resource access role',
      managedPolicies: [managedVpnPolicy, lambdaExecutionPolicy],
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.addNagSuppression({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: vpnRole.node.path,
          reason: 'IAM Role for lambda needs AWS managed policy',
        },
      ],
    });
    //
    // Create Lambda handler
    return new LzaLambda(this, 'VpnOnEventHandler', {
      assetPath: '../constructs/lib/aws-ec2/custom-vpn-connection/dist',
      environmentEncryptionKmsKey: this.lambdaKey,
      cloudWatchLogKmsKey: this.cloudwatchKey,
      cloudWatchLogRetentionInDays: this.logRetentionInDays,
      description: 'Custom resource onEvent handler for site-to-site VPN',
      role: vpnRole,
      timeOut: cdk.Duration.minutes(15),
      nagSuppressionPrefix: 'VpnOnEventHandler',
    }).resource;
  }

  /**
   * Create a VPN connection for a given VPC
   * @param customResourceHandler cdk.aws_lambda.IFunction | undefined
   * @returns Map<string, string>
   */
  private createVpnConnections(customResourceHandler?: cdk.aws_lambda.IFunction): void {
    const ipv4Cgws = this.props.networkConfig.customerGateways?.filter(cgw => isIpv4(cgw.ipAddress));

    for (const cgw of ipv4Cgws ?? []) {
      for (const vpnItem of cgw.vpnConnections ?? []) {
        if (
          isV2Resource(
            this.v2StackProps.v2NetworkResources,
            this.vpcDetails.name,
            V2StackComponentsList.VPN_CONNECTION,
            `${cgw.name}|${vpnItem.name}`,
          ) &&
          vpnItem.vpc === this.vpcDetails.name
        ) {
          //
          // Get CGW ID
          const customerGatewayId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.getSsmPath(SsmResourceType.CGW, [cgw.name]),
          );
          const logicalId = pascalCase(`${vpnItem.vpc}Vpc_${cgw.name}Cgw_${vpnItem.name}VpnConnection`);
          this.logger.info(
            `Creating Vpn Connection with Customer Gateway ${cgw.name} to the VPC ${vpnItem.vpc} vpn connection name is ${vpnItem.name}.`,
          );

          const metadata = {
            vpcName: vpnItem.vpc,
            vpcId: this.vpcId,
            vpnName: vpnItem.name,
            cgwName: cgw.name,
            customerGatewayId,
            virtualPrivateGateway: this.virtualPrivateGatewayId,
          };

          new VpnConnection(
            this,
            logicalId,
            this.setVpnProps({
              vpnItem,
              customerGatewayId,
              customResourceHandler,
              virtualPrivateGateway: this.virtualPrivateGatewayId,
              metadata,
            }),
          );
        }
      }
    }
  }

  /**
   * Function to create shared SSM parameters
   */
  private createSharedParameters(): void {
    const vgwVpnCustomerGateways = this.props.networkConfig.customerGateways
      ? this.props.networkConfig.customerGateways.filter(cgw =>
          cgw.vpnConnections?.filter(vpn => vpn.vpc === this.vpcDetails.name),
        )
      : [];

    const crossAcctFirewallReferenceCgws = vgwVpnCustomerGateways.filter(
      cgw => !isIpv4(cgw.ipAddress) && !this.firewallVpcInScope(cgw),
    );

    for (const crossAcctCgw of crossAcctFirewallReferenceCgws) {
      if (
        isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.VPN_CONNECTION,
          `${crossAcctCgw.name}|${this.vpcDetails.name}`,
        )
      ) {
        this.logger.info(
          `Adding shared SSM parameter for customer gateway ${crossAcctCgw.name} in stack ${this.stackName}`,
        );
        const firewallVpcConfig = this.getFirewallVpcConfig(crossAcctCgw);
        const accountIds = this.getVpcAccountIds(firewallVpcConfig);
        const parameters = this.setCrossAccountSsmParameters(crossAcctCgw);

        if (parameters.length > 0) {
          this.logger.info(`Putting cross-account/cross-region SSM parameters for VPC ${firewallVpcConfig.name}`);

          // Put SSM parameters
          const putSsmParameter = new PutSsmParameter(this, pascalCase(`${crossAcctCgw.name}VgwVpnSharedParameters`), {
            accountIds,
            region: firewallVpcConfig.region,
            roleName: this.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.logRetentionInDays,
            parameters,
            invokingAccountId: cdk.Stack.of(this).account,
            acceleratorPrefix: this.props.prefixes.accelerator,
          });

          const cfnResource = putSsmParameter.node.defaultChild as cdk.CfnResource;

          cfnResource.addMetadata(MetadataKeys.LZA_LOOKUP, {
            resourceType: V2StackComponentsList.CROSS_ACCOUNT_VPN_CONNECTION_PARAMETERS,
            vpcName: this.vpcDetails.name,
            crossAccountCgwName: crossAcctCgw.name,
          });
        }
      }
    }
  }

  /**
   * Returns a boolean indicating if the VPC a given firewall is deployed to
   * is in the same account+region as the customer gateway
   * @param customerGateway CustomerGatewayConfig
   * @returns boolean
   */
  public firewallVpcInScope(customerGateway: CustomerGatewayConfig): boolean {
    const cgwAccountId = this.props.accountsConfig.getAccountId(customerGateway.account);
    const firewallVpcConfig = this.getFirewallVpcConfig(customerGateway);
    const vpcAccountIds = this.getVpcAccountIds(firewallVpcConfig);

    return vpcAccountIds.includes(cgwAccountId) && firewallVpcConfig.region === this.region;
  }

  private getFirewallVpcConfig(customerGateway: CustomerGatewayConfig): VpcConfig | VpcTemplatesConfig {
    try {
      const firewallName = customerGateway.ipAddress.split(':')[4].replace('}', '');
      const firewallConfig = getFirewallInstanceConfig(
        firewallName,
        this.props.customizationsConfig.firewalls?.instances,
      );
      const firewallVpcConfig = this.props.networkConfig.vpcs.find(vpc => vpc.name === firewallConfig.vpc);
      if (!firewallVpcConfig) {
        throw new Error(`Error while processing customer gateway firewall reference variable: ${firewallConfig.vpc}`);
      }
      return firewallVpcConfig;
    } catch (e) {
      throw new Error(`Error while processing customer gateway firewall reference variable: ${e}`);
    }
  }

  /**
   * Returns an array of SSM parameters for cross-account VGW VPN connections
   * @param cgw CustomerGatewayConfig
   * @param vpcResources (VpcConfig | VpcTemplatesConfig)[]
   * @param vpcMap Map<string, Vpc>
   * @returns SsmParameterProps[]
   */
  private setCrossAccountSsmParameters(cgw: CustomerGatewayConfig) {
    const ssmParameters: SsmParameterProps[] = [];

    for (const vpnItem of cgw.vpnConnections ?? []) {
      if (vpnItem.vpc === this.vpcDetails.name) {
        //
        // Set VGW ID
        ssmParameters.push({
          name: this.getSsmPath(SsmResourceType.CROSS_ACCOUNT_VGW, [cgw.name, this.vpcDetails.name]),
          value: this.virtualPrivateGatewayId ?? '',
        });
      }
    }
    return [...new Set(ssmParameters)];
  }

  /**
   * Set site-to-site VPN connection properties.
   * @param options
   * @returns VpnConnectionProps
   */
  public setVpnProps(options: {
    vpnItem: VpnConnectionConfig;
    customerGatewayId: string;
    customResourceHandler?: cdk.aws_lambda.IFunction;
    owningAccountId?: string;
    owningRegion?: string;
    transitGatewayId?: string;
    virtualPrivateGateway?: string;
    metadata?: { [key: string]: string | number | boolean | undefined };
  }): VpnConnectionProps {
    const hasCrossAccountOptions = options.owningAccountId || options.owningRegion ? true : false;

    return {
      name: options.vpnItem.name,
      customerGatewayId: options.customerGatewayId,
      amazonIpv4NetworkCidr: options.vpnItem.amazonIpv4NetworkCidr,
      customerIpv4NetworkCidr: options.vpnItem.customerIpv4NetworkCidr,
      customResourceHandler:
        hasAdvancedVpnOptions(options.vpnItem) || hasCrossAccountOptions ? options.customResourceHandler : undefined,
      enableVpnAcceleration: options.vpnItem.enableVpnAcceleration,
      owningAccountId: options.owningAccountId,
      owningRegion: options.owningRegion,
      roleName: this.acceleratorResourceNames.roles.crossAccountVpnRoleName,
      staticRoutesOnly: options.vpnItem.staticRoutesOnly,
      tags: options.vpnItem.tags,
      transitGatewayId: options.transitGatewayId,
      virtualPrivateGateway: options.virtualPrivateGateway,
      vpnTunnelOptionsSpecifications: this.setVpnTunnelOptions(
        options.vpnItem,
        hasCrossAccountOptions,
        options.owningAccountId,
        options.owningRegion,
      ),
      metadata: options.metadata,
    };
  }

  /**
   * Set VPN tunnel options properties
   * @param vpnItem VpnConnectionConfig
   * @param hasCrossAccountOptions boolean
   * @param owningAccountId string | undefined
   * @param owningRegion string | undefined
   * @returns VpnTunnelOptionsSpecifications[] | undefined
   */
  private setVpnTunnelOptions(
    vpnItem: VpnConnectionConfig,
    hasCrossAccountOptions: boolean,
    owningAccountId?: string,
    owningRegion?: string,
  ): VpnTunnelOptionsSpecifications[] | undefined {
    if (!vpnItem.tunnelSpecifications) {
      return;
    }
    const vpnTunnelOptions: VpnTunnelOptionsSpecifications[] = [];

    for (const [index, tunnel] of vpnItem.tunnelSpecifications.entries()) {
      let loggingConfig: { enable?: boolean; logGroupArn?: string; outputFormat?: string } | undefined = undefined;
      let preSharedKeyValue: string | undefined = undefined;
      //
      // Rewrite logging config with log group ARN
      if (tunnel.logging?.enable) {
        loggingConfig = {
          enable: true,
          logGroupArn: this.createVpnLogGroup(
            vpnItem,
            index,
            tunnel.logging.logGroupName,
            owningAccountId,
            owningRegion,
          ),
          outputFormat: tunnel.logging.outputFormat,
        };
      }
      //
      // Rewrite PSK
      if (tunnel.preSharedKey) {
        const preSharedKeySecret = cdk.aws_secretsmanager.Secret.fromSecretNameV2(
          this,
          pascalCase(`${vpnItem.name}${tunnel.preSharedKey}Tunnel${index}PreSharedKeySecret`),
          tunnel.preSharedKey,
        );
        const suffixLength = preSharedKeySecret.secretName.split('-').at(-1)!.length + 1;
        const secretName = preSharedKeySecret.secretName.slice(0, -suffixLength);
        //
        // If advanced or cross-account VPN, use the secret name. Otherwise, retrieve the secret value
        preSharedKeyValue =
          hasAdvancedVpnOptions(vpnItem) || hasCrossAccountOptions
            ? secretName
            : preSharedKeySecret.secretValue.toString();
      }

      vpnTunnelOptions.push({
        dpdTimeoutAction: tunnel.dpdTimeoutAction,
        dpdTimeoutSeconds: tunnel.dpdTimeoutSeconds,
        ikeVersions: tunnel.ikeVersions,
        logging: loggingConfig,
        phase1: tunnel.phase1,
        phase2: tunnel.phase2,
        preSharedKey: preSharedKeyValue,
        rekeyFuzzPercentage: tunnel.rekeyFuzzPercentage,
        rekeyMarginTimeSeconds: tunnel.rekeyMarginTimeSeconds,
        replayWindowSize: tunnel.replayWindowSize,
        startupAction: tunnel.startupAction,
        tunnelInsideCidr: tunnel.tunnelInsideCidr,
        tunnelLifecycleControl: tunnel.tunnelLifecycleControl,
      });
    }
    return vpnTunnelOptions;
  }

  /**
   * Returns the ARN of a CloudWatch Log group created for the VPN tunnel.
   * @param vpnItem VpnConnectionConfig
   * @param index number
   * @param logGroupName string | undefined
   * @param owningAccountId string | undefined
   * @param owningRegion string | undefined
   * @returns string
   */
  private createVpnLogGroup(
    vpnItem: VpnConnectionConfig,
    index: number,
    logGroupName?: string,
    owningAccountId?: string,
    owningRegion?: string,
  ): string {
    const logicalId = pascalCase(`${vpnItem.name}Tunnel${index}LogGroup`);

    if (owningAccountId || owningRegion) {
      return new CloudWatchLogGroups(this, logicalId, {
        logGroupName: logGroupName ? `${this.props.prefixes.accelerator}${logGroupName}` : undefined,
        logRetentionInDays: this.logRetentionInDays,
        customLambdaLogKmsKey: this.cloudwatchKey,
        customLambdaLogRetention: this.logRetentionInDays,
        owningAccountId,
        owningRegion,
        roleName: this.acceleratorResourceNames.roles.crossAccountLogsRoleName,
      }).logGroupArn;
    } else {
      return new cdk.aws_logs.LogGroup(this, logicalId, {
        logGroupName: logGroupName ? `${this.props.prefixes.accelerator}${logGroupName}` : undefined,
        encryptionKey: this.cloudwatchKey,
        retention: this.logRetentionInDays,
      }).logGroupArn;
    }
  }

  /**
   * Function to create IAM role VPC flow logs
   * @param logGroupArn
   * @param useExistingRoles
   * @param acceleratorPrefix
   * @returns
   */
  private createVpcFlowLogsRoleCloudWatchLogs(
    logGroupArn: string,
    useExistingRoles: boolean,
    acceleratorPrefix: string,
  ) {
    if (useExistingRoles) {
      return `arn:${cdk.Stack.of(this).partition}:iam::${
        cdk.Stack.of(this).account
      }:role/${acceleratorPrefix}VpcFlowLogsRole`;
    }
    const role = new cdk.aws_iam.Role(this, 'FlowLogsRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: [
          'logs:CreateLogDelivery',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:DeleteLogDelivery',
          'logs:DescribeLogGroups',
          'logs:DescribeLogStreams',
          'logs:PutLogEvents',
        ],
        resources: [logGroupArn],
      }),
    );
    return role.roleArn;
  }

  /**
   * Function to replace VPC flow log destination name
   * @param inputString
   * @param replacementValue
   * @param accountId
   * @returns
   */
  private replaceVpcFlowLogDestName(inputString: string, replacementValue: string, accountId: string): string {
    const replacements = {
      '\\${ACCEL_LOOKUP::VPC_NAME}': replacementValue,
      '\\${ACCEL_LOOKUP::ACCOUNT_ID}': accountId,
    };

    for (const [key, value] of Object.entries(replacements)) {
      inputString = inputString.replace(new RegExp(key, 'g'), value);
    }
    return inputString;
  }

  /**
   * Function to create VPC flow logs
   * @param vpcFlowLogsConfig {@link VpcFlowLogsConfig}
   */
  private createVpcFlowLogs(vpcFlowLogsConfig: VpcFlowLogsConfig) {
    let logFormat: string | undefined = undefined;

    if (!vpcFlowLogsConfig.defaultFormat) {
      logFormat = vpcFlowLogsConfig.customFields.map(c => `$\{${c}}`).join(' ');
    }

    if (isV2Resource(this.v2StackProps.v2NetworkResources, this.vpcDetails.name, V2StackComponentsList.CWL_FLOW_LOGS)) {
      this.createCloudWatchLogVpcFlowLogs(vpcFlowLogsConfig, logFormat);
    }

    if (
      (vpcFlowLogsConfig.destinations.includes('s3') || vpcFlowLogsConfig.destinationsConfig?.s3) &&
      isV2Resource(this.v2StackProps.v2NetworkResources, this.vpcDetails.name, V2StackComponentsList.S3_FLOW_LOGS)
    ) {
      this.createS3VpcFlowLogs(vpcFlowLogsConfig, logFormat);
    }
  }

  /**
   * Function to create VPC flow logs with CloudWatch Log as destination
   * @param vpcFlowLogsConfig
   * @param logFormat
   */
  private createCloudWatchLogVpcFlowLogs(vpcFlowLogsConfig: VpcFlowLogsConfig, logFormat?: string): void {
    const logGroup = new cdk.aws_logs.LogGroup(this, 'FlowLogsGroup', {
      encryptionKey: this.cloudwatchKey,
      retention: this.logRetentionInDays,
    });

    this.logger.info(`Creating CWL destination flow-logs for VPC ${this.vpcDetails.name}`);
    const cfnFlowLog = new cdk.aws_ec2.CfnFlowLog(this, 'CloudWatchFlowLog', {
      deliverLogsPermissionArn: this.createVpcFlowLogsRoleCloudWatchLogs(
        logGroup.logGroupArn,
        this.props.useExistingRoles,
        this.props.prefixes.accelerator,
      ),
      logDestinationType: 'cloud-watch-logs',
      logDestination: logGroup.logGroupArn,
      resourceId: this.vpcId,
      resourceType: 'VPC',
      trafficType: vpcFlowLogsConfig.trafficType,
      maxAggregationInterval: vpcFlowLogsConfig.maxAggregationInterval,
      logFormat,
    });

    cfnFlowLog.addMetadata(MetadataKeys.LZA_LOOKUP, {
      resourceType: V2StackComponentsList.CWL_FLOW_LOGS,
      vpcName: this.vpcDetails.name,
      trafficType: vpcFlowLogsConfig.trafficType,
      maxAggregationInterval: vpcFlowLogsConfig.maxAggregationInterval,
    });
  }

  /**
   * Function to create VPC flow logs with S3 as destination
   * @param vpcFlowLogsConfig {@link VpcFlowLogsConfig}
   * @param logFormat
   */
  private createS3VpcFlowLogs(vpcFlowLogsConfig: VpcFlowLogsConfig, logFormat?: string): void {
    if (vpcFlowLogsConfig.destinations.includes('s3') || vpcFlowLogsConfig.destinationsConfig.s3) {
      const destinationBucketArn = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.acceleratorResourceNames.parameters.flowLogsDestinationBucketArn,
      );
      const overrideS3LogPath = vpcFlowLogsConfig.destinationsConfig?.s3?.overrideS3LogPath;

      let s3LogDestination = `${destinationBucketArn}/vpc-flow-logs/`;
      if (overrideS3LogPath) {
        const replacedS3LogPath = this.replaceVpcFlowLogDestName(
          overrideS3LogPath,
          this.vpcDetails.name,
          cdk.Stack.of(this).account,
        );
        s3LogDestination = `${destinationBucketArn}/${replacedS3LogPath}`;
      }

      // Destination: S3
      this.logger.info(`Creating S3 destination flow-logs for VPC ${this.vpcDetails.name}`);
      const cfnFlowLog = new cdk.aws_ec2.CfnFlowLog(this, 'S3FlowLog', {
        logDestinationType: 's3',
        logDestination: s3LogDestination,
        resourceId: this.vpcId,
        resourceType: 'VPC',
        trafficType: vpcFlowLogsConfig.trafficType,
        maxAggregationInterval: vpcFlowLogsConfig.maxAggregationInterval,
        logFormat,
      });

      cfnFlowLog.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.S3_FLOW_LOGS,
        vpcName: this.vpcDetails.name,
        trafficType: vpcFlowLogsConfig.trafficType,
        maxAggregationInterval: vpcFlowLogsConfig.maxAggregationInterval,
      });
    }
  }

  /**
   * Function to add central endpoint tags
   *
   */
  private addCentralEndpointTags(): void {
    if (
      this.vpcDetails.useCentralEndpoints &&
      isV2Resource(this.v2StackProps.v2NetworkResources, this.vpcDetails.name, V2StackComponentsList.VPC) &&
      this.vpc
    ) {
      const centralEndpointVpcAccountId = this.getCentralEndpointVpcAccountId();
      cdk.Tags.of(this.vpc).add('accelerator:use-central-endpoints', 'true');
      cdk.Tags.of(this.vpc).add('accelerator:central-endpoints-account-id', centralEndpointVpcAccountId);
    }
  }

  /**
   * Function to add IPV4 cidr
   * @param options
   */
  private addIpv4Cidr(options: {
    logicalId: string;
    cidrBlock?: string;
    ipv4IpamPoolId?: string;
    ipv4NetmaskLength?: number;
  }): void {
    const cfnVPCCidrBlock = new cdk.aws_ec2.CfnVPCCidrBlock(this, options.logicalId, {
      cidrBlock: options.cidrBlock,
      ipv4IpamPoolId: options.ipv4IpamPoolId,
      ipv4NetmaskLength: options.ipv4NetmaskLength,
      vpcId: this.vpcId,
    });

    cfnVPCCidrBlock.addMetadata(MetadataKeys.LZA_LOOKUP, {
      resourceType: V2StackComponentsList.ADDITIONAL_CIDR_BLOCK,
      vpcName: this.vpcDetails.name,
      cidrBlock: options.cidrBlock,
      ipv4IpamPoolId: options.ipv4IpamPoolId,
      ipv4NetmaskLength: options.ipv4NetmaskLength,
    });
  }

  /**
   * Function to add IPV6 Cidr
   * @param index
   * @param ipv6CidrConfig {@link VpcIpv6Config}
   * @param ipv6IpamPoolId
   */
  private addIpv6Cidr(index: number, ipv6CidrConfig: VpcIpv6Config, ipv6IpamPoolId?: string) {
    let ipType = 'AmazonProvided';
    if (!ipv6CidrConfig.amazonProvided) {
      ipType = 'Byoip';
    }
    const cfnVPCCidrBlock = new cdk.aws_ec2.CfnVPCCidrBlock(
      this,
      pascalCase(`${this.vpcDetails.name}Vpc${ipType}Ipv6CidrBlock${index}`),
      {
        amazonProvidedIpv6CidrBlock: ipv6CidrConfig.amazonProvided,
        ipv6CidrBlock: ipv6CidrConfig.cidrBlock,
        ipv6IpamPoolId,
        ipv6Pool: ipv6CidrConfig.byoipPoolId,
        vpcId: this.vpcId,
      },
    );

    cfnVPCCidrBlock.addMetadata(MetadataKeys.LZA_LOOKUP, {
      resourceType: V2StackComponentsList.ADDITIONAL_CIDR_BLOCK,
      vpcName: this.vpcDetails.name,
      amazonProvidedIpv6CidrBlock: ipv6CidrConfig.amazonProvided,
      ipv6CidrBlock: ipv6CidrConfig.cidrBlock,
      ipv6IpamPoolId,
      ipv6Pool: ipv6CidrConfig.byoipPoolId,
    });
  }

  /**
   * Function to get VPC IPAM pool details
   * @param ipamAllocations {@link IpamAllocationConfig}
   * @returns
   */
  private getVpcIpamPoolDetails(ipamAllocations: IpamAllocationConfig[]): { id: string; netmaskLength: number } {
    const ipamPoolName = ipamAllocations[0].ipamPoolName;
    const ipamPool = this.ipamPoolIds.find(item => item.name === ipamPoolName);
    if (!ipamPool) {
      this.logger.error(`VPC ${this.vpcDetails.name} IPAM pool ${ipamPoolName} not found`);
      throw new Error(
        `Configuration validation failed at runtime. VPC ${this.vpcDetails.name} IPAM pool ${ipamPoolName} not found`,
      );
    }
    return { id: ipamPool.id, netmaskLength: ipamAllocations[0].netmaskLength };
  }

  /**
   * Function to get IPAM pool Ids
   * @returns
   */
  private getIpamPoolIds(): { name: string; id: string }[] {
    const ipamPoolIds: { name: string; id: string }[] = [];

    for (const ipamAllocation of this.vpcDetails.ipamAllocations) {
      const delegatedAdminAccountId = this.props.accountsConfig.getAccountId(
        this.props.networkConfig.centralNetworkServices!.delegatedAdminAccount,
      );

      const ipamPoolConfig = this.props.networkConfig.centralNetworkServices!.ipams?.find(item =>
        item.pools?.find(item => item.name === ipamAllocation.ipamPoolName),
      );

      const errorMessage = `VPC ${this.vpcDetails.name} IPAM pool ${ipamAllocation.ipamPoolName} not found in network config`;

      if (!ipamPoolConfig) {
        this.logger.error(errorMessage);
        throw new Error(`Configuration validation failed at runtime.  ${errorMessage}`);
      }

      if (!ipamPoolConfig.pools) {
        this.logger.error(errorMessage);
        throw new Error(`Configuration validation failed at runtime.  ${errorMessage}`);
      }

      const ipamPoolNames: string[] = ipamPoolConfig.pools.map(item => item.name);

      const vpcIpamPoolNames = ipamPoolNames.filter(item => item === ipamAllocation.ipamPoolName);

      for (const vpcIpamPoolName of vpcIpamPoolNames) {
        if (ipamPoolIds.find(item => item.name === vpcIpamPoolName)) {
          continue;
        }

        if (
          delegatedAdminAccountId === cdk.Stack.of(this).account &&
          ipamPoolConfig.region === cdk.Stack.of(this).region
        ) {
          ipamPoolIds.push({
            name: vpcIpamPoolName,
            id: cdk.aws_ssm.StringParameter.valueForStringParameter(
              this,
              this.getSsmPath(SsmResourceType.IPAM_POOL, [vpcIpamPoolName]),
            ),
          });
        } else if (ipamPoolConfig.region !== cdk.Stack.of(this).region) {
          ipamPoolIds.push({
            name: vpcIpamPoolName,
            id: this.getCrossRegionPoolId(delegatedAdminAccountId, vpcIpamPoolName, ipamPoolConfig.region),
          });
        } else {
          ipamPoolIds.push({
            name: vpcIpamPoolName,
            id: this.getResourceShare(
              `${vpcIpamPoolName}_IpamPoolShare`,
              'ec2:IpamPool',
              delegatedAdminAccountId,
              this.cloudwatchKey,
            ).resourceShareItemId,
          });
        }
      }
    }
    return ipamPoolIds;
  }

  /**
   * Function to get resource share details
   * @param resourceShareName
   * @param itemType
   * @param owningAccountId
   * @param kmsKey
   * @param vpcName
   * @returns
   */
  private getResourceShare(
    resourceShareName: string,
    itemType: string,
    owningAccountId: string,
    kmsKey?: cdk.aws_kms.IKey,
    vpcName?: string,
  ): IResourceShareItem {
    const resourceShareNameArr = resourceShareName.split('_');
    let resourceName = resourceShareName.split('_')[0];
    if (resourceShareNameArr.length > 2) {
      resourceShareNameArr.pop();
      resourceName = resourceShareNameArr.join('_');
    }
    const logicalId = vpcName
      ? `${vpcName}${resourceName}${itemType.split(':')[1]}`
      : `${resourceName}${itemType.split(':')[1]}`;
    // Lookup resource share
    const resourceShare = ResourceShare.fromLookup(this, pascalCase(`${logicalId}Share}`), {
      resourceShareOwner: ResourceShareOwner.OTHER_ACCOUNTS,
      resourceShareName: resourceShareName,
      owningAccountId,
    });

    // Represents the item shared by RAM
    return ResourceShareItem.fromLookup(this, pascalCase(`${logicalId}`), {
      resourceShare,
      resourceShareItemType: itemType,
      kmsKey,
      logRetentionInDays: this.logRetentionInDays,
    });
  }

  /**
   * Function to get cross region pool id
   * @param delegatedAdminAccountId
   * @param poolName
   * @param ipamPoolRegion
   * @returns
   */
  private getCrossRegionPoolId(delegatedAdminAccountId: string, poolName: string, ipamPoolRegion: string): string {
    let poolId: string | undefined = undefined;
    if (delegatedAdminAccountId !== cdk.Stack.of(this).account) {
      poolId = new SsmParameterLookup(this, pascalCase(`SsmParamLookup${poolName}`), {
        name: this.getSsmPath(SsmResourceType.IPAM_POOL, [poolName]),
        accountId: delegatedAdminAccountId,
        parameterRegion: ipamPoolRegion,
        roleName: this.acceleratorResourceNames.roles.ipamSsmParameterAccess,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetentionInDays,
        acceleratorPrefix: this.props.prefixes.accelerator,
      }).value;
    } else {
      poolId = new SsmParameterLookup(this, pascalCase(`SsmParamLookup${poolName}`), {
        name: this.getSsmPath(SsmResourceType.IPAM_POOL, [poolName]),
        accountId: delegatedAdminAccountId,
        parameterRegion: ipamPoolRegion,
        acceleratorPrefix: this.props.prefixes.accelerator,
      }).value;
    }
    return poolId;
  }
}
