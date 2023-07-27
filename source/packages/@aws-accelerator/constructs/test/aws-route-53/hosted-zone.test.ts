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
import { HostedZone } from '../../index';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(HostedZone): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const hostedZoneName = HostedZone.getHostedZoneNameForService('s3-global.accesspoint', stack.region);
const ecrApiHostedZoneName = HostedZone.getHostedZoneNameForService('ecr.api', stack.region);
const appstreamApiHostedZoneName = HostedZone.getHostedZoneNameForService('appstream.api', stack.region);
const deviceAdvisorIotHostedZoneName = HostedZone.getHostedZoneNameForService('deviceadvisor.iot', stack.region);
const pintpointSmsVoiceV2HostedZoneName = HostedZone.getHostedZoneNameForService('pinpoint-sms-voice-v2', stack.region);
const rumDataplaneHostedZoneName = HostedZone.getHostedZoneNameForService('rum-dataplane', stack.region);
const ecsAgentHostedZoneName = HostedZone.getHostedZoneNameForService('ecs-agent', stack.region);
const ecsTelemetryHostedZoneName = HostedZone.getHostedZoneNameForService('ecs-telemetry', stack.region);
const sageMakerNotebookHostedZoneName = HostedZone.getHostedZoneNameForService('notebook', stack.region);
const sageMakerStudioHostedZoneName = HostedZone.getHostedZoneNameForService('studio', stack.region);
const s3HostedHostedZoneName = HostedZone.getHostedZoneNameForService('s3', stack.region);
const codeArtifactRepositoriesHostedZoneName = HostedZone.getHostedZoneNameForService(
  'codeartifact.repositories',
  stack.region,
);
const codeArtifactApiHostedZoneName = HostedZone.getHostedZoneNameForService('codeartifact.api', stack.region);

new HostedZone(stack, `TestHostedZone`, {
  hostedZoneName,
  vpcId: 'Test',
});

new HostedZone(stack, `codeArtifactApiHostedZone`, {
  hostedZoneName: codeArtifactApiHostedZoneName,
  vpcId: 'Test',
});

new HostedZone(stack, `codeArtifactRepositoriesHostedZone`, {
  hostedZoneName: codeArtifactRepositoriesHostedZoneName,
  vpcId: 'Test',
});

new HostedZone(stack, `s3HostedHostedZone`, {
  hostedZoneName: s3HostedHostedZoneName,
  vpcId: 'Test',
});

new HostedZone(stack, `EcrApiHostedZone`, {
  hostedZoneName: ecrApiHostedZoneName,
  vpcId: 'Test',
});

new HostedZone(stack, `AppstreamApiHostedZone`, {
  hostedZoneName: appstreamApiHostedZoneName,
  vpcId: 'Test',
});

new HostedZone(stack, `DeviceAdvisorIotHostedZone`, {
  hostedZoneName: deviceAdvisorIotHostedZoneName,
  vpcId: 'Test',
});

new HostedZone(stack, `PintpointSmsVoiceV2HostedZone`, {
  hostedZoneName: pintpointSmsVoiceV2HostedZoneName,
  vpcId: 'Test',
});

new HostedZone(stack, `RumDataplaneHostedZone`, {
  hostedZoneName: rumDataplaneHostedZoneName,
  vpcId: 'Test',
});

new HostedZone(stack, `EcsAgentHostedZone`, {
  hostedZoneName: ecsAgentHostedZoneName,
  vpcId: 'Test',
});

new HostedZone(stack, `EcsTelemetryHostedZone`, {
  hostedZoneName: ecsTelemetryHostedZoneName,
  vpcId: 'Test',
});

new HostedZone(stack, `SageMakerNoteBookHostedZone`, {
  hostedZoneName: sageMakerNotebookHostedZoneName,
  vpcId: 'Test',
});

new HostedZone(stack, `SageMakerStudioHostedZone`, {
  hostedZoneName: sageMakerStudioHostedZoneName,
  vpcId: 'Test',
});

/**
 * HostedZone construct test
 */
describe('HostedZone', () => {
  snapShotTest(testNamePrefix, stack);
});
