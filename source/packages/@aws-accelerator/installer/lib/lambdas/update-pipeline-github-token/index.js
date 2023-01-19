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

const AWS = require('aws-sdk');

const secretsManager = new AWS.SecretsManager({});
const codePipeline = new AWS.CodePipeline({});
const installerPipelineName = process.env['INSTALLER_PIPELINE_NAME'] ?? '';
const acceleratorPipelineName = process.env['ACCELERATOR_PIPELINE_NAME'] ?? '';
const pipelineArray = [installerPipelineName, acceleratorPipelineName];

/**
 * update-pipeline-github-token - lambda handler
 *
 * @param event
 * @returns
 */

exports.handler = async (event, context) => {
  const secretDetails = event.detail.requestParameters;
  const secretArn = secretDetails.secretId;
  const secretValue = await getSecretValue(secretArn);
  await updatePipelineDetailsForBothPipelines(secretValue);
  return {
    statusCode: 200,
  };
};

async function getSecretValue(secretName) {
  try {
    const data = await secretsManager
      .getSecretValue({
        SecretId: secretName,
      })
      .promise();

    if (!data || !data.SecretString) {
      throw new Error(`Secret ${secretName} didn't exist.`);
    }
    console.log(`Retrieved secret: ${secretName}...`);
    return data.SecretString;
  } catch (error) {
    console.log(error);
    throw new Error(`Error retrieving secret: ${secretName}.`);
  }
}

async function updateCodePipelineSourceStage(pipelineDetails, secretValue) {
  const pipelineStages = pipelineDetails.pipeline.stages;
  const sourceStage = pipelineStages.find(o => o.name == 'Source');
  const sourceAction = sourceStage.actions.find(a => a.name == 'Source');
  if (sourceAction.actionTypeId.provider !== 'GitHub') {
    console.log('Pipeline source is not GitHub, no action will be taken.');
    return;
  }
  sourceAction.configuration.OAuthToken = secretValue;

  return pipelineDetails;
}

async function getPipelineDetails(pipelineName) {
  //This function retrieves the original Code Pipeline structure, so we can update it.
  const getPipelineParams = {
    name: pipelineName,
  };
  console.log(`Retrieving existing pipeline configuration for: ${pipelineName}...`);
  const pipelineObject = await codePipeline.getPipeline(getPipelineParams).promise();
  console.log(JSON.stringify(pipelineObject));
  return pipelineObject;
}

async function updatePipeline(updatedPipelineDetails) {
  //Remove metadata from getPipelineOutput to use as updatePipelineInput
  delete updatedPipelineDetails.metadata;
  console.log(`Updating pipeline with new OAuth Token...`);
  return codePipeline.updatePipeline(updatedPipelineDetails).promise();
}

async function updatePipelineDetailsForBothPipelines(secretValue) {
  for (const pipeline of pipelineArray) {
    try {
      const pipelineDetails = await getPipelineDetails(pipeline);
      const updatedPipelineDetails = await updateCodePipelineSourceStage(pipelineDetails, secretValue);
      if (updatedPipelineDetails) {
        await updatePipeline(updatedPipelineDetails);
      }
    } catch (error) {
      console.error(error);
      throw new Error(`Error occurred while updating pipeline ${pipeline}`);
    }
  }
}
