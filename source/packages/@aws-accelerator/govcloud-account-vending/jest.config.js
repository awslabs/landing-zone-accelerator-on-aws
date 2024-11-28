const { createJestConfig } = require('../../../create-jest-config');
const packageJson = require('./package.json');
//
// Suppress maintenance mode message [Ref](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/)
//
process.env['AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE'] = '1';

module.exports = {
  ...createJestConfig({suiteName: packageJson.name}),
  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 76,
      functions: 75,
      lines: 95,
      statements: 95,
    },
  },
};
