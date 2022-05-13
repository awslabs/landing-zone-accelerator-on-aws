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

import { Construct } from 'constructs';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';

/**
 * Initialized Repository properties
 */
export interface RepositoryProps extends codecommit.RepositoryProps {
  /**
   * Name of the repository.
   *
   * This property contains s3 bucket name to initialize CodeCommit repositories.
   *
   *
   */
  readonly s3BucketName: string;
  /**
   * Name of the repository.
   *
   * This property contains s3 object key for initializing CodeCommit repositories.
   *
   *
   */
  readonly s3key: string;
  /**
   * A branch name of the repository to be initialized.
   *
   * This is an optional property
   *
   * @default - main
   */
  readonly repositoryBranchName?: string;
}

/**
 * Class to initialize repository
 */
export class Repository extends codecommit.Repository {
  constructor(scope: Construct, id: string, props: RepositoryProps) {
    super(scope, id, props);

    const cfnRepository = this.node.defaultChild as codecommit.CfnRepository;

    cfnRepository.code = {
      branchName: props.repositoryBranchName ? props.repositoryBranchName : 'main',
      s3: {
        bucket: props.s3BucketName,
        key: props.s3key,
      },
    };
  }
}
