# Installation for AWS China region

## Step 1

* Create Management account.
* Create Organization for Management account.
* Create other mandatory accounts: LogArchive and Audit
* Invite the mandatory accounts to the AWS Organization.
* Create cross account roles in non-management accounts.

## Step 2

* Login to Management account, create codecommit repo
* Push the code to the codecommit repo above
* Create CloudFormation stack [AWSAccelerator-InstallerStack.template](./AWSAccelerator-InstallerStack.template)
  > Note: Please input the required email address for all accounts.

## Step 3

* Update the option `controlTower` to `false` in the newly created codecommit repo `aws-accelerator-config/global-config.yaml`
* Re-trigger the pipeline
