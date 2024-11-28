const { createJestConfig } = require('../../../create-jest-config');
const packageJson = require('./package.json');

module.exports = {
  ...createJestConfig({suiteName: packageJson.name}),
  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      statements: 55,
      branches: 20,
      lines: 55,
      functions: 50,
    },
  },

};
