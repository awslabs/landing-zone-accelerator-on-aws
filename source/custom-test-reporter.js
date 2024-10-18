class CustomTestReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;
    this.underlyingReporters = [];

    this.underlyingReporters = options.map(item => {
      const resolved = require(item.underlying);
      return new resolved(globalConfig, item.underlyingOptions);
    });
  }

  onRunStart(runResults, runConfig) {
    this.underlyingReporters.forEach(item => {
      if (item.onRunStart) {
        item.onRunStart(runResults, runConfig);
      }
    });
  }

  onTestResult(testRunConfig, testResults, runResults) {
    const skipped = this.filterSkippedTestSuites(testResults);
    testResults.numPassingTests -= skipped;
    runResults.numPassedTests -= skipped;
    runResults.numTotalTests -= skipped;

    this.underlyingReporters.forEach(item => {
      if (item.onTestResult) {
        item.onTestResult(testRunConfig, testResults, runResults);
      }
    });
  }

  onRunComplete(test, runResults) {
    for (let counter = 0; counter < runResults.testResults.length; counter++) {
      const result = runResults.testResults[counter];
      if (result.testResults.length == 0) {
        runResults.testResults.splice(counter, 1);
        counter--;
        runResults.numPassedTestSuites -= 1;
        runResults.numTotalTestSuites -= 1;
      }
    }

    this.underlyingReporters.forEach(item => {
      if (item.onRunComplete) {
        item.onRunComplete(test, runResults);
      }
    });
  }

  filterSkippedTestSuites(specFile) {
    let excluded = 0;
    for (let testIndex = 0; testIndex < specFile.testResults.length; testIndex++) {
      const test = specFile.testResults[testIndex];
      if (!test.fullName.includes(`${process.env['ENV_NAME']}:${process.env['AWS_DEFAULT_REGION']}`)) {
        specFile.testResults.splice(testIndex, 1);
        excluded = excluded + 1;
        testIndex = testIndex - 1;
      }
    }

    return excluded;
  }
}

module.exports = CustomTestReporter;
