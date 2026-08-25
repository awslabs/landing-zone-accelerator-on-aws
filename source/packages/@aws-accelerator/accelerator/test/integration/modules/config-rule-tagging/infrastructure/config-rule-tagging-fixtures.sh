#!/bin/bash
set -euo pipefail

acceleratorPrefix=$1
region=$2
mgmtAccountId=$3
logArchiveAccountId=$4
partition=$5
crossAccountRoleName=$6
mode=${7:-ensure}

unusedAccountIds="${mgmtAccountId}:${logArchiveAccountId}"
: "${unusedAccountIds:?}"

ENV_MANIFEST_PATH="${ENV_MANIFEST:?ENV_MANIFEST must point to the integration environment manifest}"
ENV_NAME="${ENV_NAME:?ENV_NAME is required}"

fixtureTagKey="LzaIntegTestOwner"
fixtureTagValue="${acceleratorPrefix}:issue-4921:config-rule-tagging"
externalTagKey="ExternalSentinel"
externalTagValue="preserved"
ruleName="${acceleratorPrefix}-config-rule-tagging-integ"
missingRuleName="${ruleName}-missing"
ssmParameter="/${acceleratorPrefix}/integration/config-rule-tagging/dynamic-value"
dynamicValue="resolved-from-ssm"

resolve_account_id() {
  local account_name="$1"
  jq -er --arg env "${ENV_NAME}" --arg part "${partition}" --arg name "${account_name}" \
    '.environments[] | select(.name==$env and .partition==$part) | .accounts[] | select(.name==$name) | .id' \
    "${ENV_MANIFEST_PATH}"
}

assume_target_account() {
  local target_account_id="$1"
  local credentials
  local access_key
  local secret_key
  local session_token
  local caller_account_id
  credentials=$(aws sts assume-role \
    --role-arn "arn:${partition}:iam::${target_account_id}:role/${crossAccountRoleName}" \
    --role-session-name "config-rule-tagging-fixtures" \
    --duration-seconds 3600 \
    --output json)
  access_key=$(echo "${credentials}" | jq -er '.Credentials.AccessKeyId | select(length > 0)')
  secret_key=$(echo "${credentials}" | jq -er '.Credentials.SecretAccessKey | select(length > 0)')
  session_token=$(echo "${credentials}" | jq -er '.Credentials.SessionToken | select(length > 0)')
  export AWS_ACCESS_KEY_ID="${access_key}"
  export AWS_SECRET_ACCESS_KEY="${secret_key}"
  export AWS_SESSION_TOKEN="${session_token}"
  caller_account_id=$(aws sts get-caller-identity --query Account --output text)
  if [ "${caller_account_id}" != "${target_account_id}" ]; then
    echo "[Config Rule Tagging Fixtures] Caller ${caller_account_id} does not match ${target_account_id}" >&2
    exit 1
  fi
}

get_config_rule_arn() {
  local output
  local error_file
  error_file=$(mktemp)
  if output=$(aws configservice describe-config-rules \
    --config-rule-names "${ruleName}" \
    --region "${region}" \
    --query 'ConfigRules[0].ConfigRuleArn' \
    --output text 2>"${error_file}"); then
    rm -f "${error_file}"
    echo "${output}"
    return
  fi
  if grep -q "NoSuchConfigRuleException" "${error_file}"; then
    rm -f "${error_file}"
    echo "None"
    return
  fi
  cat "${error_file}" >&2
  rm -f "${error_file}"
  return 1
}

get_parameter_presence() {
  local error_file
  error_file=$(mktemp)
  if aws ssm get-parameter --name "${ssmParameter}" --region "${region}" >/dev/null 2>"${error_file}"; then
    rm -f "${error_file}"
    echo "present"
    return
  fi
  if grep -q "ParameterNotFound" "${error_file}"; then
    rm -f "${error_file}"
    echo "absent"
    return
  fi
  cat "${error_file}" >&2
  rm -f "${error_file}"
  return 1
}

verify_rule_fixture() {
  local rule_arn="$1"
  local rule
  local owner
  rule=$(aws configservice describe-config-rules \
    --config-rule-names "${ruleName}" \
    --region "${region}" \
    --output json)
  if ! echo "${rule}" | jq -e \
    --arg name "${ruleName}" \
    '.ConfigRules | length == 1 and .[0].ConfigRuleName == $name and
      .[0].Source.Owner == "AWS" and .[0].Source.SourceIdentifier == "S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED"' \
    >/dev/null; then
    echo "[Config Rule Tagging Fixtures] Config rule identity does not match the fixed fixture" >&2
    exit 1
  fi
  owner=$(aws configservice list-tags-for-resource \
    --resource-arn "${rule_arn}" \
    --region "${region}" \
    --query "Tags[?Key=='${fixtureTagKey}']|[0].Value" \
    --output text)
  if [ "${owner}" != "${fixtureTagValue}" ]; then
    echo "[Config Rule Tagging Fixtures] Config rule fixture tag mismatch" >&2
    exit 1
  fi
}

verify_parameter_fixture() {
  local owner
  owner=$(aws ssm list-tags-for-resource \
    --resource-type Parameter \
    --resource-id "${ssmParameter}" \
    --region "${region}" \
    --query "TagList[?Key=='${fixtureTagKey}']|[0].Value" \
    --output text)
  if [ "${owner}" != "${fixtureTagValue}" ]; then
    echo "[Config Rule Tagging Fixtures] SSM parameter fixture tag mismatch" >&2
    exit 1
  fi
}

ensure_fixtures() {
  local rule_arn
  local parameter_presence
  local config_rule
  rule_arn=$(get_config_rule_arn)
  config_rule=$(jq -n --arg name "${ruleName}" '{
    ConfigRuleName: $name,
    Description: "Long-lived LZA integration test fixture",
    Source: {
      Owner: "AWS",
      SourceIdentifier: "S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED"
    }
  }')
  if [ "${rule_arn}" = "None" ]; then
    aws configservice put-config-rule \
      --config-rule "${config_rule}" \
      --tags \
        "Key=${fixtureTagKey},Value=${fixtureTagValue}" \
        "Key=${externalTagKey},Value=${externalTagValue}" \
      --region "${region}"
    rule_arn=$(get_config_rule_arn)
  fi
  if [ -z "${rule_arn}" ] || [ "${rule_arn}" = "None" ]; then
    echo "[Config Rule Tagging Fixtures] Config rule was not created" >&2
    exit 1
  fi
  verify_rule_fixture "${rule_arn}"
  aws configservice tag-resource \
    --resource-arn "${rule_arn}" \
    --tags \
      "Key=${fixtureTagKey},Value=${fixtureTagValue}" \
      "Key=${externalTagKey},Value=${externalTagValue}" \
    --region "${region}"

  parameter_presence=$(get_parameter_presence)
  if [ "${parameter_presence}" = "absent" ]; then
    aws ssm put-parameter \
      --name "${ssmParameter}" \
      --type String \
      --value "${dynamicValue}" \
      --tags "Key=${fixtureTagKey},Value=${fixtureTagValue}" \
      --region "${region}" >/dev/null
  fi
  verify_parameter_fixture
}

reset_fixtures() {
  local rule_arn
  local parameter_presence
  rule_arn=$(get_config_rule_arn)
  if [ "${rule_arn}" != "None" ]; then
    verify_rule_fixture "${rule_arn}"
    aws configservice tag-resource \
      --resource-arn "${rule_arn}" \
      --tags \
        "Key=${fixtureTagKey},Value=${fixtureTagValue}" \
        "Key=${externalTagKey},Value=${externalTagValue}" \
      --region "${region}"
    aws configservice untag-resource \
      --resource-arn "${rule_arn}" \
      --tag-keys Accelerator StaticTag DynamicTag UpdatedTag \
      --region "${region}"
  fi

  parameter_presence=$(get_parameter_presence)
  if [ "${parameter_presence}" = "present" ]; then
    verify_parameter_fixture
    aws ssm put-parameter \
      --name "${ssmParameter}" \
      --type String \
      --value "${dynamicValue}" \
      --overwrite \
      --region "${region}" >/dev/null
  fi
}

sharedServicesAccountId=$(resolve_account_id "Shared Services")
if [[ ! "${sharedServicesAccountId}" =~ ^[0-9]{12}$ ]]; then
  echo "[Config Rule Tagging Fixtures] Invalid Shared Services account ID" >&2
  exit 1
fi
assume_target_account "${sharedServicesAccountId}"

case "${mode}" in
  ensure)
    ensure_fixtures
    reset_fixtures
    : "${DOTENV_FILE:?DOTENV_FILE is required for ensure mode}"
    {
      echo "CONFIG_RULE_TAGGING_INTEG_ACCOUNT_ID=${sharedServicesAccountId}"
      echo "CONFIG_RULE_TAGGING_INTEG_REGION=${region}"
      echo "CONFIG_RULE_TAGGING_INTEG_RULE_NAME=${ruleName}"
      echo "CONFIG_RULE_TAGGING_INTEG_MISSING_RULE_NAME=${missingRuleName}"
      echo "CONFIG_RULE_TAGGING_INTEG_SSM_PARAMETER=${ssmParameter}"
      echo "CONFIG_RULE_TAGGING_INTEG_DYNAMIC_VALUE=${dynamicValue}"
      echo "CONFIG_RULE_TAGGING_INTEG_OWNERSHIP_TAG_KEY=${fixtureTagKey}"
      echo "CONFIG_RULE_TAGGING_INTEG_OWNERSHIP_TAG_VALUE=${fixtureTagValue}"
    } > "${DOTENV_FILE}"
    echo "[Config Rule Tagging Fixtures] Long-lived baseline ensured and reset"
    ;;
  reset)
    reset_fixtures
    echo "[Config Rule Tagging Fixtures] Managed tags cleared and SSM value restored"
    ;;
  *)
    echo "[Config Rule Tagging Fixtures] Unsupported mode: ${mode}" >&2
    exit 1
    ;;
esac
