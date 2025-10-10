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

import { pascalCase } from 'pascal-case';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AcceleratorKeyType, AcceleratorStack } from '../../accelerator-stack';
import { V2NetworkStacksBaseProps } from '../utils/types';
import { VpcDetails } from '../constructs/vpc-details';
import { SubnetConfig } from '@aws-accelerator/config/lib/network-config';
import { getResourceSharePrincipals, isV2Resource } from '../utils/functions';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { PutSsmParameter, SsmParameterProps } from '@aws-accelerator/constructs/lib/aws-ssm/put-ssm-parameter';
import { ResourceShare } from '@aws-accelerator/constructs/lib/aws-ram/resource-share';
import { NetworkStackGeneration, V2StackComponentsList } from '../utils/enums';
import { MetadataKeys } from '@aws-accelerator/utils/lib/common-types';

export class VpcSubnetsShareBaseStack extends AcceleratorStack {
  private v2StackProps: V2NetworkStacksBaseProps;
  private vpcDetails: VpcDetails;
  private vpcId: string;

  private cloudwatchKey: cdk.aws_kms.IKey | undefined;

  constructor(scope: Construct, id: string, props: V2NetworkStacksBaseProps) {
    super(scope, id, props);

    //
    // Add Stack metadata
    //
    this.addMetadata(MetadataKeys.LZA_LOOKUP, {
      accountName: this.props.accountsConfig.getAccountNameById(this.account),
      region: cdk.Stack.of(this).region,
      stackGeneration: NetworkStackGeneration.V2,
    });

    this.v2StackProps = props;
    this.vpcDetails = new VpcDetails(this, 'VpcDetails', this.v2StackProps);
    this.vpcId = this.vpcDetails.id!;

    this.cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);

    //
    // Share subnets
    //
    this.shareSubnets();

    //
    // Create SSM Parameters
    //
    this.createSsmParameters();
  }

  /**
   * Function to share subnets
   */
  private shareSubnets(): void {
    for (const subnetConfig of this.vpcDetails.subnets) {
      if (
        isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.SUBNET_SHARE,
          subnetConfig.name,
        )
      ) {
        this.sharedSubnet(subnetConfig);
      }
    }
  }

  /**
   * Function to share subnet
   * @param subnetConfig {@link SubnetConfig}
   */
  private sharedSubnet(subnetConfig: SubnetConfig): void {
    if (subnetConfig.shareTargets) {
      const resourceShareName = `${subnetConfig.name}_SubnetShare`;
      const principals = getResourceSharePrincipals(
        subnetConfig,
        resourceShareName,
        this.props.accountsConfig,
        this.props.organizationConfig,
      );

      this.logger.info(`Share subnet ${subnetConfig.name}`);
      const subnetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.SUBNET, [this.vpcDetails.name, subnetConfig.name]),
      );
      const subnetArn = cdk.Stack.of(this).formatArn({
        service: 'ec2',
        resource: 'subnet',
        arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
        resourceName: subnetId,
      });
      // Create the Resource Share
      const resourceShareLogicalId = `${pascalCase(resourceShareName)}ResourceShare`;
      const resourceShare = new ResourceShare(this, resourceShareLogicalId, {
        name: resourceShareName,
        principals,
        resourceArns: [subnetArn],
      });

      const cfnResource = resourceShare.node.findChild(resourceShareLogicalId) as cdk.CfnResource;

      cfnResource.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.SUBNET_SHARE,
        vpcName: this.vpcDetails.name,
        subnetName: subnetConfig.name,
      });

      const shareTargetAccountIds = this.getAccountIdsFromShareTarget(subnetConfig.shareTargets).filter(
        item => item !== cdk.Stack.of(this).account,
      );
      const sharedSubnetParameters: SsmParameterProps[] = [
        {
          name: this.getSsmPath(SsmResourceType.VPC, [this.vpcDetails.name]),
          value: this.vpcId,
        },
        {
          name: this.getSsmPath(SsmResourceType.SUBNET, [this.vpcDetails.name, subnetConfig.name]),
          value: subnetId,
        },
      ];

      if (subnetConfig.ipv4CidrBlock) {
        sharedSubnetParameters.push({
          name: this.getSsmPath(SsmResourceType.SUBNET_IPV4_CIDR_BLOCK, [this.vpcDetails.name, subnetConfig.name]),
          value: subnetConfig.ipv4CidrBlock,
        });
      }

      // Put SSM parameters for share target accounts
      const putSsmParameter = new PutSsmParameter(
        this,
        pascalCase(`${this.vpcDetails.name}${subnetConfig.name}VpcSharedSubnetParameters`),
        {
          accountIds: shareTargetAccountIds,
          region: cdk.Stack.of(this).region,
          roleName: this.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          parameters: sharedSubnetParameters,
          invokingAccountId: cdk.Stack.of(this).account,
          acceleratorPrefix: this.props.prefixes.accelerator,
        },
      );
      putSsmParameter.node.addDependency(resourceShare);
    }
  }
}
