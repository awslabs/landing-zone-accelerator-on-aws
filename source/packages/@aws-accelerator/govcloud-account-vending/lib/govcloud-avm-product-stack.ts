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
import { Construct } from 'constructs';

export interface GovCloudAccountVendingProductStackProps extends cdk.StackProps {
  readonly acceleratorPrefix: string;
}

export class GovCloudAccountVendingProductStack extends cdk.aws_servicecatalog.ProductStack {
  constructor(scope: Construct, id: string, props: GovCloudAccountVendingProductStackProps) {
    super(scope, id);

    /** This stack creates service catalog product which can 
     * create AWS GovCloud (US) accounts using the Organizations API
    * "CreateGovCloudAccount". 
    * 
    * 
    * The account where this stack is launched should 
    * 1. be in commercial region with Organizations enabled
    * 2. Have ability to create AWS GovCloud (US) Accounts
    * Please read https://docs.aws.amazon.com/govcloud-us/latest/UserGuide/getting-set-up.html
    * and the API documentation 
    * https://docs.aws.amazon.com/organizations/latest/APIReference/API_CreateGovCloudAccount.html

    */

    // Parameters for account creation
    const accountName = new cdk.CfnParameter(this, 'AccountName', {
      type: 'String',
      description:
        "The friendly name of the member account.  The account name can consist of only the characters [a-z],[A-Z],[0-9], hyphen (-), or dot (.) You can't separate characters with a dash (–).",
    });
    const emailAddress = new cdk.CfnParameter(this, 'AccountEmail', {
      type: 'String',
      description:
        'Specifies the email address of the owner to assign to the new member account in the commercial Region. This email address must not already be associated with another AWS account. You must use a valid email address to complete account creation.',
    });
    const orgAccessRole = new cdk.CfnParameter(this, 'OrgAccessRole', {
      type: 'String',
      description:
        'The name of an IAM role that AWS Organizations automatically preconfigures in the new member accounts in both the AWS GovCloud (US) Region and in the commercial Region. This role trusts the management account, allowing users in the management account to assume the role, as permitted by the management account administrator. The role has administrator permissions in the new member account.',
      default: 'OrganizationAccountAccessRole',
    });
    const parameterGroups: { Label: { default: string }; Parameters: string[] }[] = [
      {
        Label: { default: 'Account Configuration' },
        Parameters: [accountName.logicalId, emailAddress.logicalId, orgAccessRole.logicalId],
      },
    ];
    const GovCloudAccountVendingParameterLabels: { [p: string]: { default: string } } = {
      [accountName.logicalId]: { default: 'Account Name' },
      [emailAddress.logicalId]: { default: 'Account Email' },
      [orgAccessRole.logicalId]: { default: 'Organization Role Name' },
    };
    // Parameter Metadata
    this.templateOptions.metadata = {
      'AWS::CloudFormation::Interface': {
        ParameterGroups: parameterGroups,
        ParameterLabels: { ...GovCloudAccountVendingParameterLabels },
      },
    };

    const accountVendingFunction = cdk.aws_lambda.Function.fromFunctionName(
      this,
      'AccountVendingFunction',
      `${props.acceleratorPrefix}-GovCloudAccountVending`,
    );

    //
    // Custom Resource definition
    //
    const resource = new cdk.CustomResource(this, 'CustomCreateGovCloudAccount', {
      resourceType: 'Custom::CreateGovCloudAccount',
      serviceToken: accountVendingFunction.functionArn,
      properties: {
        accountName: accountName.valueAsString,
        emailAddress: emailAddress.valueAsString,
        orgAccessRole: orgAccessRole.valueAsString,
      },
    });

    new cdk.CfnOutput(this, 'GovCloudAccountId', { value: resource.getAtt('GovCloudAccountId').toString() });
    new cdk.CfnOutput(this, 'AccountId', { value: resource.getAtt('AccountId').toString() });
  }
}
