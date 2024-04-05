/**
 * Abstract class to configure static input for create-log-groups custom resource AWS Lambda unit testing
 */
export abstract class StaticInput {
  public static readonly newProps = {
    policyId: 'policyId',
    targetId: 'targetId',
    type: 'type',
    strategy: 'strategy',
    partition: 'aws',
    configPolicyNames: ['configPolicy1', 'configPolicy2'],
    policyTagKey: 'policyTagKey',
    homeRegion: 'homeRegion',
    region: 'homeRegion',
  };
  public static readonly attachProps = {
    policyId: 'policyId',
    targetId: 'targetId',
    type: 'type',
    strategy: 'strategy',
    partition: 'aws',
    configPolicyNames: ['configPolicy1'],
    policyTagKey: 'policyTagKey',
    homeRegion: 'homeRegion',
    region: 'homeRegion',
  };
  public static readonly denylistProps = {
    policyId: 'policyId',
    targetId: 'targetId',
    type: 'type',
    strategy: 'deny-list',
    partition: 'aws',
    configPolicyNames: ['configPolicy1'],
    policyTagKey: 'policyTagKey',
    homeRegion: 'homeRegion',
    region: 'homeRegion',
  };
  public static readonly allowlistProps = {
    policyId: 'policyId',
    targetId: 'targetId',
    type: 'type',
    strategy: 'allow-list',
    partition: 'aws',
    configPolicyNames: ['configPolicy1'],
    policyTagKey: 'policyTagKey',
    homeRegion: 'homeRegion',
    region: 'homeRegion',
  };
  public static readonly otherRegionProps = {
    policyId: 'policyId',
    targetId: 'targetId',
    type: 'type',
    strategy: 'allow-list',
    partition: 'aws',
    configPolicyNames: ['configPolicy1'],
    policyTagKey: 'policyTagKey',
    homeRegion: 'homeRegion',
    region: 'region',
  };
  public static readonly malFormedPolicyException = JSON.stringify({
    name: 'MalformedPolicyDocumentException',
    $fault: 'client',
    $metadata: { httpStatusCode: 400 },
  });
}
