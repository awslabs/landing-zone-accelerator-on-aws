import * as fs from 'fs';
import { ASEAMapping, CfnResourceType, NestedStack } from '@aws-accelerator/config';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import * as winston from 'winston';
import path from 'path';
export class ImportStackResources {
  stackMapping: ASEAMapping;
  logger: winston.Logger;
  cfnResources: CfnResourceType[];
  nestedStackResources: { [key: string]: ImportStackResources } | undefined;
  constructor(props: {
    stackMapping: ASEAMapping | NestedStack;
    cfnResources: CfnResourceType[];
    nestedStackResources: { [key: string]: ImportStackResources } | undefined;
  }) {
    this.stackMapping = props.stackMapping;
    this.logger = createLogger([
      `${this.stackMapping.accountId}-${this.stackMapping.stackName}-${this.stackMapping.region}`,
    ]);
    this.cfnResources = props.cfnResources;
    this.nestedStackResources = props.nestedStackResources;
  }

  public static async init(props: { stackMapping: ASEAMapping }) {
    try {
      const cfnResources = await this.loadCfnResources(path.join('asea-assets', props.stackMapping.resourcePath));
      const nestedStackResources = await this.loadNestedStackResources(props.stackMapping.nestedStacks);
      return new ImportStackResources({ ...props, cfnResources, nestedStackResources });
    } catch (e) {
      const logger = createLogger([
        `${props.stackMapping.accountId}-${props.stackMapping.stackName}-${props.stackMapping.region}`,
      ]);
      logger.error(JSON.stringify(props.stackMapping, null, 4));
      throw new Error(`${e}`);
    }
  }

  private static async loadCfnResources(filePath: string): Promise<CfnResourceType[]> {
    try {
      const cfnResources = (await fs.promises.readFile(filePath)).toString();
      return JSON.parse(cfnResources);
    } catch (e) {
      throw new Error(`Unable to read file ${filePath}`);
    }
  }

  private static async loadNestedStackResources(nestedStacks: { [key: string]: NestedStack } | undefined) {
    if (!nestedStacks) {
      return;
    }
    const nestedStackResources: { [key: string]: ImportStackResources } = {};
    for (const [key, mapping] of Object.entries(nestedStacks)) {
      const resources = await ImportStackResources.init({ stackMapping: mapping });
      nestedStackResources[key] = resources;
    }
    return nestedStackResources;
  }

  public static initSync(props: { stackMapping: ASEAMapping }) {
    const cfnResources = this.loadCfnResourcesSync(path.join('asea-assets', props.stackMapping.resourcePath));
    const nestedStackResources = this.loadNestedStackResourcesSync(props.stackMapping.nestedStacks);
    return new ImportStackResources({ ...props, cfnResources, nestedStackResources });
  }

  private static loadCfnResourcesSync(filePath: string): CfnResourceType[] {
    try {
      const cfnResources = fs.readFileSync(filePath).toString();
      return JSON.parse(cfnResources);
    } catch (e) {
      throw new Error(`Unable to read file ${filePath}`);
    }
  }

  private static loadNestedStackResourcesSync(nestedStacks: { [key: string]: NestedStack } | undefined) {
    if (!nestedStacks) {
      return;
    }
    const nestedStackResources: { [key: string]: ImportStackResources } = {};
    for (const [key, mapping] of Object.entries(nestedStacks)) {
      const resources = ImportStackResources.initSync({ stackMapping: mapping });
      nestedStackResources[key] = resources;
    }
    return nestedStackResources;
  }

  public getResourceByName(propertyName: string, propertyValue: string) {
    return this.cfnResources.find(
      cfnResource =>
        cfnResource.resourceMetadata['Properties'][propertyName] === propertyValue && !cfnResource.isDeleted,
    );
  }

  public getResourcesByRef(propertyName: string, logicalId: string) {
    return this.cfnResources.filter(
      cfnResource =>
        cfnResource.resourceMetadata['Properties'][propertyName].Ref === logicalId && !cfnResource.isDeleted,
    );
  }

  public getResourcesByType(resourceType: string) {
    return this.cfnResources.filter(cfnResource => cfnResource.resourceType === resourceType && !cfnResource.isDeleted);
  }

  public getResourceByTag(value: string, name = 'Name') {
    return this.cfnResources.find(
      cfnResource =>
        cfnResource.resourceMetadata['Properties'].Tags &&
        cfnResource.resourceMetadata['Properties'].Tags.find(
          (tag: { Key: string; Value: string }) => tag.Key === name && tag.Value === value && !cfnResource.isDeleted,
        ),
    );
  }

  public getResourceByTypeAndTag(resourceType: string, tagValue: string, tagName = 'Name') {
    return this.cfnResources.find(
      cfnResource =>
        cfnResource.resourceType === resourceType &&
        cfnResource.resourceMetadata['Properties'].Tags &&
        cfnResource.resourceMetadata['Properties'].Tags.find(
          (tag: { Key: string; Value: string }) => tag.Key === tagName && tag.Value === tagValue,
        ) &&
        !cfnResource.isDeleted,
    );
  }
  public getSSMParameterByName(physicalId: string) {
    this.logger.info(`Name ${physicalId}`);
    return this.getResourceByProperty('Name', physicalId);
  }
  public getResourceById(lzaResourceId: string) {
    return this.cfnResources.find(
      cfnResource => cfnResource.resourceIdentifier === lzaResourceId && !cfnResource.isDeleted,
    );
  }

  public getResourceByLogicalId(logicalId: string) {
    return this.cfnResources.find(cfnResource => cfnResource.logicalResourceId === logicalId && !cfnResource.isDeleted);
  }
  public getResourceByPropertyIgnoreDeletionFlag(propertyName: string, propertyValue: string) {
    return this.cfnResources.find(
      cfnResource =>
        cfnResource.resourceMetadata['Properties'][propertyName] &&
        cfnResource.resourceMetadata['Properties'][propertyName] === propertyValue,
    );
  }
  public getResourceByProperty(propertyName: string, propertyValue: string) {
    return this.cfnResources.find(
      cfnResource =>
        cfnResource.resourceMetadata['Properties'][propertyName] &&
        cfnResource.resourceMetadata['Properties'][propertyName] === propertyValue &&
        !cfnResource.isDeleted,
    );
  }

  public getResourceByPropertyByPartialMatch(propertyName: string, propertyValue: string) {
    return this.cfnResources.find(
      cfnResource =>
        cfnResource.resourceMetadata['Properties'][propertyName] &&
        cfnResource.resourceMetadata['Properties'][propertyName].includes(propertyValue) &&
        !cfnResource.isDeleted,
    );
  }

  public deleteResource(logicalId: string) {
    const resource = this.cfnResources.find(cfnResource => cfnResource.logicalResourceId === logicalId);
    if (resource) {
      resource.isDeleted = true;
    } else {
      this.logger.error(`Resource with logicalId ${logicalId} not found`);
    }
  }
  public setResourceProperties(logicalId: string, properties: { propertyName: string; propertyValue: string }[]) {
    const resource = this.cfnResources.find(cfnResource => cfnResource.logicalResourceId === logicalId);
    if (resource) {
      for (const { propertyName, propertyValue } of properties) {
        resource.resourceMetadata['Properties'][propertyName] = propertyValue;
      }
    } else {
      this.logger.error(`Resource with logicalId ${logicalId} not found`);
    }
  }

  public getStackKey() {
    return `${this.stackMapping.accountId}|${this.stackMapping.region}|${this.stackMapping.stackName}`;
  }
}
