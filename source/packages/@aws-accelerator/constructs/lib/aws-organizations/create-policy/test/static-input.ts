import { sdkStreamMixin } from '@smithy/util-stream';
import { Readable } from 'stream';

/**
 * Abstract class to configure static input for create-log-groups custom resource AWS Lambda unit testing
 */
export abstract class StaticInput {
  public static readonly newProps = {
    bucket: 'bucket',
    key: 'key',
    name: 'name',
    description: 'description',
    type: 'type',
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
  public static readonly policyContent = stringToStream('policyContent');
}

function stringToStream(input: string) {
  // create Stream from string
  const stream = new Readable();
  stream.push(input);
  stream.push(null); // end of stream
  // wrap the Stream with SDK mixin
  return sdkStreamMixin(stream);
}
