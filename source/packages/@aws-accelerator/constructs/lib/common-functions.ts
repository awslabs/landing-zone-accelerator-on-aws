import * as path from 'path';
import * as fs from 'fs';

// Copies Resource Policy files to the Lambda directory for packaging
export function copyPoliciesToDeploymentPackage(
  filePaths: { name: string; path: string; tempPath: string }[],
  deploymentPackagePath: string,
  accountId: string,
) {
  // Make policy folder
  fs.mkdirSync(path.join(deploymentPackagePath, 'policies', accountId), { recursive: true });

  for (const policyFilePath of filePaths) {
    //copy from generated temp path to original policy path
    fs.copyFileSync(
      path.join(policyFilePath.tempPath),
      path.join(deploymentPackagePath, 'policies', accountId, `${policyFilePath.name.toUpperCase()}.json`),
    );
  }
}
