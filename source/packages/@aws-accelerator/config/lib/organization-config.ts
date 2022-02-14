/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as t from './common-types';

/**
 * AWS Organizations configuration items.
 */
export abstract class OrganizationConfigTypes {
  static readonly organizationalUnitConfig = t.interface({
    name: t.nonEmptyString,
    path: t.nonEmptyString,
  });

  static readonly organizationalUnitIdConfig = t.interface({
    name: t.nonEmptyString,
    id: t.nonEmptyString,
    arn: t.nonEmptyString,
  });

  static readonly serviceControlPolicyConfig = t.interface({
    name: t.nonEmptyString,
    description: t.nonEmptyString,
    policy: t.nonEmptyString,
    type: t.enums('Type', ['awsManaged', 'customerManaged'], 'Value should be a Service Control Policy Type'),
    deploymentTargets: t.deploymentTargets,
  });

  static readonly organizationConfig = t.interface({
    enable: t.boolean,
    organizationalUnits: t.array(this.organizationalUnitConfig),
    organizationalUnitIds: t.optional(t.array(this.organizationalUnitIdConfig)),
    serviceControlPolicies: t.array(this.serviceControlPolicyConfig),
  });
}

export abstract class OrganizationalUnitConfig
  implements t.TypeOf<typeof OrganizationConfigTypes.organizationalUnitConfig>
{
  readonly name: string = '';
  readonly path: string = '/';
}

export abstract class OrganizationalUnitIdConfig
  implements t.TypeOf<typeof OrganizationConfigTypes.organizationalUnitIdConfig>
{
  readonly name: string = '';
  readonly id: string = '';
  readonly arn: string = '';
}

export abstract class ServiceControlPolicyConfig
  implements t.TypeOf<typeof OrganizationConfigTypes.serviceControlPolicyConfig>
{
  readonly name: string = '';
  readonly description: string = '';
  readonly policy: string = '';
  readonly type: string = 'customerManaged';
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export class OrganizationConfig implements t.TypeOf<typeof OrganizationConfigTypes.organizationConfig> {
  static readonly FILENAME = 'organization-config.yaml';

  readonly enable = true;

  /**
   * A Record of Organizational Unit configurations
   *
   * @see OrganizationalUnitConfig
   */
  readonly organizationalUnits: OrganizationalUnitConfig[] = [
    {
      name: 'Security',
      path: '/',
    },
    {
      name: 'Infrastructure',
      path: '/',
    },
  ];

  /**
   * Optionally provide a list of Organizational Unit IDs to bypass the usage of the
   * AWS Organizations Client lookup. This is not a readonly member since we
   * will initialize it with values if it is not provided
   */
  public organizationalUnitIds: OrganizationalUnitIdConfig[] | undefined = undefined;

  /**
   * A Record of Service Control Policy configurations
   *
   * @see ServiceControlPolicyConfig
   */
  readonly serviceControlPolicies: ServiceControlPolicyConfig[] = [];

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof OrganizationConfigTypes.organizationConfig>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   *
   * @param dir
   * @returns
   */
  static load(dir: string): OrganizationConfig {
    const buffer = fs.readFileSync(path.join(dir, OrganizationConfig.FILENAME), 'utf8');
    const values = t.parse(OrganizationConfigTypes.organizationConfig, yaml.load(buffer));
    return new OrganizationConfig(values);
  }

  public async loadOrganizationalUnitIds(partition: string): Promise<void> {
    if (this.organizationalUnitIds === undefined) {
      this.organizationalUnitIds = [];
    }
    if (this.organizationalUnitIds.length == 0) {
      let organizationsClient: AWS.Organizations;
      if (partition === 'aws-us-gov') {
        organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
      } else {
        organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
      }

      let rootId = '';

      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() => organizationsClient.listRoots({ NextToken: nextToken }).promise());
        for (const item of page.Roots ?? []) {
          if (item.Name === 'Root' && item.Id && item.Arn) {
            this.organizationalUnitIds?.push({ name: item.Name, id: item.Id, arn: item.Arn });
            rootId = item.Id;
          }
        }
        nextToken = page.NextToken;
      } while (nextToken);

      for (const item of this.organizationalUnits) {
        let parentId = rootId;

        for (const parent of item.path.split('/')) {
          if (parent) {
            let nextToken: string | undefined = undefined;
            do {
              const page = await throttlingBackOff(() =>
                organizationsClient
                  .listOrganizationalUnitsForParent({ ParentId: parentId, NextToken: nextToken })
                  .promise(),
              );
              for (const ou of page.OrganizationalUnits ?? []) {
                if (ou.Name === parent && ou.Id) {
                  parentId = ou.Id;
                }
              }
              nextToken = page.NextToken;
            } while (nextToken);
          }
        }

        let nextToken: string | undefined = undefined;
        do {
          const page = await throttlingBackOff(() =>
            organizationsClient
              .listOrganizationalUnitsForParent({ ParentId: parentId, NextToken: nextToken })
              .promise(),
          );
          for (const ou of page.OrganizationalUnits ?? []) {
            if (ou.Name === item.name && ou.Id && ou.Arn) {
              this.organizationalUnitIds?.push({ name: item.name, id: ou.Id, arn: ou.Arn });
            }
          }
          nextToken = page.NextToken;
        } while (nextToken);
      }
    }
  }

  public getOrganizationalUnitId(name: string): string {
    if (this.organizationalUnitIds) {
      const ou = this.organizationalUnitIds.find(item => item.name === name);
      if (ou) {
        return ou.id;
      }
    }
    throw new Error(`OU ${name} not found`);
  }

  public getOrganizationalUnitArn(name: string): string {
    if (this.organizationalUnitIds) {
      const ou = this.organizationalUnitIds.find(item => item.name === name);
      if (ou) {
        return ou.arn;
      }
    }
    throw new Error(`OU ${name} not found`);
  }

  public getPath(name: string): string {
    const ou = this.organizationalUnits.find(item => item.name === name);
    if (ou) {
      return ou.path;
    }
    throw new Error(`OU ${name} not found`);
  }
}
