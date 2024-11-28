const { createJestConfig } = require('../../../create-jest-config');
const packageJson = require('./package.json');
//
// Suppress maintenance mode message [Ref](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/)
//
process.env['AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE'] = '1';

const baseConfig = createJestConfig({suiteName: packageJson.name});

module.exports = {
  ...baseConfig,
  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      statements: 40,
      branches: 30,
      functions: 35,
      lines: 40,
    },
  },
};
