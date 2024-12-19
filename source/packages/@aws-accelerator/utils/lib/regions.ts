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

import { createLogger } from './logger';

const logger = createLogger(['regions']);

type RegionInfo = {
  azId: string | undefined;
  elbAccount: string | undefined;
  optIn: boolean;
};

export enum RegionName {
  'af-south-1',
  'ap-east-1',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-south-1',
  'ap-south-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-southeast-4',
  'ap-southeast-5',
  'ca-central-1',
  'ca-west-1',
  'cn-north-1',
  'cn-northwest-1',
  'eu-central-1',
  'eu-central-2',
  'eu-north-1',
  'eu-south-1',
  'eu-south-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-isoe-west-1',
  'il-central-1',
  'me-central-1',
  'me-south-1',
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-gov-west-1',
  'us-gov-east-1',
  'us-iso-east-1',
  'us-isob-east-1',
  'us-iso-west-1',
  'us-isof-south-1',
  'us-isof-east-1',
  'us-west-1',
  'us-west-2',
}

const regionsInfo: Record<keyof typeof RegionName, RegionInfo> = {
  'af-south-1': { azId: 'afs1-az', elbAccount: '098369216593', optIn: true },
  'ap-east-1': { azId: 'ape1-az', elbAccount: '754344448648', optIn: true },
  'ap-northeast-1': { azId: 'apne1-az', elbAccount: '582318560864', optIn: false },
  'ap-northeast-2': { azId: 'apne2-az', elbAccount: '600734575887', optIn: false },
  'ap-northeast-3': { azId: 'apne3-az', elbAccount: '383597477331', optIn: false },
  'ap-south-1': { azId: 'aps1-az', elbAccount: '718504428378', optIn: false },
  'ap-south-2': { azId: 'aps2-az', elbAccount: undefined, optIn: true },
  'ap-southeast-1': { azId: 'apse1-az', elbAccount: '114774131450', optIn: false },
  'ap-southeast-2': { azId: 'apse2-az', elbAccount: '783225319266', optIn: false },
  'ap-southeast-3': { azId: 'apse3-az', elbAccount: '589379963580', optIn: true },
  'ap-southeast-4': { azId: 'apse4-az', elbAccount: undefined, optIn: true },
  'ap-southeast-5': { azId: 'apse5-az', elbAccount: undefined, optIn: true },
  'ca-central-1': { azId: 'cac1-az', elbAccount: '985666609251', optIn: false },
  'ca-west-1': { azId: 'caw1-az', elbAccount: undefined, optIn: true },
  'cn-north-1': { azId: undefined, elbAccount: '638102146993', optIn: false },
  'cn-northwest-1': { azId: undefined, elbAccount: '037604701340', optIn: false },
  'eu-central-1': { azId: 'euc1-az', elbAccount: '054676820928', optIn: false },
  'eu-central-2': { azId: 'euc2-az', elbAccount: undefined, optIn: true },
  'eu-north-1': { azId: 'eun1-az', elbAccount: '897822967062', optIn: false },
  'eu-south-1': { azId: 'eus1-az', elbAccount: '635631232127', optIn: true },
  'eu-south-2': { azId: 'eus2-az', elbAccount: undefined, optIn: true },
  'eu-west-1': { azId: 'euw1-az', elbAccount: '156460612806', optIn: false },
  'eu-west-2': { azId: 'euw2-az', elbAccount: '652711504416', optIn: false },
  'eu-west-3': { azId: 'euw3-az', elbAccount: '009996457667', optIn: false },
  'eu-isoe-west-1': { azId: undefined, elbAccount: undefined, optIn: false },
  'il-central-1': { azId: 'ilc1-az', elbAccount: undefined, optIn: true },
  'me-central-1': { azId: 'mec1-az', elbAccount: undefined, optIn: true },
  'me-south-1': { azId: 'mes1-az', elbAccount: '076674570225', optIn: true },
  'sa-east-1': { azId: 'sae1-az', elbAccount: '507241528517', optIn: false },
  'us-east-1': { azId: 'use1-az', elbAccount: '127311923021', optIn: false },
  'us-east-2': { azId: 'use2-az', elbAccount: '033677994240', optIn: false },
  'us-gov-west-1': { azId: 'usgw1-az', elbAccount: '048591011584', optIn: false },
  'us-gov-east-1': { azId: 'usge1-az', elbAccount: '190560391635', optIn: false },
  'us-iso-east-1': { azId: undefined, elbAccount: undefined, optIn: false },
  'us-isob-east-1': { azId: undefined, elbAccount: undefined, optIn: false },
  'us-iso-west-1': { azId: undefined, elbAccount: undefined, optIn: false },
  'us-isof-south-1': { azId: undefined, elbAccount: undefined, optIn: false },
  'us-isof-east-1': { azId: undefined, elbAccount: undefined, optIn: true },
  'us-west-1': { azId: 'usw1-az', elbAccount: '027434742980', optIn: false },
  'us-west-2': { azId: 'usw2-az', elbAccount: '797873946194', optIn: false },
};

export const AcceleratorElbRootAccounts = new Map<string, string>(
  Object.entries(regionsInfo)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .filter(([_, info]) => info.elbAccount !== undefined)
    .map(([region, info]) => [region, info.elbAccount ?? '']),
);

export const OptInRegions = Object.entries(regionsInfo)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .filter(([_, info]) => info.optIn === true)
  .map(([region]) => region);

export const Regions = Object.keys(regionsInfo);

export function getAvailabilityZoneMap(region: string) {
  const availabilityZoneIdMap = new Map<string, string>(
    Object.entries(regionsInfo)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .filter(([_, info]) => info.azId !== undefined)
      .map(([region, info]) => [region, info.azId ?? '']),
  );

  const availabilityZoneId = availabilityZoneIdMap.get(region);
  if (!availabilityZoneIdMap.get(region)) {
    logger.error(`The ${region} provided does not support Physical AZ IDs.`);
    throw new Error(`Configuration validation failed at runtime.`);
  }
  return availabilityZoneId;
}
