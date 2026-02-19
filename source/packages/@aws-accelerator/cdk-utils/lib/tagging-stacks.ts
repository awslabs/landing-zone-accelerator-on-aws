import * as cdk from 'aws-cdk-lib';
import { CfnResource } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import { createLogger } from '@aws-accelerator/utils';
import { ITag } from '@aws-accelerator/config';
const logger = createLogger(['tagging-utils']);

/**
 * Applies Accelerator tagging to all taggable resources in the given construct subtree.
 *
 * This function is required rather than using an Aspect class for two reasons:
 * 1. Using Aspects for stacks that use the fs.writeFileSync() operation
 * causes the application to quit during stack synthesis
 * 2. Skips certain resource types known to cause tag update issues.
 * @param node
 * @param partition
 * @param tags
 * @param acceleratorPrefix
 */
export function addAcceleratorTags(node: IConstruct, partition: string, tags: ITag[], acceleratorPrefix: string): void {
  if (partition === 'aws-iso' || partition === 'aws-iso-b') {
    return;
  }

  // Resource types that do not support tag updates
  const excludedResourceTypes = [
    'AWS::EC2::Route',
    'AWS::EC2::SubnetRouteTableAssociation',
    'AWS::EC2::TransitGatewayRouteTable',
    'AWS::EC2::VPCGatewayAttachment',
    'AWS::Route53Resolver::FirewallDomainList',
    'AWS::Route53Resolver::ResolverEndpoint',
    'AWS::Route53Resolver::ResolverRule',
    'AWS::Route53Resolver::ResolverQueryLoggingConfig',
    'AWS::Events::Rule',
    'AWS::Lambda::EventSourceMapping',
  ];

  const tagsWithPrefix = tags;
  const acceleratorTag = tagsWithPrefix.find(tag => tag.key === 'Accelerator');
  if (!acceleratorTag) {
    tagsWithPrefix.push({
      key: 'Accelerator',
      value: acceleratorPrefix,
    });
  }

  for (const resource of node.node.findAll()) {
    if (resource instanceof cdk.CfnResource && !excludedResourceTypes.includes(resource.cfnResourceType)) {
      if (resource instanceof cdk.aws_ec2.CfnTransitGateway && partition !== 'aws') {
        continue;
      }
      if (resource.cfnResourceType === 'AWS::EC2::SecurityGroup') {
        new cdk.Tag('Accel-P', acceleratorPrefix).visit(resource);
      }
      new cdk.Tag('Accelerator', acceleratorPrefix).visit(resource);

      tags.forEach(t => {
        new cdk.Tag(t.key, t.value).visit(resource);
      });

      if (resource.cfnResourceType === 'Custom::SsmPutParameterValue') {
        addTagsToPutSsmParameterResource(resource, tagsWithPrefix);
      }

      if (resource.cfnResourceType === 'AWS::IAM::ManagedPolicy') {
        setTagsForChildResources(resource, tagsWithPrefix);
      }
    }

    if (resource instanceof cdk.CustomResourceProvider) {
      tagCustomResourceLambda(resource, tagsWithPrefix);
      tagCustomResourceRole(resource, tagsWithPrefix);
    }
  }
}

/**
 * Tags the IAM Role associated with a custom resource provider.
 * @param customResource - The custom resource provider whose role needs to be tagged
 * @param tags - Array of key-value pairs to be applied as tags to the role
 * @returns void
 */
function tagCustomResourceRole(
  customResource: cdk.CustomResourceProvider,
  tags: { key: string; value: string }[],
): void {
  try {
    const customResourceRole = customResource.node.findChild('Role') as CfnResource;
    if (customResourceRole) {
      setTagsForChildResources(customResourceRole, tags);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    logger.info(`No child node for role associated with ${tagCustomResourceRole.name}`);
    return;
  }
}

/**
 * Tags the Lambda function associated with a custom resource provider.
 * @param customResource - The custom resource provider whose Lambda function needs to be tagged
 * @param tags - Array of key-value pairs to be applied as tags to the Lambda function
 * @returns void
 */
function tagCustomResourceLambda(
  customResource: cdk.CustomResourceProvider,
  tags: { key: string; value: string }[],
): void {
  try {
    const lambdaHandler = customResource.node.findChild('Handler') as CfnResource;
    if (lambdaHandler) {
      setTagsForChildResources(lambdaHandler, tags);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    logger.info(`No child node for lambda associated with ${tagCustomResourceLambda.name}`);
  }
}

/**
 * Adds tags to a CloudFormation resource, applying alphabetical ordering.
 * @param resource - The CloudFormation resource to tag
 * @param tags - Array of key-value pairs to be applied as tags
 */
function setTagsForChildResources(resource: CfnResource, tags: { key: string; value: string }[]): void {
  if (!tags || tags.length === 0) {
    return;
  }

  // Convert tags to CloudFormation format and sort by key
  const formattedTags = tags
    .map(tag => ({
      Key: tag.key,
      Value: tag.value,
    }))
    .sort((a, b) => a.Key.localeCompare(b.Key));

  resource.addPropertyOverride('Tags', formattedTags);
}

/**
 * Adds tags to PutSsmParameter custom resource parameters
 * @param resource - The PutSsmParameter custom resource
 * @param tags - Array of key-value pairs to be applied as tags
 */
function addTagsToPutSsmParameterResource(resource: CfnResource, tags: { key: string; value: string }[]): void {
  if (!tags || tags.length === 0) {
    return;
  }

  // Convert tags to Record<string, string> format
  const tagsRecord: Record<string, string> = {};
  tags.forEach(tag => {
    tagsRecord[tag.key] = tag.value;
  });

  // Get the existing parameters from the custom resource properties
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingParameters = (resource as any)._cfnProperties?.parameters;

    if (Array.isArray(existingParameters)) {
      existingParameters.forEach((param: { tags?: Record<string, string> }, index: number) => {
        const existingTags = param.tags || {};
        resource.addPropertyOverride(`parameters.${index}.tags`, { ...tagsRecord, ...existingTags });
      });
    }
  } catch (e) {
    logger.warn(`Could not add tags to PutSsmParameter parameters: ${e}`);
  }
}
