import {
  IManagePolicyConfiguration,
  IManagePolicyHandlerParameter,
  IManagePolicyModule,
  OperationFlag,
} from '../../../interfaces/aws-organizations/manage-policy';
import { createLogger } from '../../../common/logger';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import { generateDryRunResponse, getModuleDefaultParameters, setRetryStrategy } from '../../../common/functions';
import { getS3ObjectContent } from '../../../common/s3-functions';
import { AcceleratorModuleName } from '../../../common/resources';
import { ModuleHandlerReturnType } from '../../../common/types';
import {
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachPolicyCommand,
  OrganizationsClient,
  paginateListPolicies,
  paginateListTargetsForPolicy,
  PolicyNotAttachedException,
  PolicyNotFoundException,
  PolicyType,
  UpdatePolicyCommand,
} from '@aws-sdk/client-organizations';
import { S3Client } from '@aws-sdk/client-s3';

/**
 * ManagePolicy class to manage AWS Organizations policy operations
 */
export class ManagePolicy implements IManagePolicyModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to manage AWS Organizations policies
   *
   * Validates configuration, retrieves and validates policy content from direct input or S3,
   * then creates/updates or deletes policies based on operation flag.
   *
   * @param props - Handler parameters containing policy configuration and credentials
   * @returns Promise resolving to operation result with status and message
   */
  async handler(props: IManagePolicyHandlerParameter): Promise<ModuleHandlerReturnType> {
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_ORGANIZATIONS, props);
    const validConfig = this.validateContentSource(props.configuration);

    if (defaultProps.dryRun) {
      return {
        status: true,
        message: this.getDryRunResponse(
          defaultProps.moduleName,
          props.operation,
          props.configuration,
          validConfig.errorMessage,
        ),
      };
    }

    if (!validConfig.isValid && validConfig.errorMessage) {
      return {
        status: false,
        message: validConfig.errorMessage,
      };
    }

    const organizationsClient = new OrganizationsClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    if (props.configuration.operationFlag === OperationFlag.UPSERT) {
      try {
        const policyContent = await this.getPolicyContent(props);
        const result = await this.createOrUpdatePolicy(props.configuration, policyContent, organizationsClient);

        return {
          status: true,
          message: `Policy "${props.configuration.name}" successfully ${result.operation}. Policy ID: ${result.policyId}`,
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid JSON in policy content')) {
          return {
            status: false,
            message: error.message,
          };
        }
        throw error;
      }
    } else {
      await this.deletePolicy(props.configuration, organizationsClient);
      return {
        status: true,
        message: `Policy ${props.configuration.name} successfully deleted`,
      };
    }
  }

  /**
   * Generates dry run response showing what operations would be performed
   *
   * @param moduleName - Module name for dry run response
   * @param operation - Operation name for dry run response
   * @param config - Policy configuration
   * @param validationErrorMessage - Validation error message if configuration is invalid
   * @returns Dry run status message describing planned operations
   */
  private getDryRunResponse(
    moduleName: string,
    operation: string,
    config: IManagePolicyConfiguration,
    validationErrorMessage?: string,
  ): string {
    if (validationErrorMessage) {
      return generateDryRunResponse(moduleName, operation, `Will experience ${validationErrorMessage}`);
    }

    if (config.operationFlag === OperationFlag.UPSERT) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will create policy "${config.name}" of type ${config.type} or update if it already exists`,
      );
    } else {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will detach and delete policy "${config.name}" if it exists`,
      );
    }
  }

  /**
   * Validates policy content source configuration
   *
   * @param config - Policy configuration to validate
   * @returns Validation result object with isValid flag and optional error message
   */
  private validateContentSource(config: IManagePolicyConfiguration): { isValid: boolean; errorMessage?: string } {
    const { content, bucketName, objectPath, operationFlag } = config;
    const errors: string[] = [];

    // Skip content source validation for DELETE operations
    if (operationFlag === OperationFlag.DELETE) {
      return { isValid: true };
    }

    // Validate content source conflicts
    if (content && (bucketName || objectPath)) {
      errors.push(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Cannot specify both direct policy content and S3 location. Use either 'content' field for inline policy or 'bucketName'+'objectPath' for S3-stored policy`,
      );
    }

    // Validate S3 configuration completeness - both bucketName and obejctPath must be provided
    if ((bucketName && !objectPath) || (objectPath && !bucketName)) {
      errors.push(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Both 'bucketName' and 'objectPath' are required together to retrieve policy content from S3`,
      );
    }

    // Validate content source presence - at least one method of providing content must be specified
    if (!content && !bucketName && !objectPath) {
      errors.push(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Policy content must be provided. Use either 'content' field for inline policy or both 'bucketName' and 'objectPath' for S3-stored policy`,
      );
    }

    if (errors.length > 0) {
      const errorMessage = errors.join('\n');
      this.logger.error(errorMessage);
      return { isValid: false, errorMessage };
    }

    return { isValid: true };
  }

  /**
   * Retrieves policy content from direct input or S3 bucket
   *
   * @param props - Handler parameters containing policy configuration and AWS credentials
   * @returns Promise resolving to validated policy content as string
   * @throws Error for invalid JSON content or S3 access failures
   */
  private async getPolicyContent(props: IManagePolicyHandlerParameter): Promise<string> {
    const { configuration } = props;
    let content: string;

    if (configuration.content) {
      content = configuration.content;
    } else if (configuration.bucketName && configuration.objectPath) {
      const s3Client = new S3Client({
        region: props.region,
        customUserAgent: props.solutionId,
        retryStrategy: setRetryStrategy(),
        credentials: props.credentials,
      });

      content = await getS3ObjectContent(s3Client, configuration.bucketName, configuration.objectPath);
    } else {
      throw new Error(`${MODULE_EXCEPTIONS.INVALID_INPUT}: Policy content must be provided`);
    }

    // Validate JSON syntax for the policy content
    try {
      JSON.parse(content);
    } catch (error) {
      const errorMessage = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid JSON in policy content: ${error}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    return content;
  }

  /**
   * Creates a new policy or updates existing policy based on existence check
   *
   * @param config - Policy configuration
   * @param content - Policy document content
   * @param organizationsClient - Configured Organizations client
   * @returns Promise resolving to policy ID and operation type
   */
  private async createOrUpdatePolicy(
    config: IManagePolicyConfiguration,
    content: string,
    organizationsClient: OrganizationsClient,
  ): Promise<{ policyId: string; operation: 'created' | 'updated' }> {
    const existingPolicyId = await this.getPolicyId(organizationsClient, config.name, config.type);

    if (existingPolicyId) {
      await this.updatePolicy(config, content, existingPolicyId, organizationsClient);
      return { policyId: existingPolicyId, operation: 'updated' };
    } else {
      const policyId = await this.createPolicy(config, content, organizationsClient);
      return { policyId, operation: 'created' };
    }
  }

  /**
   * Creates a new policy
   *
   * @param config - Policy configuration
   * @param content - Policy document content
   * @param organizationsClient - Configured Organizations client
   * @returns Promise resolving to policy ID
   */
  private async createPolicy(
    config: IManagePolicyConfiguration,
    content: string,
    organizationsClient: OrganizationsClient,
  ): Promise<string> {
    try {
      const createPolicyResponse = await throttlingBackOff(() =>
        organizationsClient.send(
          new CreatePolicyCommand({
            Content: content,
            Description: config.description,
            Name: config.name,
            Type: config.type,
            Tags: config.tags ?? [],
          }),
        ),
      );

      const policyId = createPolicyResponse.Policy?.PolicySummary?.Id;
      if (!policyId) {
        const errorMessage = `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to create policy "${config.name}" of type ${config.type} - Policy ID not returned from AWS`;
        this.logger.error(errorMessage);
        throw new Error(errorMessage);
      }
      return policyId;
    } catch (error) {
      this.logger.error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to create policy ${config.name}: ${error}`);
      throw error;
    }
  }

  /**
   * Updates an existing policy with new content
   *
   * @param config - Policy configuration
   * @param content - Policy document content
   * @param policyId - ID of the policy to update
   * @param organizationsClient - Configured Organizations client
   */
  private async updatePolicy(
    config: IManagePolicyConfiguration,
    content: string,
    policyId: string,
    organizationsClient: OrganizationsClient,
  ): Promise<void> {
    try {
      await throttlingBackOff(() =>
        organizationsClient.send(
          new UpdatePolicyCommand({
            Content: content,
            Description: config.description,
            Name: config.name,
            PolicyId: policyId,
          }),
        ),
      );
    } catch (error) {
      this.logger.error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to update policy ${config.name}: ${error}`);
      throw error;
    }
  }

  /**
   * Deletes a policy after detaching it from all targets
   *
   * @param config - Policy configuration
   * @param organizationsClient - Configured Organizations client
   */
  private async deletePolicy(
    config: IManagePolicyConfiguration,
    organizationsClient: OrganizationsClient,
  ): Promise<void> {
    const policyId = await this.getPolicyId(organizationsClient, config.name, config.type);

    if (!policyId) {
      this.logger.info(`Policy ${config.name} not found for deletion. Already deleted or doesn't exist.`);
      return;
    }

    try {
      await this.detachPolicyFromAllTargets(organizationsClient, policyId);
      await throttlingBackOff(() => organizationsClient.send(new DeletePolicyCommand({ PolicyId: policyId })));
    } catch (error) {
      if (error instanceof PolicyNotFoundException) {
        // Policy was already deleted
        this.logger.info(`Policy ${config.name} not found for deletion. Already deleted or doesn't exist.`);
      } else {
        this.logger.error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete policy ${config.name}: ${error}`);
        throw error;
      }
    }
  }

  /**
   * Retrieves policy ID by name and type from AWS Organizations
   *
   * @param organizationsClient - Configured Organizations client
   * @param policyName - Name of the policy to find
   * @param type - Type of policy to search for
   * @returns Promise resolving to policy ID or undefined if not found
   */
  private async getPolicyId(
    organizationsClient: OrganizationsClient,
    policyName: string,
    type: PolicyType,
  ): Promise<string | undefined> {
    try {
      for await (const page of paginateListPolicies({ client: organizationsClient }, { Filter: type })) {
        for (const policy of page.Policies ?? []) {
          if (policy.Name === policyName) {
            return policy.Id;
          }
        }
      }
      return undefined;
    } catch (error) {
      this.logger.error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to list policies to find ${policyName}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Detaches policy from all attached targets (OUs and accounts) concurrently
   *
   * @param organizationsClient - Configured Organizations client
   * @param policyId - ID of the policy to detach from all targets
   */
  private async detachPolicyFromAllTargets(organizationsClient: OrganizationsClient, policyId: string): Promise<void> {
    const promises: Promise<void>[] = [];

    for await (const page of paginateListTargetsForPolicy({ client: organizationsClient }, { PolicyId: policyId })) {
      const validTargets = page.Targets?.filter(target => target.TargetId) ?? [];

      const detachPromises = validTargets.map(target =>
        this.detachFromTarget(organizationsClient, policyId, target.TargetId!),
      );

      promises.push(...detachPromises);
    }

    await Promise.all(promises);
  }

  /**
   * Detaches policy from a single target with error handling
   *
   * @param organizationsClient - Configured Organizations client
   * @param policyId - ID of the policy to detach
   * @param targetId - ID of the target to detach policy from
   */
  private async detachFromTarget(
    organizationsClient: OrganizationsClient,
    policyId: string,
    targetId: string,
  ): Promise<void> {
    try {
      await throttlingBackOff(() =>
        organizationsClient.send(new DetachPolicyCommand({ PolicyId: policyId, TargetId: targetId })),
      );
    } catch (error) {
      if (error instanceof PolicyNotAttachedException) {
        // Policy already detached
        return;
      }
      this.logger.error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to detach policy "${policyId}" from target ${targetId} during policy deletion operation`,
      );
      throw error;
    }
  }
}
