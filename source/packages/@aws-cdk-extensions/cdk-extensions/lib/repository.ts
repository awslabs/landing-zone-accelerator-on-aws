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
