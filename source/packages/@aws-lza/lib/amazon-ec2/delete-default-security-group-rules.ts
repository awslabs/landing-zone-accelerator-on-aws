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

import {
  IDeleteDefaultSecurityGroupRulesModule,
  IDeleteDefaultSecurityGroupRulesParameter,
} from '../../interfaces/amazon-ec2/delete-default-security-group-rules';
import {
  DescribeSecurityGroupsCommand,
  EC2Client,
  RevokeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
  EC2ServiceException,
} from '@aws-sdk/client-ec2';
import { generateDryRunResponse, getModuleDefaultParameters, setRetryStrategy } from '../../common/functions';
import { AcceleratorModuleName } from '../../common/resources';
import { throttlingBackOff } from '../../common/throttle';
import { MODULE_EXCEPTIONS } from '../../common/enums';
import { createLogger } from '../../common/logger';
import path from 'path';

/**
 * DeleteDefaultSecurityGroupRulesModule class to manage deletion of default security group rules
 */
export class DeleteDefaultSecurityGroupRulesModule implements IDeleteDefaultSecurityGroupRulesModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to delete default security group rules
   *
   * @param props {@link IDeleteDefaultSecurityGroupRulesParameter}
   * @returns status string
   */
  public async handler(props: IDeleteDefaultSecurityGroupRulesParameter): Promise<string> {
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AMAZON_EC2, props);

    const client = new EC2Client({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    if (defaultProps.dryRun) {
      return generateDryRunResponse(
        defaultProps.moduleName,
        props.operation,
        `Will delete default security group rules for VPC: ${props.configuration.vpcId}`,
      );
    }

    return this.deleteDefaultSecurityGroupRules(client, props.configuration.vpcId);
  }

  /**
   * Function to delete default security group rules
   * @param client {@link EC2Client}
   * @param vpcId string
   * @returns status string
   */
  private async deleteDefaultSecurityGroupRules(client: EC2Client, vpcId: string): Promise<string> {
    this.logger.info(`Starting deletion of default security group rules for VPC: ${vpcId}`);

    try {
      const securityGroupId = await this.getDefaultSecurityGroupId(client, vpcId);

      if (!securityGroupId) {
        throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Default security group not found for VPC: ${vpcId}`);
      }

      this.logger.info(`Found default security group: ${securityGroupId}`);

      // Delete egress rules
      await this.deleteEgressRules(client, securityGroupId);
      this.logger.info(`Successfully removed egress rules for security group: ${securityGroupId}`);

      // Delete ingress rules
      await this.deleteIngressRules(client, securityGroupId);
      this.logger.info(`Successfully removed ingress rules for security group: ${securityGroupId}`);

      return `Successfully deleted default security group rules for VPC: ${vpcId}`;
    } catch (error: unknown) {
      this.logger.error(`Failed to delete default security group rules for VPC ${vpcId}:`, error);
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete default security group rules for VPC ${vpcId}: ${error}`,
      );
    }
  }

  /**
   * Get the default security group ID for a VPC
   * @param client {@link EC2Client}
   * @param vpcId string
   * @returns security group ID
   */
  private async getDefaultSecurityGroupId(client: EC2Client, vpcId: string): Promise<string | undefined> {
    const params = {
      Filters: [
        {
          Name: 'group-name',
          Values: ['default'],
        },
        {
          Name: 'vpc-id',
          Values: [vpcId],
        },
      ],
    };

    const response = await throttlingBackOff(() => client.send(new DescribeSecurityGroupsCommand(params)));

    // Each VPC has exactly one default security group with name 'default'
    // AWS guarantees this, so we safely use the first (and only) item
    if (response.SecurityGroups && response.SecurityGroups.length > 1) {
      this.logger.warn(
        `Found ${response.SecurityGroups.length} security groups with name 'default' in VPC ${vpcId}. Using the first one.`,
      );
    }

    return response.SecurityGroups?.[0]?.GroupId;
  }

  /**
   * Delete egress rules from default security group
   * @param client {@link EC2Client}
   * @param securityGroupId string
   */
  private async deleteEgressRules(client: EC2Client, securityGroupId: string): Promise<void> {
    const params = {
      GroupId: securityGroupId,
      IpPermissions: [
        {
          IpProtocol: '-1',
          IpRanges: [
            {
              CidrIp: '0.0.0.0/0',
            },
          ],
        },
      ],
    };

    try {
      await throttlingBackOff(() => client.send(new RevokeSecurityGroupEgressCommand(params)));
    } catch (error: unknown) {
      if (error instanceof EC2ServiceException && error.name === 'InvalidPermission.NotFound') {
        this.logger.info('Egress rules already removed or do not exist');
        return;
      }
      throw error;
    }
  }

  /**
   * Delete ingress rules from default security group
   * @param client {@link EC2Client}
   * @param securityGroupId string
   */
  private async deleteIngressRules(client: EC2Client, securityGroupId: string): Promise<void> {
    const params = {
      GroupId: securityGroupId,
      IpPermissions: [
        {
          IpProtocol: '-1',
          UserIdGroupPairs: [
            {
              GroupId: securityGroupId,
            },
          ],
        },
      ],
    };

    try {
      await throttlingBackOff(() => client.send(new RevokeSecurityGroupIngressCommand(params)));
    } catch (error: unknown) {
      if (error instanceof EC2ServiceException && error.name === 'InvalidPermission.NotFound') {
        this.logger.info('Ingress rules already removed or do not exist');
        return;
      }
      throw error;
    }
  }
}
