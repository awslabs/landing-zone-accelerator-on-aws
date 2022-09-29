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

const aws = require('aws-sdk');
const org = new aws.Organizations({ region: 'us-east-1' });
const cfn = require('cfn-response');
/**
 * create-govcloud-account - lambda handler
 *
 * @param event
 * @returns cfn-response
 */

exports.handler = async (event, context) => {
  console.log('Received event:\n' + JSON.stringify(event, null, 2));
  try {
    var acc = event.ResourceProperties.accountName;
    var em = event.ResourceProperties.emailAddress;
    var role = event.ResourceProperties.orgAccessRole;
    let i = 0;

    if (event.RequestType === 'Create') {
      var accResp = await org.createGovCloudAccount({ AccountName: acc, Email: em, RoleName: role }).promise();
      console.log(JSON.stringify(accResp));
      var car = accResp.CreateAccountStatus.Id;
      let accStatR = await org.describeCreateAccountStatus({ CreateAccountRequestId: car }).promise();
      let accStat = accStatR.CreateAccountStatus.State;
      while (accStat === 'IN_PROGRESS' && i < 40) {
        await new Promise(resolve => setTimeout(resolve, 15e3));
        accStatR = await org.describeCreateAccountStatus({ CreateAccountRequestId: car }).promise();
        accStat = accStatR.CreateAccountStatus.State;
        i++;
        // print responses to help troubleshoot
        console.log(`Attempt: ${i} of 40`);
        console.log(JSON.stringify(accStatR));
        console.log(accStat);
      }
      if (i === 40) {
        console.log('Timed out');
        return await cfn.send(event, context, 'FAILED');
      } else if (accStat === 'FAILED') {
        var physicalResourceId = accStatR.CreateAccountStatus.FailureReason;
        return await cfn.send(event, context, 'FAILED', physicalResourceId);
      } else if (accStat === 'SUCCEEDED') {
        var responseData = {
          AccountId: accStatR.CreateAccountStatus.AccountId,
          GovCloudAccountId: accStatR.CreateAccountStatus.GovCloudAccountId,
        };
        return await cfn.send(event, context, 'SUCCESS', responseData);
      }
    } else if (event.RequestType === 'Delete' || event.RequestType === 'Update') {
      return await cfn.send(event, context, 'SUCCESS');
    }
  } catch (err) {
    let errMsg = `${err.name}:\n${err.message}`;
    let responseData = { Error: errMsg };
    console.log(errMsg);

    return await cfn.send(event, context, 'FAILED', responseData);
  }
};
