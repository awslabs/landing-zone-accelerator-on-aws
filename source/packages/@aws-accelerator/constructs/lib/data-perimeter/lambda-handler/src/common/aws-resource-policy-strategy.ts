import { ConfigurationItem, PolicyDocument } from './common-resources';

export interface AwsResourcePolicyStrategy {
  /**
   * Evaluate if the resource policy of a resource is compliant
   *
   * @param configurationItem the configuration of the resource provided by AWS Config
   * @param expectedPolicy the expected policy of the resource. The parameter will be undefined if it's a Lambda function or PCA
   */
  evaluateResourcePolicyCompliance(
    configurationItem: ConfigurationItem,
    expectedPolicy?: PolicyDocument,
  ): Promise<{
    complianceType: string;
    annotation?: string;
  }>;

  /**
   * Update the resource policy of a resource and make it compliant
   * @param configurationItem the configuration of the resource provided by AWS Config and SSM Remediation
   * @param policy the expected policy of the resource. The parameter will be undefined if it's a Lambda function or PCA
   */
  updateResourceBasedPolicy(
    configurationItem: { resourceName: string; resourceId: string; resourceType: string },
    policy?: PolicyDocument,
  ): Promise<void>;
}
