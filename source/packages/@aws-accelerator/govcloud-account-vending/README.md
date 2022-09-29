# Landing Zone Accelerator on AWS - GovCloud Account Vending 

Create GovCloud (US) account using Service Catalog.

## Pre-requisites
Make sure the workstation has `yarn`, `node`, `cdk` and `awscli`. The account should satisfy all the necessary requirements to run [CreateGovCloudAccount](https://docs.aws.amazon.com/organizations/latest/APIReference/API_CreateGovCloudAccount.html). **An IAM role, user or group arn that will be used as an input to the CloudFormation template.** This arn will have access to deploy the Service Catalog resource. 
Only deploy this in standard (commercial) AWS Partition. The solution assumes a role in `us-east-1` region.

## Steps
1. Clone the repo and run 
    - `cd source`
    - `yarn install`
    - `yarn lerna link`
    - `yarn build`
    - `cd packages/@aws-accelerator/govcloud-account-vending `
    - `yarn cdk deploy --require-approval never `

2. After the stack is deployed, access AWS console and [grant access to user/role/group](https://docs.aws.amazon.com/servicecatalog/latest/adminguide/catalogs_portfolios_users.html). 
3. Navigate to service catalog in the region that stack was deployed. Under products, choose *AWS Landing Zone Accelerator - GovCloud Account Vending* and click Launch.
4. Fill out the information in the product
    - Product name: Name for the product. The name must start with a letter (A-Z, a-z) or number (0-9). Other valid characters include: hyphen (-), underscore (_), and period (.). 
    - Account Name: The friendly name of the member account.  The account name can consist of only the characters [a-z],[A-Z],[0-9], hyphen (-), or dot (.) You can't separate characters with a dash (–).
    - Account Email: Specifies the email address of the owner to assign to the new member account in the commercial Region. This email address must not already be associated with another AWS account. You must use a valid email address to complete account creation.
    - Organization Role Name: The name of an IAM role that AWS Organizations automatically preconfigures in the new member accounts in both the AWS GovCloud (US) Region and in the commercial Region. This role trusts the management account, allowing users in the management account to assume the role, as permitted by the management account administrator. The role has administrator permissions in the new member account. Defaults to `OrganizationAccountAccessRole`.

5. After the product is created, under the Events tab in Output Key and Value there will be account ID for `GovCloudAccountId` & `AccountId`.