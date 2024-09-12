/**
 * Abstract class to configure static input for create-log-groups custom resource AWS Lambda unit testing
 */
import { PolicyType } from '@aws-sdk/client-organizations';
export abstract class StaticInput {
  public static readonly newProps = {
    bucket: 'bucket',
    key: 'key',
    name: 'name',
    description: 'description',
    type: PolicyType.SERVICE_CONTROL_POLICY,
    tags: [{ Key: 'key', Value: 'value' }],
    partition: 'aws',
    policyTagKey: 'policyTagKey',
    homeRegion: 'homeRegion',
    region: 'homeRegion',
  };
  public static readonly otherRegionProps = {
    bucket: 'bucket',
    key: 'key',
    name: 'name',
    description: 'description',
    type: 'type',
    tags: [{ Key: 'key', Value: 'value' }],
    partition: 'aws',
    policyTagKey: 'policyTagKey',
    homeRegion: 'homeRegion',
    region: 'region',
  };
  public static readonly policyContent = 'policyContent';
}
