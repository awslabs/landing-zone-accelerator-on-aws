module.exports.getJestJunitConfig = packageName => {
  return {
    roots: ['<rootDir>/test'],
    testMatch: ['**/*.test.ts'],
    transform: {
      '^.+\\.tsx?$': 'ts-jest',
    },
    reporters: [
      'default',
      [
        'jest-junit',
        {
          suiteName: packageName,
          outputDirectory: '../../../test-reports',
          uniqueOutputName: 'true',
          addFileAttribute: 'true',
          suiteNameTemplate: '{filename}',
          classNameTemplate: packageName,
          titleTemplate: '{title}'
        },
      ],
    ],
  };
};
