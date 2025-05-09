const packageJson = require('./package.json');
//
// Suppress maintenance mode message [Ref](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/)
//
process.env['AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE'] = '1';
module.exports = {
  // Automatically clear mock calls and instances between every test
  clearMocks: false,

  // Explicitly disable the watch mode
  watchAll: false,

  // Force Jest to exit after all tests have completed running. This is useful when resources set up by test code cannot be adequately cleaned up.
  forceExit: true,

  // Attempt to collect and print open handles preventing Jest from exiting cleanly.
  // Considered using this option to detect async operations that kept running after all tests finished
  detectOpenHandles: true,

  // Automatically reset mock state between every test
  resetMocks: true,

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: ['/node_modules/', './models/*'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },

  // A map from regular expressions to paths to transformers
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },

  // The glob patterns Jest uses to detect test files
  testMatch: ['**/*.test.unit.ts'],

  // Indicates whether each individual test should be reported during the run
  verbose: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // An array of directory names to be searched recursively up from the requiring module's location
  moduleDirectories: ['node_modules'],

  // An array of file extensions your modules use
  moduleFileExtensions: ['ts', 'json', 'jsx', 'js', 'tsx', 'node'],

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ['/node_modules/'],

  coverageReporters: ['text', 'text-summary', ['lcov', { projectRoot: '../../' }]],

  // This option allows the use of a custom results processor.
  testResultsProcessor: 'jest-sonar-reporter',

  // Run tests with jest-junit reporters.
  reporters: [
    'default',
    [
      'jest-junit',
      {
        suiteName: packageJson.name,
        outputDirectory: './test-reports',
        uniqueOutputName: 'true',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        usePathForSuiteName: 'true',
        addFileAttribute: 'true',
      },
    ],
  ],
};
