import * as cdk from 'aws-cdk-lib';
import { Toolkit } from '@aws-cdk/toolkit-lib';
import { InstallerContainerStack } from './lib/installer-container-stack';

export async function synthStack(context?: Record<string, string>) {
  const toolkit = new Toolkit();

  const cx = await toolkit.fromAssemblyBuilder(async () => {
    const app = new cdk.App();

    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        app.node.setContext(key, value);
      });
    }

    new InstallerContainerStack(app, 'InstallerContainerStack');

    return app.synth();
  });

  await toolkit.synth(cx);
  return await cx.produce();
}
