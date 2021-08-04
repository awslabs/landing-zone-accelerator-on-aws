import * as cdk from '@aws-cdk/core';
import { Asset } from '@aws-cdk/aws-s3-assets';
import { SecureVpc } from '@aws-compliant-constructs/secure-vpc';

import path = require('path');

export class InstallerStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    new SecureVpc(this, 'SecureVpc');

    new Asset(this, 'SomeFileAsset', {
      path: path.join(__dirname, 'some-asset-folder'),
    });

    console.log(__dirname);
  }
}
