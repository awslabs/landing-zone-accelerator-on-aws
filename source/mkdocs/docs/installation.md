# Installation

For a full overview on installation of the solution, you can follow the step-by-step instructions in the [Deploy the solution](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/deploy-the-solution.html) section of the solution [Implementation Guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/solution-overview.html). Alternatively, you may follow the steps below to locally synthesize and deploy the solution installer template from source code.

## Creating an Installer Stack

The Installer Stack CDK application can be deployed using a CloudFormation template produced by completing a CDK synthesis on a local copy of the solution source code. After synthesis, the template can either be deployed using the AWS CLI or the AWS Management Console. Below are the steps for completing the deployment of the Installer stack.

### 1. Build the Installer stack for deployment

1. Install dependencies for the Installer stack
    * [NodeJS](https://nodejs.org/en/)
    * [AWS CDK](https://aws.amazon.com/cdk/)
    * [Yarn](https://yarnpkg.com/)
    * [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

2. Install project dependencies
```
cd <rootDir>/source
yarn install
```

3. To run the CDK synthesis
```
cd <rootDir>/source/packages/@aws-accelerator/installer
yarn build && yarn cdk synth
```

After running these commands, the Installer stack template will be saved to `<rootDir>/source/packages/@aws-accelerator/installer/cdk.out/AWSAccelerator-InstallerStack.template.json`

!!! note
    `<rootDir>` is the local directory where you have cloned the solution source code.
    For more information on using the development toolchain, please see [Development Dependencies](./developer-guide/dependencies.md).

### 2. Create a GitHub personal access token

Follow the instructions on [GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-personal-access-token-classic) to create a personal access token (Classic).

When creating the token select `public_repo` for the selected scope.

### 3. Store Token in Secrets Manager

You must store the personal access token in Secrets Manager in the account and region the solution will be deployed to.

1. In the AWS Management Console, navigate to Secrets Manager
2. Click Store a new secret
3. On the Choose secret type step select Other type of secret
4. Select the Plaintext tab
5. Completely remove the example text and paste your secret with no formatting no leading or trailing spaces
6. Select the `aws/secretsmanager` AWS-managed KMS key or a customer-managed key that you own
7. Click Next
8. On the Configure secret step, set the Secret name to accelerator/github-token
9. On the Configure rotation step, click Next
10. On the Review step, click Store

### 4. Deploy the Installer stack

1. Configure the AWS CLI CloudFormation command for the Installer stack
2. Create an S3 bucket and copy the generated template file.
```
cd <rootDir>/source/packages/@aws-accelerator/installer
export BUCKET_NAME=<bucket name>
aws s3 mb s3://$BUCKET_NAME
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3api head-bucket --bucket $BUCKET_NAME --expected-bucket-owner $ACCOUNT_ID
aws s3 cp ./cdk.out/AWSAccelerator-InstallerStack.template.json s3://$BUCKET_NAME
```
3. Create the Installer stack with AWS CLI command:
```
aws cloudformation create-stack --stack-name AWSAccelerator-InstallerStack --template-url https://$BUCKET_NAME.s3.<region>.amazonaws.com/AWSAccelerator-InstallerStack.template.json \
--parameters ParameterKey=RepositoryName,ParameterValue=<Repository_Name> \
ParameterKey=RepositoryBranchName,ParameterValue=<Branch_Name> \
ParameterKey=ManagementAccountEmail,ParameterValue=<Management_Email> \
ParameterKey=LogArchiveAccountEmail,ParameterValue=<LogArchive_Email> \
ParameterKey=AuditAccountEmail,ParameterValue=<Audit_Email> \
ParameterKey=EnableApprovalStage,ParameterValue=Yes \
ParameterKey=ApprovalStageNotifyEmailList,ParameterValue=<Comma_Delimited_Notify_Emails> \
ParameterKey=ControlTowerEnabled,ParameterValue=Yes \
--capabilities CAPABILITY_IAM
```
4. _**(Optional)**_ Alternate deployment of CloudFormation via AWS console:
    1. From your Management account, navigate to CloudFormation page in the AWS console
    2. Select ‘Create Stack’ and from the dropdown pick ‘with new resources (standard)’
    3. For the prerequisite template, select ‘Template is ready’
    4. When specifying the template, select ‘Upload a template file’
    5. Ensure that you select the correct file ‘AWSLandingZoneAccelerator-InstallerStack.template.json’
    6. Fill out the required parameters in the UI, and create the stack once the parameters are inputted.