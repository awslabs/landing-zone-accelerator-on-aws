const base = require('../../../jest.config.base');
const packageJson = require('./package.json');

module.exports = {
  ...base.getJestJunitConfig(packageJson.name),
};
