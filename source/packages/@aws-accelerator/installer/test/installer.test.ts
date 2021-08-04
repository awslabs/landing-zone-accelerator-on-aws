import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as Installer from '../lib/installer-stack';

test('Empty Stack', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new Installer.InstallerStack(app, 'MyTestStack');
  // THEN
  // expectCDK(stack).to(matchTemplate({
  //   "Resources": {}
  // }, MatchStyle.EXACT))
});
