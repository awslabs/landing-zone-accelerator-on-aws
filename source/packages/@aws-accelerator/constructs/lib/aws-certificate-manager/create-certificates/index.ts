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
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  ACMClient,
  DeleteCertificateCommand,
  ImportCertificateCommand,
  ImportCertificateResponse,
  RequestCertificateCommand,
  RequestCertificateResponse,
  ValidationMethod,
} from '@aws-sdk/client-acm';
import {
  DeleteParameterCommand,
  GetParameterCommand,
  ParameterNotFound,
  ParameterType,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { Readable } from 'stream';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * add-macie-members - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  //set variables from event
  const parameterName: string = event.ResourceProperties['parameterName'];
  const type: string = event.ResourceProperties['type'];
  const privKey: string | undefined = event.ResourceProperties['privKey'];
  const cert: string | undefined = event.ResourceProperties['cert'];
  const chain: string | undefined = event.ResourceProperties['chain'];
  const validation: ValidationMethod | undefined = event.ResourceProperties['validation'];
  const domain: string | undefined = event.ResourceProperties['domain']!;
  const sanString: string | undefined = event.ResourceProperties['san'];
  const assetBucketName: string = event.ResourceProperties['assetBucketName'];
  const homeRegion: string = event.ResourceProperties['homeRegion'];

  const san = sanString ? sanString.split(',') : undefined;
  const solutionId = process.env['SOLUTION_ID'];

  const acmClient = new ACMClient({
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  const s3Client = new S3Client({ customUserAgent: solutionId, region: homeRegion, retryStrategy: setRetryStrategy() });
  const ssmClient = new SSMClient({
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  const certArn = await getCertificateArnFromSsm(ssmClient, parameterName);
  switch (event.RequestType) {
    case 'Create':
      if (certArn) {
        console.log(`Certificate "${parameterName}" is already imported`);
      } else {
        await createUpdateEventHandler({
          acmClient,
          s3Client,
          ssmClient,
          parameterName,
          type,
          assetBucketName,
          privKey,
          cert,
          chain,
          domain,
          validation,
          san,
        });
      }
      break;
    case 'Update':
      if (!certArn) {
        throw new Error(`SSM Parameter "${parameterName}" for Certificate is not found.`);
      }
      await createUpdateEventHandler({
        acmClient,
        s3Client,
        ssmClient,
        parameterName,
        type,
        assetBucketName,
        privKey,
        cert,
        chain,
        domain,
        validation,
        san,
        certificateArn: certArn,
      });
      break;
    case 'Delete':
      if (certArn) {
        await throttlingBackOff(() => acmClient.send(new DeleteCertificateCommand({ CertificateArn: certArn })));
        await throttlingBackOff(() => ssmClient.send(new DeleteParameterCommand({ Name: parameterName })));
      }
      break;
  }
  return { Status: 'Success', StatusCode: 200 };
}

/**
 * Function to handle create or update event for the custom resource lambda function
 * @param props
 */
async function createUpdateEventHandler(props: {
  acmClient: ACMClient;
  s3Client: S3Client;
  ssmClient: SSMClient;
  parameterName: string;
  type: string;
  assetBucketName: string;
  certificateArn?: string;
  privKey?: string;
  cert?: string;
  chain?: string;
  domain?: string;
  validation?: ValidationMethod;
  san?: string[];
}): Promise<void> {
  let certificateArn: RequestCertificateResponse | ImportCertificateResponse | undefined;
  switch (props.type) {
    case 'import':
      const privKeyContent = await getS3FileContents(props.assetBucketName, props.s3Client, props.privKey);
      const certContent = await getS3FileContents(props.assetBucketName, props.s3Client, props.cert);
      const chainContents = await getS3FileContents(props.assetBucketName, props.s3Client, props.chain);
      certificateArn = await createImportCertificate(
        props.acmClient,
        certContent,
        chainContents,
        privKeyContent,
        props.certificateArn,
      );
      break;
    case 'request':
      certificateArn = await createRequestCertificate(props.acmClient, props.domain, props.validation, props.san);
      break;
    default:
      throw new Error(
        `Invalid certificate type ${props.type} !!!. Valid certificate types can be either import or request !!!!`,
      );
  }
  await createCertificateSsmParameter(props.ssmClient, props.parameterName, certificateArn!);
}

/**
 * Function to get S3 file contents for certificate details
 * @param s3BucketName string
 * @param s3Client {@link S3Client}
 * @param s3Key string
 * @returns
 */
async function getS3FileContents(
  s3BucketName: string,
  s3Client: S3Client,
  s3Key?: string,
): Promise<string | undefined> {
  if (s3Key) {
    const response = await throttlingBackOff(() =>
      s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key })),
    );
    const stream = response.Body as Readable;
    return streamToString(stream);
  } else {
    return undefined;
  }
}

async function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * Function to create Import/ReImport Certificate
 * ReImport certificate if `certArn` is passed.
 * @param acmClient {@link ACMClient}
 * @param cert string
 * @param chain string
 * @param privKey string
 * @returns certificate {@link ImportCertificateResponse}
 */
async function createImportCertificate(
  acmClient: ACMClient,
  cert?: string,
  chain?: string,
  privKey?: string,
  certArn?: string,
): Promise<ImportCertificateResponse> {
  if (!cert || !privKey) {
    throw new Error('Missing certificate or private key in custom resource event properties');
  }

  // Convert strings to Uint8Array
  const certificateBuffer = Buffer.from(cert, 'utf-8');
  const privateKeyBuffer = Buffer.from(privKey, 'utf-8');
  const chainBuffer = chain ? Buffer.from(chain, 'utf-8') : undefined;

  return await throttlingBackOff(() =>
    acmClient.send(
      new ImportCertificateCommand({
        Certificate: certificateBuffer,
        CertificateChain: chainBuffer,
        PrivateKey: privateKeyBuffer,
        CertificateArn: certArn,
      }),
    ),
  );
}

/**
 * Function to create request certificate
 * @param acmClient {@link ACMClient}
 * @param domain string
 * @param validation string
 * @param san string
 * @returns certificate {@link RequestCertificateResponse}
 */
async function createRequestCertificate(
  acmClient: ACMClient,
  domain?: string,
  validation?: ValidationMethod,
  san?: string[],
): Promise<RequestCertificateResponse> {
  if (!domain) {
    throw new Error('Missing domain in custom resource event properties');
  }

  return await throttlingBackOff(() =>
    acmClient.send(
      new RequestCertificateCommand({ DomainName: domain, ValidationMethod: validation, SubjectAlternativeNames: san }),
    ),
  );
}

/**
 * Function to create SSM parameter to store certificate arn value
 * @param ssmClient {@link SSMClient}
 * @param parameterName string
 * @param certificateArnItem {@link RequestCertificateResponse} | {@link ImportCertificateResponse}
 */
async function createCertificateSsmParameter(
  ssmClient: SSMClient,
  parameterName: string,
  certificateArnItem: RequestCertificateResponse | ImportCertificateResponse,
): Promise<void> {
  if (!certificateArnItem.CertificateArn) {
    throw new Error(
      `Missing certificateArn value in ACM client response, unable to create certificate SSM parameter ${parameterName} !!!`,
    );
  }

  await throttlingBackOff(() =>
    ssmClient.send(
      new PutParameterCommand({
        Name: parameterName,
        Value: certificateArnItem.CertificateArn!,
        Type: ParameterType.STRING,
        Overwrite: true,
      }),
    ),
  );
}

async function getCertificateArnFromSsm(ssmClient: SSMClient, parameterName: string) {
  let certificateArn: string | undefined;
  try {
    const response = await throttlingBackOff(() => ssmClient.send(new GetParameterCommand({ Name: parameterName })));
    certificateArn = response.Parameter?.Value;
  } catch (e: unknown) {
    if (e instanceof ParameterNotFound) {
      console.log(`No Parameter "${parameterName}" found for Certificate ARN`);
    } else {
      throw e;
    }
  }
  return certificateArn;
}
