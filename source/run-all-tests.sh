#!/bin/bash
#
# This script runs all tests for the root CDK project, as well as any microservices, Lambda functions, or dependency
# source code packages. These include unit tests, integration tests, and snapshot tests.
#
# This script is called by the ../initialize-repo.sh file and the buildspec.yml file. It is important that this script
# be tested and validated to ensure that all available test fixtures are run.
#
# The if/then blocks are for error handling. They will cause the script to stop executing if an error is thrown from the
# node process running the test case(s). Removing them or not using them for additional calls with result in the
# script continuing to execute despite an error being thrown.
#
# PERFORMANCE OPTIMIZATIONS:
# - Tests run package-by-package to reduce memory usage
# - Memory cleanup between packages prevents accumulation
# - Configurable worker count and memory limits
#
# ENVIRONMENT VARIABLES:
#   MAX_WORKERS    - Number of parallel test workers (default: 4)
#   MEMORY_LIMIT   - Node.js memory limit in MB (default: 4096)
#   FAIL_FAST      - Stop on first failure (default: true)
#   SKIP_BUILD     - Skip yarn install and build (default: false)
#   DEBUG          - Enable debug output (default: false)
#
# EXAMPLES:
#   ./run-all-tests.sh                                    # Run with defaults, stop on first failure
#   SKIP_BUILD=true ./run-all-tests.sh                    # Skip build for faster iteration
#   FAIL_FAST=false ./run-all-tests.sh                    # Test all packages even if some fail
#   MAX_WORKERS=2 MEMORY_LIMIT=2048 ./run-all-tests.sh   # Reduce resource usage

[ "$DEBUG" == 'true' ] && set -x
set -e

# Configuration
MAX_WORKERS="${MAX_WORKERS:-4}"
MEMORY_LIMIT="${MEMORY_LIMIT:-4096}"
SKIP_BUILD="${SKIP_BUILD:-false}"

setup_python_env() {
    if [ -d "./.venv-test" ]; then
        echo "Reusing already setup python venv in ./.venv-test. Delete ./.venv-test if you want a fresh one created."
        return
    fi

    echo "Setting up python venv"
    python3 -m venv .venv-test
    echo "Initiating virtual environment"
    source .venv-test/bin/activate

    echo "Installing python packages"
    # install test dependencies in the python virtual environment
    pip3 install -r requirements-test.txt
    pip3 install -r requirements.txt --target .

    echo "deactivate virtual environment"
    deactivate
}

run_python_test() {
    local component_path=$1
    local component_name=$2

    echo "------------------------------------------------------------------------------"
    echo "[Test] Run python unit test with coverage for $component_path $component_name"
    echo "------------------------------------------------------------------------------"
    cd $component_path

    if [ "${CLEAN:-true}" = "true" ]; then
        rm -fr .venv-test
    fi

    setup_python_env

    echo "Initiating virtual environment"
    source .venv-test/bin/activate

    # setup coverage report path
    mkdir -p $source_dir/test/coverage-reports
    coverage_report_path=$source_dir/test/coverage-reports/$component_name.coverage.xml
    echo "coverage report path set to $coverage_report_path"

    # Use -vv for debugging
    python3 -m pytest --cov --cov-report=term-missing --cov-report "xml:$coverage_report_path"

    # The pytest --cov with its parameters and .coveragerc generates a xml cov-report with `coverage/sources` list
    # with absolute path for the source directories. To avoid dependencies of tools (such as SonarQube) on different
    # absolute paths for source directories, this substitution is used to convert each absolute source directory
    # path to the corresponding project relative path. The $source_dir holds the absolute path for source directory.
    sed -i -e "s,<source>$source_dir,<source>source,g" $coverage_report_path

    echo "deactivate virtual environment"
    deactivate

    if [ "${CLEAN:-true}" = "true" ]; then
        rm -fr .venv-test
        rm .coverage
        rm -fr .pytest_cache
        rm -fr __pycache__ test/__pycache__
    fi
}

prepare_jest_coverage_report() {
    local component_name=$1

    if [ ! -d "coverage" ]; then
        echo "ValidationError: Missing required directory coverage after running unit tests"
        exit 129
    fi

    # prepare coverage reports
    rm -fr coverage/lcov-report
    mkdir -p $coverage_reports_top_path/jest
    coverage_report_path=$coverage_reports_top_path/jest/$component_name
    rm -fr $coverage_report_path
    mv coverage $coverage_report_path
}

run_javascript_test() {
    local component_path=$1
    local component_name=$2

    echo "------------------------------------------------------------------------------"
    echo "[Test] Run javascript unit test with coverage for $component_path $component_name"
    echo "------------------------------------------------------------------------------"
    echo "cd $component_path"
    cd $component_path

    # install and build for unit testing
    npm install

    # run unit tests
    npm run test

    # prepare coverage reports
    prepare_jest_coverage_report $component_name
}

cleanup_memory() {
    echo "Cleaning up memory and cache..."
    
    # Force garbage collection if node is available
    if command -v node &> /dev/null; then
        node -e "if (global.gc) { global.gc(); }" 2>/dev/null || true
    fi
    
    # Clear yarn cache periodically
    yarn cache clean 2>/dev/null || true
    
    # Give system time to reclaim memory
    sleep 2
}

run_package_tests() {
    local package_name=$1
    
    echo "=============================================================================="
    echo "[Test] Running tests for: $package_name"
    echo "=============================================================================="
    
    # Run tests for specific package using lerna with memory constraints
    NODE_OPTIONS="--max-old-space-size=$MEMORY_LIMIT" \
    yarn lerna run test:unit \
        --scope="$package_name" \
        --stream \
        --concurrency=1
    
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        echo ""
        echo "=============================================================================="
        echo "FAILURE DETECTED"
        echo "=============================================================================="
        echo "Package: $package_name"
        echo "Exit Code: $exit_code"
        echo "=============================================================================="
        echo ""
        
        if [ "${FAIL_FAST:-true}" = "true" ]; then
            echo "Stopping test execution due to failure (FAIL_FAST=true)"
            echo "To continue testing other packages on failure, set FAIL_FAST=false"
            exit $exit_code
        fi
        
        return $exit_code
    fi
    
    echo "SUCCESS: Tests passed for $package_name"
    
    # Cleanup after each package
    cleanup_memory
    
    return 0
}

run_all_package_tests() {
    local source_dir=$1
    
    # Define packages to test (in dependency order if possible)
    local packages=(
        "@aws-accelerator/utils"
        "@aws-accelerator/config"
        "@aws-cdk-extensions/cdk-extensions"
        "@aws-accelerator/constructs"
        "@aws-accelerator/tools"
        "@aws-accelerator/modules"
        "@aws-accelerator/installer"
        "@aws-accelerator/installer-container"
        "@aws-accelerator/govcloud-account-vending"
        "@aws-accelerator/accelerator"
    )
    
    local failed_packages=()
    local total=${#packages[@]}
    local current=0
    
    for package_name in "${packages[@]}"; do
        current=$((current + 1))
        
        echo ""
        echo "Progress: [$current/$total] Testing $package_name"
        echo ""
        
        if ! run_package_tests "$package_name"; then
            failed_packages+=("$package_name")
        fi
    done
    
    # Test @aws-lza separately since it's not in lerna packages
    echo ""
    echo "Progress: [Extra] Testing aws-lza (standalone package)"
    echo ""
    echo "=============================================================================="
    echo "[Test] Running tests for: aws-lza"
    echo "=============================================================================="
    cd "$source_dir/packages/@aws-lza"
    if [ -f "package.json" ] && grep -q '"test:unit"' package.json; then
        NODE_OPTIONS="--max-old-space-size=$MEMORY_LIMIT" yarn test:unit
        if [ $? -ne 0 ]; then
            echo ""
            echo "=============================================================================="
            echo "FAILURE DETECTED"
            echo "=============================================================================="
            echo "Package: aws-lza"
            echo "=============================================================================="
            echo ""
            
            if [ "${FAIL_FAST:-true}" = "true" ]; then
                echo "Stopping test execution due to failure (FAIL_FAST=true)"
                exit 1
            fi
            
            failed_packages+=("aws-lza")
        else
            echo "SUCCESS: Tests passed for aws-lza"
        fi
        cleanup_memory
    else
        echo "SKIPPED: No test:unit script found for aws-lza"
    fi
    cd "$source_dir"
    
    # Report results
    echo ""
    echo "=============================================================================="
    echo "Test Execution Summary"
    echo "=============================================================================="
    echo "Total packages: $((total + 1))"
    echo "Tested: $((current + 1))"
    echo "Failed: ${#failed_packages[@]}"
    
    if [ ${#failed_packages[@]} -gt 0 ]; then
        echo ""
        echo "Failed packages:"
        for pkg in "${failed_packages[@]}"; do
            echo "  - $pkg"
        done
        echo ""
        echo "=============================================================================="
        echo "BUILD FAILED - See errors above for details"
        echo "=============================================================================="
        return 1
    fi
    
    echo ""
    echo "All tests passed successfully!"
    return 0
}

run_cdk_project_test() {
    local component_path=$1

    cd $component_path

    if [ "$SKIP_BUILD" = "false" ]; then
        echo "------------------------------------------------------------------------------"
        echo "[Build] Building all packages"
        echo "------------------------------------------------------------------------------"
        
        # install and build for unit testing
        yarn install
        yarn build
    else
        echo "------------------------------------------------------------------------------"
        echo "[Build] Skipping build (SKIP_BUILD=true)"
        echo "------------------------------------------------------------------------------"
    fi

    ## Option to suppress the Override Warning messages while synthesizing using CDK
    # export overrideWarningsEnabled=false

    # Set absolute path to test configs to avoid path resolution issues
    export LZA_TEST_CONFIG_DIR="$component_path/packages/@aws-accelerator/accelerator/test/configs"
    
    echo ""
    echo "=============================================================================="
    echo "Starting Package-by-Package Test Execution"
    echo "=============================================================================="
    echo "Configuration:"
    echo "  Max Workers: $MAX_WORKERS"
    echo "  Memory Limit: ${MEMORY_LIMIT}MB"
    echo "  Fail Fast: ${FAIL_FAST:-true}"
    echo "  Skip Build: $SKIP_BUILD"
    echo "  Test Config Dir: $LZA_TEST_CONFIG_DIR"
    echo "=============================================================================="
    echo ""
    
    # Run tests package by package
    run_all_package_tests "$component_path"
}

# Run unit tests
echo "Running unit tests"

# Get reference for source folder
source_dir="$(cd $PWD/../source; pwd -P)"
coverage_reports_top_path=$source_dir/test/coverage-reports

# Test the CDK project
run_cdk_project_test $source_dir

# run_javascript_test $source_dir/lambda/example-function-js example-function-js

# Return to the source/ level
cd $source_dir