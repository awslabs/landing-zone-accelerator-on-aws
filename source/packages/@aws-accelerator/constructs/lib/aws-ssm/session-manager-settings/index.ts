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

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  CreateDocumentCommand,
  CreateDocumentCommandInput,
  DuplicateDocumentContent,
  GetDocumentCommand,
  InvalidDocument,
  SSMClient,
  UpdateDocumentCommand,
  UpdateDocumentCommandInput,
} from '@aws-sdk/client-ssm';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

const documentName = 'SSM-SessionManagerRunShell';

interface ShellProfile {
  windows?: string;
  linux?: string;
}

/**
 * The `inputs` block of the `Standard_Stream` session document this custom resource owns.
 *
 * @remarks
 * The optional members are the session preference inputs. They are declared last so that the
 * serialized document is byte for byte identical to the previous releases' output when none of them
 * is configured and the existing document carries none of them.
 *
 * @see {@link https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-schema.html | Session document schema}
 */
interface SessionDocumentInputs {
  cloudWatchEncryptionEnabled: boolean;
  cloudWatchLogGroupName: string;
  kmsKeyId: string;
  s3BucketName: string;
  s3EncryptionEnabled: boolean;
  s3KeyPrefix: string;
  runAsEnabled: boolean;
  runAsDefaultUser: string;
  cloudWatchStreamingEnabled?: boolean;
  idleSessionTimeout?: string;
  maxSessionDuration?: string;
  shellProfile?: ShellProfile;
}

/**
 * The session preference inputs, as supplied by the configuration file.
 *
 * @remarks
 * `idleSessionTimeout` and `maxSessionDuration` are strings because the session document schema
 * types them as strings, even though the configuration file takes them as numbers of minutes.
 */
interface ConfiguredSessionPreferences {
  cloudWatchStreamingEnabled?: boolean;
  idleSessionTimeout?: string;
  maxSessionDuration?: string;
  shellProfile?: ShellProfile;
}

/**
 * Applies the session preference inputs to the document being written.
 *
 * @param inputs The document inputs to mutate
 * @param configured The values supplied by the configuration file
 *
 * @remarks
 * Configuration is the only authority for these inputs. A value set in `global-config.yaml` is
 * written on every run, so one changed out of band is corrected on the next invocation. A preference
 * that is not configured is left out of the document entirely, so the Session Manager default
 * applies.
 *
 * Deliberately no fallback to the deployed document. That matters most for `shellProfile`, whose
 * commands run on every in-scope managed node at session start: carrying an unconfigured value
 * forward would let a principal holding `ssm:UpdateDocument` in a member account inject executable
 * content that the accelerator then re-persists indefinitely. Rewriting the document from
 * configuration is what corrects that drift.
 */
function applySessionPreferences(inputs: SessionDocumentInputs, configured: ConfiguredSessionPreferences): void {
  if (configured.cloudWatchStreamingEnabled !== undefined) {
    inputs.cloudWatchStreamingEnabled = configured.cloudWatchStreamingEnabled;
  }
  if (configured.idleSessionTimeout !== undefined) {
    inputs.idleSessionTimeout = configured.idleSessionTimeout;
  }
  if (configured.maxSessionDuration !== undefined) {
    inputs.maxSessionDuration = configured.maxSessionDuration;
  }
  if (configured.shellProfile !== undefined) {
    inputs.shellProfile = configured.shellProfile;
  }
}

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const sendToS3: boolean = event.ResourceProperties['sendToS3'] === 'true';
  let s3BucketName: string = event.ResourceProperties['s3BucketName'];
  let s3KeyPrefix: string = event.ResourceProperties['s3KeyPrefix'];
  let s3EncryptionEnabled: boolean = event.ResourceProperties['s3EncryptionEnabled'] === 'true';
  const cloudWatchLogGroupName: string = event.ResourceProperties['cloudWatchLogGroupName'];
  const cloudWatchEncryptionEnabled: boolean = event.ResourceProperties['cloudWatchEncryptionEnabled'] === 'true';
  const kmsKeyId: string = event.ResourceProperties['kmsKeyId'];
  const solutionId = process.env['SOLUTION_ID'];

  // CloudFormation stringifies custom resource property values, so an absent property arrives as
  // undefined and a boolean arrives as 'true' or 'false'. The two timeouts are forwarded as the
  // strings the session document schema requires.
  const rawCloudWatchStreamingEnabled: string | undefined = event.ResourceProperties['cloudWatchStreamingEnabled'];
  const configuredPreferences: ConfiguredSessionPreferences = {
    cloudWatchStreamingEnabled:
      rawCloudWatchStreamingEnabled === undefined ? undefined : rawCloudWatchStreamingEnabled === 'true',
    idleSessionTimeout: event.ResourceProperties['idleSessionTimeout'],
    maxSessionDuration: event.ResourceProperties['maxSessionDuration'],
    shellProfile: event.ResourceProperties['shellProfile'],
  };

  const ssm = new SSMClient({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      // Based on doc: https://docs.aws.amazon.com/systems-manager/latest/userguide/getting-started-configure-preferences-cli.html
      if (!sendToS3) {
        s3BucketName = '';
        s3EncryptionEnabled = false;
        s3KeyPrefix = '';
      }
      const settings: {
        schemaVersion: string;
        description: string;
        sessionType: string;
        inputs: SessionDocumentInputs;
      } = {
        schemaVersion: '1.0',
        description: 'Document to hold regional settings for Session Manager',
        sessionType: 'Standard_Stream',
        inputs: {
          cloudWatchEncryptionEnabled,
          cloudWatchLogGroupName,
          kmsKeyId,
          s3BucketName,
          s3EncryptionEnabled,
          s3KeyPrefix: s3KeyPrefix ?? '',
          runAsEnabled: false,
          runAsDefaultUser: '',
        },
      };
      applySessionPreferences(settings.inputs, configuredPreferences);
      try {
        const getDocumentResult = await throttlingBackOff(() =>
          ssm.send(new GetDocumentCommand({ Name: documentName })),
        );
        if (!getDocumentResult.Content) {
          throw new Error('Error reading regional settings from SSM document. Content seems to be undefined.');
        }
        const json = JSON.parse(getDocumentResult.Content);

        // Prefer the values from the existing document if present
        settings.inputs.runAsEnabled = json?.inputs?.runAsEnabled ?? settings.inputs.runAsEnabled;
        settings.inputs.runAsDefaultUser = json?.inputs?.runAsDefaultUser ?? settings.inputs.runAsDefaultUser;

        const updateDocumentRequest: UpdateDocumentCommandInput = {
          Content: JSON.stringify(settings),
          Name: documentName,
          DocumentVersion: '$LATEST',
        };
        console.log('Update SSM Document Request: ', updateDocumentRequest);
        await throttlingBackOff(() => ssm.send(new UpdateDocumentCommand(updateDocumentRequest)));
        console.log('Update SSM Document Success');
      } catch (e: unknown) {
        if (e instanceof DuplicateDocumentContent) {
          console.log(`SSM Document is Already latest :${documentName}`);
        } else if (e instanceof InvalidDocument) {
          const createDocumentRequest: CreateDocumentCommandInput = {
            Content: JSON.stringify(settings),
            Name: documentName,
            DocumentType: `Session`,
          };
          console.log('Create SSM Document Request: ', createDocumentRequest);
          await throttlingBackOff(() => ssm.send(new CreateDocumentCommand(createDocumentRequest)));
          console.log('Create SSM Document Success');
        } else {
          throw new Error(`Error while updating SSM Document :${documentName}. Received: ${JSON.stringify(e)}`);
        }
      }

      return {
        PhysicalResourceId: 'session-manager-settings',
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
