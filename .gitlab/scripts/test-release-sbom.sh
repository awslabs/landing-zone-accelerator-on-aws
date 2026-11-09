#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/release-sbom.sh"

PASS=0
FAIL=0

assert_eq() {
  local description="$1"
  local expected="$2"
  local actual="$3"

  if [ "$expected" = "$actual" ]; then
    printf 'PASS: %s\n' "$description"
    ((PASS++)) || true
  else
    printf 'FAIL: %s\n  expected: %s\n  actual:   %s\n' "$description" "$expected" "$actual"
    ((FAIL++)) || true
  fi
}

assert_succeeds() {
  local description="$1"
  shift

  if "$@" >/dev/null 2>&1; then
    printf 'PASS: %s\n' "$description"
    ((PASS++)) || true
  else
    printf 'FAIL: %s\n' "$description"
    ((FAIL++)) || true
  fi
}

assert_fails() {
  local description="$1"
  shift

  if ("$@" >/dev/null 2>&1); then
    printf 'FAIL: %s\n' "$description"
    ((FAIL++)) || true
  else
    printf 'PASS: %s\n' "$description"
    ((PASS++)) || true
  fi
}

check_environment() {
  local project_id="$1"
  local commit_tag="$2"
  local commit_sha="$3"

  CI_PROJECT_ID="$project_id" CI_COMMIT_TAG="$commit_tag" CI_COMMIT_SHA="$commit_sha" require_environment
}

check_environment_without_project() {
  unset CI_PROJECT_ID
  CI_COMMIT_TAG="$1" CI_COMMIT_SHA="$2" require_environment
}

TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT

ARCHIVE_FIXTURE="$TEST_DIR/trivy-archive.tar.gz"
printf 'release SBOM integrity fixture\n' > "$ARCHIVE_FIXTURE"
ARCHIVE_FIXTURE_SHA256="$(sha256sum "$ARCHIVE_FIXTURE" | awk '{print $1}')"

cat > "$TEST_DIR/plain-name.json" <<'JSON'
{
  "components": [
    { "name": "aws-cdk-lib", "version": "2.267.0" }
  ]
}
JSON

cat > "$TEST_DIR/group-name.json" <<'JSON'
{
  "components": [
    { "group": "@aws-cdk", "name": "asset-awscli-v1", "version": "2.2.292" }
  ]
}
JSON

cat > "$TEST_DIR/encoded-purl.json" <<'JSON'
{
  "components": [
    {
      "name": "decoy-package",
      "version": "9.9.9",
      "purl": "pkg:npm/decoy-package@9.9.9"
    },
    {
      "name": "near-name-decoy",
      "version": "8.8.8",
      "purl": "pkg:npm/%40aws-cdk/asset-awscli-v1-foo@8.8.8"
    },
    {
      "name": "unrelated-display-name",
      "version": "2.2.292",
      "purl": "pkg:npm/%40aws-cdk/asset-awscli-v1@2.2.292"
    }
  ]
}
JSON

cat > "$TEST_DIR/decoy-only.json" <<'JSON'
{
  "components": [
    {
      "name": "decoy-package",
      "version": "9.9.9",
      "purl": "pkg:npm/decoy-package@9.9.9"
    }
  ]
}
JSON

cat > "$TEST_DIR/missing-version.json" <<'JSON'
{
  "components": [
    { "name": "awscli" }
  ]
}
JSON

cat > "$TEST_DIR/missing-component.json" <<'JSON'
{
  "components": []
}
JSON

assert_succeeds \
  "accepts the release environment for project 21753" \
  check_environment "21753" "v1.17.1" "0123456789abcdef"

assert_fails \
  "rejects an unset project id" \
  check_environment_without_project "v1.17.1" "0123456789abcdef"

assert_fails \
  "rejects a different project id" \
  check_environment "99999" "v1.17.1" "0123456789abcdef"

assert_fails \
  "rejects an empty release tag" \
  check_environment "21753" "" "0123456789abcdef"

assert_fails \
  "rejects an empty commit SHA" \
  check_environment "21753" "v1.17.1" ""

assert_succeeds \
  "accepts an archive with the expected SHA-256" \
  verify_archive_sha256 "$ARCHIVE_FIXTURE" "$ARCHIVE_FIXTURE_SHA256"

assert_fails \
  "rejects an archive with a mismatched SHA-256" \
  verify_archive_sha256 "$ARCHIVE_FIXTURE" "0000000000000000000000000000000000000000000000000000000000000000"

assert_eq \
  "matches an unscoped package by name" \
  "2.267.0" \
  "$(component_version "$TEST_DIR/plain-name.json" "aws-cdk-lib")"

assert_eq \
  "matches a scoped package by group and name" \
  "2.2.292" \
  "$(component_version "$TEST_DIR/group-name.json" "@aws-cdk/asset-awscli-v1")"

assert_eq \
  "matches a scoped package by URL-encoded purl without selecting a decoy" \
  "2.2.292" \
  "$(component_version "$TEST_DIR/encoded-purl.json" "@aws-cdk/asset-awscli-v1")"

assert_fails \
  "rejects a versioned component with a different purl" \
  component_version "$TEST_DIR/decoy-only.json" "@aws-cdk/asset-awscli-v1"

assert_fails \
  "rejects a component with no version" \
  component_version "$TEST_DIR/missing-version.json" "awscli"

assert_fails \
  "rejects a missing component" \
  component_version "$TEST_DIR/missing-component.json" "awscli"

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
