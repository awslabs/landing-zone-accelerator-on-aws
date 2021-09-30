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

import { OrganizationConfig } from '@aws-accelerator/config';
import { OrganizationalUnit, RootOrganizationalUnit } from '@aws-accelerator/constructs';
import * as cdk from '@aws-cdk/core';
import { pascalCase } from 'change-case';

export interface OrganizationsStackProps extends cdk.StackProps {
  stage: string;
  organizationsConfig: OrganizationConfig;
}

export class OrganizationsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: OrganizationsStackProps) {
    super(scope, id, props);

    const root = RootOrganizationalUnit.fromName(this, 'RootOu', { name: 'Root' });

    //
    // Loop through list of organizational-units in the configuration file and
    // create them.
    //
    // Note: The Accelerator will only create new Organizational Units if they
    //       do not already exist. If Organizational Units are found outside of
    //       those that are listed in the configuration file, they are ignored
    //       and left in place
    //
    for (const organizationalUnit in props.organizationsConfig['organizational-units']) {
      new OrganizationalUnit(this, pascalCase(organizationalUnit), {
        name: props.organizationsConfig['organizational-units'][organizationalUnit].name,
        parentId: root.id,
      });
    }

    // Deploy SCPs

    // Move accounts to correct OU
  }
}
