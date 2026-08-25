#!/bin/bash
set -u
set -o pipefail

mode=${1:-}
slug=${2:-}
displayName=${3:-}

usage() {
  echo "Usage: run-module-integration.sh run <slug> <display-name> | cleanup <slug>" >&2
}

if [ "${mode}" = "run" ]; then
  if [ "$#" -ne 3 ]; then
    usage
    exit 1
  fi
elif [ "${mode}" = "cleanup" ]; then
  if [ "$#" -ne 2 ]; then
    usage
    exit 1
  fi
else
  usage
  exit 1
fi

if [[ ! "${slug}" =~ ^[a-z0-9-]+$ ]]; then
  echo "[Module Integration] Invalid slug: ${slug}" >&2
  exit 1
fi

requiredEnv=(
  CI_PROJECT_DIR
  ACCELERATOR_PREFIX
  AWS_DEFAULT_REGION
  ACCOUNT_ID
  SAMPLE_CONFIG_ENV_LOGARCHIVE_ACCOUNT_ID
  PARTITION
  LZA_GITLAB_ROLE_NAME
  ENV_NAME
  ENV_MANIFEST
)
for variableName in "${requiredEnv[@]}"; do
  if [ -z "${!variableName:-}" ]; then
    echo "[Module Integration] Missing required environment variable: ${variableName}" >&2
    exit 1
  fi
done

integrationRoot="${CI_PROJECT_DIR}/source/packages/@aws-accelerator/accelerator/test/integration"
acceleratorDir="${CI_PROJECT_DIR}/source/packages/@aws-accelerator/accelerator"
moduleDir="${integrationRoot}/modules/${slug}"
fixtureScript="${moduleDir}/infrastructure/${slug}-fixtures.sh"
resetScript="${fixtureScript}"
indexFile="${moduleDir}/index.test.integration.ts"
aggregateScript="${integrationRoot}/framework/aggregate-manifests.ts"
artifactPrefix="${CI_PROJECT_DIR}/integ-${slug}"
fixtureEnv="${artifactPrefix}-fixtures.env"
completionMarker="${artifactPrefix}-reset-complete"
statusFile="${artifactPrefix}-job-status.txt"

for requiredPath in "${fixtureScript}" "${resetScript}" "${indexFile}" "${aggregateScript}"; do
  if [ ! -f "${requiredPath}" ]; then
    echo "[Module Integration] Required file not found: ${requiredPath}" >&2
    exit 1
  fi
done
if [ ! -d "${acceleratorDir}" ]; then
  echo "[Module Integration] Accelerator directory not found: ${acceleratorDir}" >&2
  exit 1
fi

run_logged() {
  local logFile="$1"
  shift
  "$@" 2>&1 | tee "${logFile}"
  return "${PIPESTATUS[0]}"
}

reset_fixture() {
  run_logged "${artifactPrefix}-fixture-reset.log" \
    bash "${resetScript}" \
      "${ACCELERATOR_PREFIX}" \
      "${AWS_DEFAULT_REGION}" \
      "${ACCOUNT_ID}" \
      "${SAMPLE_CONFIG_ENV_LOGARCHIVE_ACCOUNT_ID}" \
      "${PARTITION}" \
      "${LZA_GITLAB_ROLE_NAME}" \
      reset
}

if [ "${mode}" = "cleanup" ]; then
  if [ -f "${completionMarker}" ]; then
    echo "[Module Integration] Reset already completed for ${slug}; fallback skipped"
    exit 0
  fi
  reset_fixture
  cleanupStatus=$?
  echo "fallback_fixture_reset_exit_code=${cleanupStatus}" | tee -a "${statusFile}"
  if [ "${cleanupStatus}" = "0" ]; then
    touch "${completionMarker}"
  fi
  exit "${cleanupStatus}"
fi

set +e
rm -f "${completionMarker}"
export DOTENV_FILE="${fixtureEnv}"

run_logged "${artifactPrefix}-fixture-setup.log" \
  bash "${fixtureScript}" \
    "${ACCELERATOR_PREFIX}" \
    "${AWS_DEFAULT_REGION}" \
    "${ACCOUNT_ID}" \
    "${SAMPLE_CONFIG_ENV_LOGARCHIVE_ACCOUNT_ID}" \
    "${PARTITION}" \
    "${LZA_GITLAB_ROLE_NAME}" \
    ensure
fixtureSetupStatus=$?

fixtureEnvStatus=125
aggregateStatus=125
testStatus=125
if [ "${fixtureSetupStatus}" = "0" ]; then
  set -a
  source "${fixtureEnv}"
  fixtureEnvStatus=$?
  set +a
  if [ "${fixtureEnvStatus}" = "0" ]; then
    cd "${acceleratorDir}"
    directoryStatus=$?
    if [ "${directoryStatus}" = "0" ]; then
      npx ts-node --transpile-only "${aggregateScript}" "${slug}" "${displayName}" \
        > "${CI_PROJECT_DIR}/integ-manifest-${slug}.json"
      aggregateStatus=$?
      if [ "${aggregateStatus}" = "0" ]; then
        yarn test:integration "test/integration/modules/${slug}/index.test.integration.ts"
        testStatus=$?
      fi
    else
      aggregateStatus="${directoryStatus}"
    fi
  fi
fi

reset_fixture
fixtureResetStatus=$?
if [ "${fixtureResetStatus}" = "0" ]; then
  touch "${completionMarker}"
fi

{
  echo "fixture_setup_exit_code=${fixtureSetupStatus}"
  echo "fixture_env_exit_code=${fixtureEnvStatus}"
  echo "aggregate_exit_code=${aggregateStatus}"
  echo "test_exit_code=${testStatus}"
  echo "fixture_reset_exit_code=${fixtureResetStatus}"
} | tee "${statusFile}"

if [ "${fixtureSetupStatus}" != "0" ] ||
  [ "${fixtureEnvStatus}" != "0" ] ||
  [ "${aggregateStatus}" != "0" ] ||
  [ "${testStatus}" != "0" ] ||
  [ "${fixtureResetStatus}" != "0" ]; then
  exit 1
fi
exit 0
