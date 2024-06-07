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

import { AseaResourceType, CfnResourceType } from '@aws-accelerator/config/lib/common/types';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';

const MANAGED_AD_RESOURCE_TYPE = 'AWS::DirectoryService::MicrosoftAD';
const ASEA_PHASE_NUMBER_MANAGED_AD = '2';

/**
 * Handles Managed Active Directories created by ASEA.
 * All Managed Active Directories are deployed in Phase-2
 */
export class ManagedAdResources extends AseaResource {
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    const existingManagedAds = this.scope.importStackResources.getResourcesByType(MANAGED_AD_RESOURCE_TYPE);
    this.updateManagedAD(props, existingManagedAds);
  }

  private updateManagedAD(props: AseaResourceProps, existingManagedAds: CfnResourceType[]) {
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER_MANAGED_AD) {
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${MANAGED_AD_RESOURCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`,
      );
      return;
    }
    if (existingManagedAds.length === 0) {
      return;
    }

    const managedAdConfigs = props.iamConfig.managedActiveDirectories;

    //If there are no MAD Config objects or ASEA MADs deployed, return.
    if (!existingManagedAds || !managedAdConfigs) {
      return;
    }

    for (const managedAdConfig of managedAdConfigs) {
      const managedAdConfigName = managedAdConfig.name;
      const matchedManagedAd = existingManagedAds.find(
        existingManagedAd => existingManagedAd.resourceMetadata['Properties'].Name === managedAdConfigName,
      );
      if (!matchedManagedAd || !matchedManagedAd.physicalResourceId) {
        continue;
      }
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(managedAdConfigName)}`),
        parameterName: this.scope.getSsmPath(SsmResourceType.MANAGED_AD, [managedAdConfigName]),
        stringValue: matchedManagedAd.physicalResourceId,
      });
      this.scope.addAseaResource(AseaResourceType.MANAGED_AD, managedAdConfigName);
    }
  }
}
