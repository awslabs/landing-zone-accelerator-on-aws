const { createJestConfig } = require('../../../create-jest-config');
const packageJson = require('./package.json');
module.exports = {
  ...createJestConfig({suiteName: packageJson.name}),
  coverageThreshold: {
    global: {
      statements: 25,
      branches: 35,
      lines: 25,
      functions: 30,
    },
  },
};
