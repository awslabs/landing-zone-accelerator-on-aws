# Deploying Custom Terraform to LZA-Managed Accounts with AFT

As organizations scale their AWS environments, managing infrastructure consistently while enabling team autonomy becomes increasingly challenging. Landing Zone Accelerator on AWS (LZA) and AWS Account Factory for Terraform (AFT) both extend AWS Control Tower to help customers manage AWS environments at scale, offering complementary strengths.

Many AWS customers struggle to balance centralized security governance with the need for team autonomy when deploying infrastructure at scale. Teams want to use Terraform for infrastructure as code, but maintaining consistent security baselines across hundreds of accounts while enabling customization becomes increasingly complex.

This guide builds upon our earlier post [Using Terraform with Landing Zone Accelerator on AWS](https://aws.amazon.com/blogs/mt/using-terraform-with-landing-zone-accelerator-on-aws/) and extends it further to provide a solution for deploying Terraform in a managed, repeatable way. In this post, we'll show you how to integrate LZA with AFT within your Control Tower environment, creating a powerful solution that enhances your security posture while accelerating infrastructure deployment through automated Terraform workflows. This integration enables organizations to implement proven security baselines and governance controls through LZA while leveraging AFT's enterprise-ready Terraform deployment engine, providing teams with a robust, automated approach to infrastructure management.

## Overview of Solution

This solution integrates Landing Zone Accelerator on AWS with Account Factory for Terraform by deploying AFT within your LZA-managed environment. When you create new accounts through LZA, they can then be registered with AFT, enabling the deployment of custom Terraform modules while maintaining LZA's governance controls. The integration leverages LZA's existing account structure, with AFT deployed in a dedicated account that orchestrates Terraform deployments across your environment. 

**Key benefits include:**

- Centralized governance
- Automated account provisioning  
- Support for existing Terraform modules

## Walkthrough

This post will show you how to deploy Account Factory for Terraform to your existing Landing Zone Accelerator environment. Once deployed, we'll show you how to use the solutions together to create new AWS accounts and deploy your Terraform templates to them.

This will take place over 4 steps:

1. [Provision the AFT Management Account](#step-1-provision-the-aft-management-account)
2. [Deploy AFT to an LZA-Managed Environment](#step-2-deploy-aft-to-an-lza-managed-environment)
3. [Account Creation and Registration](#step-3-new-account-creation)
4. [Deploy Custom Terraform](#step-4-deploy-custom-terraform)

## Prerequisites

When implementing this solution, consider that you'll need additional AWS resources to support AFT, including an AFT management account and associated pipeline infrastructure. The primary cost implications come from these AFT management resources, which typically include AWS CodePipeline, AWS CodeBuild, and Amazon S3 storage for Terraform state files. While the actual cost will vary based on your deployment frequency and scale, most organizations find the operational efficiency gains outweigh the minimal additional infrastructure costs.

For this walkthrough, you should have the following prerequisites:

- An AWS environment with AWS Control Tower and LZA deployed. You can follow the [implementation guide for LZA](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/) to get started
- Ability to modify the LZA configuration files
- IAM role with `AdministratorAccess` policy attached for the AWS Control Tower management account
- Terraform version compatible with AFT
- AWS CodeCommit or other compatible version control system (VCS)

## Step 1: Provision the AFT Management Account

In alignment with AFT recommendations, create an organizational unit (OU) for hosting the AFT management account. We will use the LZA to create a new OU and AWS account by updating the LZA configuration files stored in AWS CodeCommit, Amazon S3, or AWS CodeConnections. Check the `ConfigurationRepositoryLocation` parameter of the LZA Installer Stack CloudFormation stack to find your LZA configuration files.

1. **Append a new OU** to the `organizationalUnits` field of your `organizations-config.yaml` to create a new OU:

    ```yaml
    organizationalUnits:
      - name: Security
      - name: Infrastructure
      - name: $OU_NAME
    ```

2. **Append a new account** to the `workloadAccounts` field of your `accounts-config.yaml` to create a new AWS account:

    ```yaml
    workloadAccounts:
      - name: AFT
        description: The management account for AFT
        email: $AFT_MANAGEMENT_ACCOUNT_EMAIL
        organizationalUnit: $OU_NAME
        warm: false
    ```

3. **Commit and push** your updated LZA configuration files to your AWS CodeCommit repository (or your configured version control system).

4. In the AWS console, navigate to **AWS CodePipeline** and select the LZA pipeline (typically named `AWSAccelerator-Pipeline`).

5. Click **Release change** to start the pipeline manually using the updated configuration files.

## Step 2: Deploy AFT to an LZA-managed Environment

Start the AFT deployment process by following [these instructions on setting up your VCS for AFT](https://docs.aws.amazon.com/controltower/latest/userguide/aft-getting-started.html#aft-getting-started-vcs). Create a new Terraform project in your preferred location (this will be separate from your LZA configuration). In this project, create a `main.tf` file and add the following module configuration:

```terraform
module "aft" {
  source = "github.com/aws-ia/terraform-aws-control_tower_account_factory"
  
  aft_management_account_id     = [AFT_MANAGEMENT_ACCOUNT_ID]
  audit_account_id              = [AUDIT_ACCOUNT_ID]
  log_archive_account_id        = [LOG_ACCOUNT_ID]
  ct_home_region               = [HOME_REGION]
  ct_management_account_id     = [CONTROL_TOWER_MANAGEMENT_ACCOUNT_ID]
}
```

Here is a description of each of the fields referenced in the module:

- **AFT_MANAGEMENT_ACCOUNT_ID**: The AWS Account ID for the AFT management account created in Step 1
- **AUDIT_ACCOUNT_ID**: The AWS Account ID for the audit account created by the LZA deployment
- **LOG_ACCOUNT_ID**: The AWS Account ID for the logging account created by the LZA deployment
- **HOME_REGION**: The AWS region used as the home region for the LZA deployment
- **CONTROL_TOWER_MANAGEMENT_ACCOUNT_ID**: The AWS Account ID for the Control Tower management account

Replace the bracketed values with your actual account IDs and region. Make sure to add any parameters required by your chosen VCS.

### To deploy the AFT Terraform module in your environment

1. Assume the IAM role with the `AdministratorAccess` policy for the Control Tower management account.

2. Apply the terraform project using the command `terraform apply` to deploy the necessary resources for AFT in the Control Tower management account and the AFT management account.

3. Wait for the pipelines created in the AFT management account to complete successfully.

Once these pipelines have completed successfully, you have completed the installation of AFT in your account.

!!! note
    If you are using an external VCS, you need to complete the connection to your repository as noted in the instructions for setting up your VCS for AFT. If your pipelines fail, you may need to re-invoke these pipelines manually to finish the installation process.

## Step 3: New Account Creation

Account creation is performed by updating the LZA configuration files the same way we would without AFT deployed. Update the `account-config.yaml` file to include the new accounts you need as we did in the [Provision the AFT Management Account](#step-1-provision-the-aft-management-account) step and let the LZA deployment pipeline run.

### Create a new AWS Account with LZA and register it with AFT

1. **Create a new account** through Landing Zone Accelerator (LZA).

2. **Register the account** with Account Factory for Terraform (AFT). In the `aft-account-request` repository, create a new account request in the `terraform/` directory. Make sure to update the `AccountEmail`, `AccountName`, and the `account_customizations_name` parameters. The email and name should match what was added to the LZA configuration. The customizations name is used to determine what customizations will be deployed to this account. Save these changes and push them to the VCS provider.

3. In the AFT Management account, open the **AWS CodePipeline** console and navigate to the **Pipelines** view.

4. Monitor the `ct-aft-account-request` pipeline as it executes the account customization deployment.

5. After the pipeline has completed successfully, verify that a new account-specific pipeline appears in the pipeline list to deploy the customizations.

## Step 4: Deploy Custom Terraform

There are two ways to add customizations through AFT:

- **Global customizations** are deployed to all accounts registered with AFT. Global customizations are added in the `aft-global-customizations` repository under the `terraform/` directory.

- **Account customizations** are deployed based on the `account_customizations_name` specified when you imported the account into AFT. Every account with the specified name will get the corresponding customizations deployed to them. Account customizations are added in the `aft-account-customizations` repository under the `[ACCOUNT_CUSTOMIZATION_NAME]/terraform/` directory.

When a new account is registered, a pipeline will be automatically created and triggered to deploy all applicable customizations to the account. For customizations added after the account registration process, the customizations pipelines must be manually invoked. 

### Deploying Custom Terraform through AFT to Existing Accounts

1. **Update your AFT configuration** with desired customizations.

2. Navigate to the `aft-invoke-customizations` Step Function in the AFT management account.

3. **Trigger the Step Function** with the following input:

    ```json
    {
      "include": [
        {
          "type": "all"
        }
      ]
    }
    ```

AFT provides different parameters you can specify to determine which accounts are updated based on the invocation. To learn more, refer to [AFT's guide on re-invoking customizations](https://docs.aws.amazon.com/controltower/latest/userguide/aft-account-customization-options.html).

## Cleaning up

To remove an account from this environment, we will first remove the account from AFT and then from LZA.

### Removing an account from AFT
To remove an account from AFT, follow the [official AFT documentation on removing accounts](https://docs.aws.amazon.com/controltower/latest/userguide/aft-remove-account.html). This process involves removing the account request from the `aft-account-request` repository and allowing AFT to process the deletion through its automated pipeline.

### Removing an account from LZA
Once the account is successfully removed from AFT, you can proceed to close the account in LZA by following the [AWS documentation on closing accounts managed by LZA](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/uninstall-the-solution.html). This ensures proper cleanup of all LZA-managed resources and configurations associated with the account.

!!! warning
    Always remove accounts from AFT before removing them from LZA to avoid orphaned resources and ensure proper cleanup of all Terraform-managed infrastructure.

## Conclusion

By integrating Landing Zone Accelerator on AWS with Account Factory for Terraform, organizations can maintain robust governance while enabling teams to deploy custom Terraform modules across their AWS environment. This approach solves a common challenge for enterprises scaling their cloud operations: balancing centralized control with team flexibility. Through this integration, you can leverage LZA's strong governance foundation while taking advantage of AFT's Terraform deployment capabilities, giving your teams the freedom to use their preferred infrastructure-as-code tools. 

We encourage you to explore this solution further by starting with a test environment, and then gradually expanding to support more complex Terraform deployments as your comfort with the integration grows. For additional information, visit the [Landing Zone Accelerator on AWS](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/) and [Account Factory for Terraform](https://docs.aws.amazon.com/controltower/latest/userguide/aft-overview.html) documentation, or engage with AWS Support for specific guidance on your implementation.
