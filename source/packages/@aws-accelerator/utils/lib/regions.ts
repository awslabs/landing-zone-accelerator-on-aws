/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
  name: string;
  azId: string | undefined;
  elbAccount: string | undefined;
  optIn: boolean;
};

type RegionsInfo = RegionInfo[];

const regionsInfo: RegionsInfo = [
  { name: 'af-south-1', azId: 'afs1-az', elbAccount: '098369216593', optIn: true },
  { name: 'ap-east-1', azId: 'ape1-az', elbAccount: '754344448648', optIn: true },
  { name: 'ap-northeast-1', azId: 'apne1-az', elbAccount: '582318560864', optIn: false },
  { name: 'ap-northeast-2', azId: 'apne2-az', elbAccount: '600734575887', optIn: false },
  { name: 'ap-northeast-3', azId: 'apne3-az', elbAccount: '383597477331', optIn: false },
  { name: 'ap-south-1', azId: 'aps1-az', elbAccount: '718504428378', optIn: false },
  { name: 'ap-south-2', azId: 'aps2-az', elbAccount: undefined, optIn: true },
  { name: 'ap-southeast-1', azId: 'apse1-az', elbAccount: '114774131450', optIn: false },
  { name: 'ap-southeast-2', azId: 'apse2-az', elbAccount: '783225319266', optIn: false },
  { name: 'ap-southeast-3', azId: 'apse3-az', elbAccount: '589379963580', optIn: true },
  { name: 'ap-southeast-4', azId: 'apse4-az', elbAccount: undefined, optIn: true },
  { name: 'ca-central-1', azId: 'cac1-az', elbAccount: '985666609251', optIn: false },
  { name: 'cn-north-1', azId: undefined, elbAccount: '638102146993', optIn: false },
  { name: 'cn-northwest-1', azId: undefined, elbAccount: '037604701340', optIn: false },
  { name: 'eu-central-1', azId: 'euc1-az', elbAccount: '054676820928', optIn: false },
  { name: 'eu-central-2', azId: 'euc2-az', elbAccount: undefined, optIn: true },
  { name: 'eu-north-1', azId: 'eun1-az', elbAccount: '897822967062', optIn: false },
  { name: 'eu-south-1', azId: 'eus1-az', elbAccount: '635631232127', optIn: true },
  { name: 'eu-south-2', azId: 'eus2-az', elbAccount: undefined, optIn: true },
  { name: 'eu-west-1', azId: 'euw1-az', elbAccount: '156460612806', optIn: false },
  { name: 'eu-west-2', azId: 'euw2-az', elbAccount: '652711504416', optIn: false },
  { name: 'eu-west-3', azId: 'euw3-az', elbAccount: '009996457667', optIn: false },
  { name: 'il-central-1', azId: 'ilc1-az', elbAccount: undefined, optIn: true },
  { name: 'me-central-1', azId: 'mec1-az', elbAccount: undefined, optIn: true },
  { name: 'me-south-1', azId: 'mes1-az', elbAccount: '076674570225', optIn: true },
  { name: 'sa-east-1', azId: 'sae1-az', elbAccount: '507241528517', optIn: false },
  { name: 'us-east-1', azId: 'use1-az', elbAccount: '127311923021', optIn: false },
  { name: 'us-east-2', azId: 'use2-az', elbAccount: '033677994240', optIn: false },
  { name: 'us-gov-west-1', azId: 'usgw1-az', elbAccount: '048591011584', optIn: false },
  { name: 'us-gov-east-1', azId: 'usge1-az', elbAccount: '190560391635', optIn: false },
  { name: 'us-iso-east-1', azId: undefined, elbAccount: undefined, optIn: false },
  { name: 'us-isob-east-1', azId: undefined, elbAccount: undefined, optIn: false },
  { name: 'us-iso-west-1', azId: undefined, elbAccount: undefined, optIn: false },
  { name: 'us-west-1', azId: 'usw1-az', elbAccount: '027434742980', optIn: false },
  { name: 'us-west-2', azId: 'usw2-az', elbAccount: '797873946194', optIn: false },
];

export const AcceleratorElbRootAccounts = new Map<string, string>();
regionsInfo
  .filter(item => item.elbAccount !== undefined)
  .forEach(item => AcceleratorElbRootAccounts.set(item.name, item.elbAccount ?? ''));

export const OptInRegions = regionsInfo.filter(item => item.optIn === true).map(item => item.name);

export const Regions = regionsInfo.map(item => item.name);

export function getAvailabilityZoneMap(region: string) {
  const availabilityZoneIdMap = new Map<string, string>();
  regionsInfo
    .filter(item => item.azId !== undefined)
    .forEach(item => availabilityZoneIdMap.set(item.name, item.azId ?? ''));

  const availabilityZoneId = availabilityZoneIdMap.get(region);
  if (!availabilityZoneIdMap.get(region)) {
    logger.error(`The ${region} provided does not support Physical AZ IDs.`);
    throw new Error(`Configuration validation failed at runtime.`);
  }
  return availabilityZoneId;
}
