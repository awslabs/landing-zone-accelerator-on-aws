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
import { describe, beforeEach, expect, test, vi } from 'vitest';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getS3ObjectContent, uploadFileToS3 } from '../../common/s3-functions';
import { MODULE_EXCEPTIONS } from '../../common/enums';

vi.mock('../../common/throttle', () => ({
  throttlingBackOff: vi.fn(fn => fn()),
}));

vi.mock('../../common/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  GetObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
  PutObjectCommand: vi.fn(),
}));

vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(encoding => {
      if (encoding === 'hex') {
        return 'mocked-md5-hash';
      }
      return Buffer.from('mocked-md5-hash', 'hex');
    }),
  })),
}));

describe('s3-functions', () => {
  const mockSend = vi.fn();
  const mockS3Client = { send: mockSend } as unknown as S3Client;
  const bucketName = 'test-bucket';
  const objectPath = 'test/file.txt';
  const fileContent = 'test content';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getS3ObjectContent', () => {
    test('should retrieve S3 object content successfully', async () => {
      // Setup
      const mockBody = {
        transformToString: vi.fn().mockResolvedValue(fileContent),
      };
      mockSend.mockResolvedValue({
        Body: mockBody,
      });

      // Execute
      const result = await getS3ObjectContent(mockS3Client, bucketName, objectPath);

      // Verify
      expect(result).toBe(fileContent);
      expect(mockSend).toHaveBeenCalledWith(expect.any(GetObjectCommand));
      expect(mockBody.transformToString).toHaveBeenCalled();
    });

    test('should throw error when S3 object has no body', async () => {
      // Setup
      mockSend.mockResolvedValue({
        Body: null,
      });

      // Execute & Verify
      await expect(getS3ObjectContent(mockS3Client, bucketName, objectPath)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: S3 object at s3://${bucketName}/${objectPath} has no body content`,
      );
    });

    test('should throw error when S3 operation fails', async () => {
      // Setup
      const s3Error = new Error('Access denied');
      mockSend.mockRejectedValue(s3Error);

      // Execute & Verify
      await expect(getS3ObjectContent(mockS3Client, bucketName, objectPath)).rejects.toThrow(s3Error);
    });
  });

  describe('uploadFileToS3', () => {
    test('should upload file to S3 successfully', async () => {
      // Setup
      const expectedMD5 = 'mocked-md5-hash';
      mockSend
        .mockResolvedValueOnce({}) // PutObjectCommand
        .mockResolvedValueOnce({
          // HeadObjectCommand
          ETag: `"${expectedMD5}"`,
        });

      // Execute
      await uploadFileToS3(mockS3Client, bucketName, objectPath, fileContent);

      // Verify
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(PutObjectCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(HeadObjectCommand));
    });

    test('should throw error when upload verification fails due to MD5 mismatch', async () => {
      // Setup
      mockSend
        .mockResolvedValueOnce({}) // PutObjectCommand
        .mockResolvedValueOnce({
          // HeadObjectCommand
          ETag: '"different-md5-hash"',
        });

      // Execute & Verify
      await expect(uploadFileToS3(mockS3Client, bucketName, objectPath, fileContent)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Upload verification failed: MD5 mismatch. Local: mocked-md5-hash, S3: different-md5-hash for  s3://${bucketName}/${objectPath} file.`,
      );
    });

    test('should throw error when PutObjectCommand fails', async () => {
      // Setup
      const uploadError = new Error('Upload failed');
      mockSend.mockRejectedValue(uploadError);

      // Execute & Verify
      await expect(uploadFileToS3(mockS3Client, bucketName, objectPath, fileContent)).rejects.toThrow(uploadError);
    });

    test('should throw error when HeadObjectCommand fails during verification', async () => {
      // Setup
      const verificationError = new Error('Head object failed');
      mockSend
        .mockResolvedValueOnce({}) // PutObjectCommand succeeds
        .mockRejectedValue(verificationError); // HeadObjectCommand fails

      // Execute & Verify
      await expect(uploadFileToS3(mockS3Client, bucketName, objectPath, fileContent)).rejects.toThrow(
        verificationError,
      );
    });

    test('should handle ETag without quotes', async () => {
      // Setup
      const expectedMD5 = 'mocked-md5-hash';
      mockSend
        .mockResolvedValueOnce({}) // PutObjectCommand
        .mockResolvedValueOnce({
          // HeadObjectCommand
          ETag: expectedMD5, // No quotes around ETag
        });

      // Execute
      await uploadFileToS3(mockS3Client, bucketName, objectPath, fileContent);

      // Verify
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    test('should handle missing ETag in verification', async () => {
      // Setup
      mockSend
        .mockResolvedValueOnce({}) // PutObjectCommand
        .mockResolvedValueOnce({
          // HeadObjectCommand
          ETag: undefined,
        });

      // Execute & Verify
      await expect(uploadFileToS3(mockS3Client, bucketName, objectPath, fileContent)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Upload verification failed: MD5 mismatch. Local: mocked-md5-hash, S3: undefined for  s3://${bucketName}/${objectPath} file.`,
      );
    });
  });
});
