const { createJestConfig } = require('../../../create-jest-config');
const packageJson = require('./package.json');
module.exports = {
  ...createJestConfig({suiteName: packageJson.name}),
  
  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};
