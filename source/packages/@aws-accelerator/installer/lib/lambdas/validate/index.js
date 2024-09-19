const response = require('cfn-response');
const { CodePipelineClient, GetPipelineCommand } = require('@aws-sdk/client-codepipeline');
exports.handler = async function (event, context) {
  console.log(JSON.stringify(event, null, 4));

  const configRepositoryLocation = event.ResourceProperties.configRepositoryLocation;

  if (event.RequestType === 'Delete') {
    await response.send(event, context, response.SUCCESS, {}, event.PhysicalResourceId);
    return;
  }

  if (configRepositoryLocation === 's3') {
    try {
      const pipelineName = event.ResourceProperties.acceleratorPipelineName;
      const client = new CodePipelineClient();
      const input = { name: pipelineName };
      const command = new GetPipelineCommand(input);
      const pipelineResponse = await client.send(command);
      const sourceStage = pipelineResponse.pipeline.stages.find(stage => stage.name === 'Source');
      const configAction = sourceStage?.actions.find(action => action.name === 'Configuration');
      if (configAction.actionTypeId.provider === 'CodeCommit') {
        await response.send(
          event,
          context,
          response.FAILED,
          {
            FailureReason:
              'ConfigRepositoryLocation parameter set to s3, but existing deployment using CodeCommit was detected. This value cannot be changed for existing deployments. Please set ConfigRepositoryLocation to CodeCommit and try again.',
          },
          event.PhysicalResourceId,
        );
        return;
      }
    } catch (err) {
      console.log('Encountered error finding existing pipeline, continuing');
      console.log(err);
      await response.send(event, context, response.SUCCESS, {}, event.PhysicalResourceId);
      return;
    }
  }

  // End of Validation
  await response.send(event, context, response.SUCCESS, {}, event.PhysicalResourceId);
  return;
};
