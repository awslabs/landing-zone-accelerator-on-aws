import { mkdirSync } from 'fs';
import { join } from 'path';

// Pre-create synthesized-cfn-templates directories that snapshot tests will populate.
// Vitest 4.x's module runner scans the directory tree at startup; if these dirs
// don't exist yet (they're created mid-test), the native iterator crashes with SIGABRT.
const templateDir = join(__dirname, 'test/configs/snapshot-only/synthesized-cfn-templates');
const accounts = ['111111111111', '222222222222', '333333333333', '444444444444', '555555555555', '666666666666'];
const regions = ['us-east-1', 'us-west-2'];
for (const account of accounts) {
  for (const region of regions) {
    mkdirSync(join(templateDir, account, region), { recursive: true });
  }
}

process.env['CONFIG_COMMIT_ID'] = 'e3cdaecaa6073ad9e4721344cd109eb6de351cfb';
process.setMaxListeners(50);
