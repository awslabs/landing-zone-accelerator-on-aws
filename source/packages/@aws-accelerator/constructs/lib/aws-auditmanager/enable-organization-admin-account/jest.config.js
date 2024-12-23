const packageJson = require('./package.json');

//
// Suppress maintenance mode message [Ref](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/)
//
process.env['AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE'] = '1';

module.exports = {
  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ['/node_modules/'],

  // A map from regular expressions to paths to transformers
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },

  // The glob patterns Jest uses to detect test files
  testMatch: ['**/*.test.ts'],

  // Indicates whether each individual test should be reported during the run
  verbose: true,

  // Explicitly disable the watch mode
  watchAll: false,

  // Force Jest to exit after all tests have completed running. This is useful when resources set up by test code cannot be adequately cleaned up.
  forceExit: true,

  // Attempt to collect and print open handles preventing Jest from exiting cleanly.
  // Considered using this option to detect async operations that kept running after all tests finished
  detectOpenHandles: true,

  // Run tests with jest-junit reporters.
  reporters: [
    'default',
    [
      '../../../../../../custom-test-reporter.js',
      [
        {
          underlying: 'jest-junit',
          underlyingOptions: {
            suiteName: packageJson.name,
            outputDirectory: '../test-reports/' + process.env['ENV_NAME'] + '/' + process.env['AWS_DEFAULT_REGION'],
            uniqueOutputName: 'true',
            classNameTemplate: '{classname}',
            titleTemplate: '{title}',
            usePathForSuiteName: 'true',
            addFileAttribute: 'true',
          },
        },
      ],
    ],
  ],

  // An array of directory names to be searched recursively up from the requiring module's location
  moduleDirectories: ['node_modules'],

  // An array of file extensions your modules use
  moduleFileExtensions: ['ts', 'json', 'jsx', 'js', 'tsx', 'node'],
};
