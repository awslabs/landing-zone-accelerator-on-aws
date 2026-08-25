#!/bin/bash
set -euo pipefail

acceleratorPrefix=$1
region=$2
mgmtAccountId=$3
logArchiveAccountId=$4
partition=$5
crossAccountRoleName=$6
mode=${7:-ensure}

unusedAccountId="${logArchiveAccountId}"
: "${unusedAccountId:?}"

ENV_MANIFEST_PATH="${ENV_MANIFEST:?ENV_MANIFEST must point to the integration environment manifest}"
ENV_NAME="${ENV_NAME:?ENV_NAME is required}"

fixtureTagKey="LzaIntegTestOwner"
fixtureTagValue="${acceleratorPrefix}:issue-4921:policy-attachments"
fixtureDescription="Long-lived LZA integration test fixture: ${fixtureTagValue}"
tagPolicyName="${acceleratorPrefix}-tag-policy-integ"
backupPolicyName="${acceleratorPrefix}-backup-policy-integ"
missingPolicyName="${acceleratorPrefix}-missing-policy-integ"
backupRoleName="${acceleratorPrefix}-BackupPolicyIntegRole"
backupVaultName="${acceleratorPrefix}-backup-policy-integ"
backupManagedPolicyArn="arn:${partition}:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"

resolve_account_id() {
  local account_name="$1"
  jq -er --arg env "${ENV_NAME}" --arg part "${partition}" --arg name "${account_name}" \
    '.environments[] | select(.name==$env and .partition==$part) | .accounts[] | select(.name==$name) | .id' \
    "${ENV_MANIFEST_PATH}"
}

assume_role_exports() {
  local target_account_id="$1"
  local session_name="$2"
  local credentials
  local access_key
  local secret_key
  local session_token
  credentials=$(aws sts assume-role \
    --role-arn "arn:${partition}:iam::${target_account_id}:role/${crossAccountRoleName}" \
    --role-session-name "${session_name}" \
    --duration-seconds 3600 \
    --output json)
  access_key=$(echo "${credentials}" | jq -er '.Credentials.AccessKeyId | select(length > 0)')
  secret_key=$(echo "${credentials}" | jq -er '.Credentials.SecretAccessKey | select(length > 0)')
  session_token=$(echo "${credentials}" | jq -er '.Credentials.SessionToken | select(length > 0)')
  printf 'export AWS_ACCESS_KEY_ID=%q\n' "${access_key}"
  printf 'export AWS_SECRET_ACCESS_KEY=%q\n' "${secret_key}"
  printf 'export AWS_SESSION_TOKEN=%q\n' "${session_token}"
}

with_account_credentials() {
  local account_id="$1"
  local session_name="$2"
  shift 2
  (
    local exports
    local caller
    exports=$(assume_role_exports "${account_id}" "${session_name}")
    eval "${exports}"
    caller=$(aws sts get-caller-identity --query Account --output text)
    if [ "${caller}" != "${account_id}" ]; then
      echo "[Policy Attachment Fixtures] Caller ${caller} does not match ${account_id}" >&2
      exit 1
    fi
    "$@"
  )
}

get_policy_type_status() {
  local policy_type="$1"
  aws organizations list-roots \
    --query "Roots[0].PolicyTypes[?Type=='${policy_type}']|[0].Status" \
    --output text
}

ensure_policy_type() {
  local root_id="$1"
  local policy_type="$2"
  local status
  status=$(get_policy_type_status "${policy_type}")
  if [ "${status}" = "ENABLED" ]; then
    return
  fi
  aws organizations enable-policy-type --root-id "${root_id}" --policy-type "${policy_type}" >/dev/null
  for _ in $(seq 1 60); do
    status=$(get_policy_type_status "${policy_type}")
    if [ "${status}" = "ENABLED" ]; then
      return
    fi
    sleep 5
  done
  echo "[Policy Attachment Fixtures] Timed out enabling ${policy_type}" >&2
  exit 1
}

find_policy_id() {
  local policy_type="$1"
  local policy_name="$2"
  aws organizations list-policies \
    --filter "${policy_type}" \
    --query "Policies[?Name=='${policy_name}']|[0].Id" \
    --output text
}

verify_policy_fixture() {
  local policy_id="$1"
  local policy_name="$2"
  local owner
  local description
  owner=$(aws organizations list-tags-for-resource \
    --resource-id "${policy_id}" \
    --query "Tags[?Key=='${fixtureTagKey}']|[0].Value" \
    --output text)
  description=$(aws organizations describe-policy \
    --policy-id "${policy_id}" \
    --query 'Policy.PolicySummary.Description' \
    --output text)
  if [ "${owner}" != "${fixtureTagValue}" ] || [ "${description}" != "${fixtureDescription}" ]; then
    echo "[Policy Attachment Fixtures] Policy fixture identity mismatch: ${policy_name}" >&2
    exit 1
  fi
}

ensure_policy() {
  local policy_type="$1"
  local policy_name="$2"
  local content_file="$3"
  local policy_id
  policy_id=$(find_policy_id "${policy_type}" "${policy_name}")
  if [ -n "${policy_id}" ] && [ "${policy_id}" != "None" ]; then
    verify_policy_fixture "${policy_id}" "${policy_name}"
    aws organizations update-policy \
      --policy-id "${policy_id}" \
      --description "${fixtureDescription}" \
      --content "file://${content_file}" >/dev/null
  else
    policy_id=$(aws organizations create-policy \
      --name "${policy_name}" \
      --description "${fixtureDescription}" \
      --type "${policy_type}" \
      --content "file://${content_file}" \
      --tags "Key=${fixtureTagKey},Value=${fixtureTagValue}" \
      --query 'Policy.PolicySummary.Id' \
      --output text)
  fi
  verify_policy_fixture "${policy_id}" "${policy_name}"
  echo "${policy_id}"
}

reset_policy_targets() {
  local policy_id="$1"
  local policy_name="$2"
  local account_ids
  verify_policy_fixture "${policy_id}" "${policy_name}"
  account_ids=$(aws organizations list-targets-for-policy \
    --policy-id "${policy_id}" \
    --query 'Targets[?Type==`ACCOUNT`].TargetId' \
    --output text)
  if [ -z "${account_ids}" ] || [ "${account_ids}" = "None" ]; then
    return
  fi
  for account_id in ${account_ids}; do
    verify_policy_fixture "${policy_id}" "${policy_name}"
    aws organizations detach-policy --policy-id "${policy_id}" --target-id "${account_id}"
  done
  for _ in $(seq 1 30); do
    account_ids=$(aws organizations list-targets-for-policy \
      --policy-id "${policy_id}" \
      --query 'Targets[?Type==`ACCOUNT`].TargetId' \
      --output text)
    if [ -z "${account_ids}" ] || [ "${account_ids}" = "None" ]; then
      return
    fi
    sleep 2
  done
  echo "[Policy Attachment Fixtures] Timed out resetting direct targets for ${policy_name}" >&2
  exit 1
}

get_role_presence() {
  local error_file
  error_file=$(mktemp)
  if aws iam get-role --role-name "${backupRoleName}" >/dev/null 2>"${error_file}"; then
    rm -f "${error_file}"
    echo "present"
    return
  fi
  if grep -q "NoSuchEntity" "${error_file}"; then
    rm -f "${error_file}"
    echo "absent"
    return
  fi
  cat "${error_file}" >&2
  rm -f "${error_file}"
  return 1
}

verify_role_fixture() {
  local owner
  owner=$(aws iam list-role-tags \
    --role-name "${backupRoleName}" \
    --query "Tags[?Key=='${fixtureTagKey}']|[0].Value" \
    --output text)
  if [ "${owner}" != "${fixtureTagValue}" ]; then
    echo "[Policy Attachment Fixtures] Backup role fixture tag mismatch" >&2
    exit 1
  fi
}

find_backup_vault_arn() {
  local vaults
  local count
  vaults=$(aws backup list-backup-vaults --region "${region}" --output json)
  count=$(echo "${vaults}" | jq -r --arg name "${backupVaultName}" \
    '[.BackupVaultList[]? | select(.BackupVaultName == $name)] | length')
  if [ "${count}" = "0" ]; then
    echo "None"
    return
  fi
  if [ "${count}" != "1" ]; then
    echo "[Policy Attachment Fixtures] Duplicate Backup vault fixture names" >&2
    exit 1
  fi
  echo "${vaults}" | jq -er --arg name "${backupVaultName}" \
    '.BackupVaultList[] | select(.BackupVaultName == $name) | .BackupVaultArn'
}

verify_vault_fixture() {
  local vault_arn="$1"
  local tags
  local owner
  local details
  tags=$(aws backup list-tags --resource-arn "${vault_arn}" --region "${region}" --output json)
  owner=$(echo "${tags}" | jq -r --arg key "${fixtureTagKey}" '.Tags[$key] // empty')
  details=$(aws backup describe-backup-vault \
    --backup-vault-name "${backupVaultName}" \
    --region "${region}" \
    --output json)
  if [ "${owner}" != "${fixtureTagValue}" ] ||
    [ "$(echo "${details}" | jq -r '.BackupVaultArn')" != "${vault_arn}" ]; then
    echo "[Policy Attachment Fixtures] Backup vault fixture identity mismatch" >&2
    exit 1
  fi
}

ensure_backup_account_fixtures() {
  local role_presence
  local trust_file
  local vault_arn
  vault_arn=$(find_backup_vault_arn)

  trust_file=$(mktemp)
  cat > "${trust_file}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "backup.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF
  role_presence=$(get_role_presence)
  if [ "${role_presence}" = "present" ]; then
    verify_role_fixture
    aws iam update-assume-role-policy \
      --role-name "${backupRoleName}" \
      --policy-document "file://${trust_file}"
  else
    aws iam create-role \
      --role-name "${backupRoleName}" \
      --description "${fixtureDescription}" \
      --assume-role-policy-document "file://${trust_file}" \
      --tags "Key=${fixtureTagKey},Value=${fixtureTagValue}" >/dev/null
  fi
  rm -f "${trust_file}"
  verify_role_fixture
  aws iam attach-role-policy --role-name "${backupRoleName}" --policy-arn "${backupManagedPolicyArn}"

  if [ "${vault_arn}" = "None" ]; then
    vault_arn=$(aws backup create-backup-vault \
      --backup-vault-name "${backupVaultName}" \
      --backup-vault-tags "${fixtureTagKey}=${fixtureTagValue}" \
      --region "${region}" \
      --query 'BackupVaultArn' \
      --output text)
  fi
  verify_vault_fixture "${vault_arn}"
}

write_policy_files() {
  tagPolicyFile=$(mktemp)
  backupPolicyFile=$(mktemp)
  cat > "${tagPolicyFile}" <<EOF
{
  "tags": {
    "LzaIntegrationTest": {
      "tag_key": {"@@assign": "LzaIntegrationTest"}
    }
  }
}
EOF
  cat > "${backupPolicyFile}" <<EOF
{
  "plans": {
    "IntegrationTestPlan": {
      "regions": {"@@assign": ["${region}"]},
      "rules": {
        "IntegrationTestRule": {
          "schedule_expression": {"@@assign": "cron(0 5 ? * SUN *)"},
          "start_backup_window_minutes": {"@@assign": "60"},
          "complete_backup_window_minutes": {"@@assign": "120"},
          "lifecycle": {"delete_after_days": {"@@assign": "7"}},
          "target_backup_vault_name": {"@@assign": "${backupVaultName}"}
        }
      },
      "selections": {
        "tags": {
          "IntegrationTestSelection": {
            "iam_role_arn": {"@@assign": "arn:${partition}:iam::\$account:role/${backupRoleName}"},
            "tag_key": {"@@assign": "LzaIntegrationTestBackup"},
            "tag_value": {"@@assign": ["NeverMatch-${acceleratorPrefix}"]}
          }
        }
      }
    }
  }
}
EOF
}

reset_all_policy_targets() {
  local tag_policy_id
  local backup_policy_id
  tag_policy_id=$(find_policy_id TAG_POLICY "${tagPolicyName}")
  backup_policy_id=$(find_policy_id BACKUP_POLICY "${backupPolicyName}")
  if [ -n "${tag_policy_id}" ] && [ "${tag_policy_id}" != "None" ]; then
    reset_policy_targets "${tag_policy_id}" "${tagPolicyName}"
  fi
  if [ -n "${backup_policy_id}" ] && [ "${backup_policy_id}" != "None" ]; then
    reset_policy_targets "${backup_policy_id}" "${backupPolicyName}"
  fi
}

case "${mode}" in
  ensure)
    rootId=$(aws organizations list-roots --query 'Roots[0].Id' --output text)
    ensure_policy_type "${rootId}" TAG_POLICY
    ensure_policy_type "${rootId}" BACKUP_POLICY

    sharedServicesAccountId=$(resolve_account_id "Shared Services")
    auditAccountId=$(resolve_account_id "Audit")
    for account_id in "${sharedServicesAccountId}" "${auditAccountId}"; do
      if [[ ! "${account_id}" =~ ^[0-9]{12}$ ]]; then
        echo "[Policy Attachment Fixtures] Invalid child account ID" >&2
        exit 1
      fi
    done
    with_account_credentials "${sharedServicesAccountId}" "policy-fixture-shared" ensure_backup_account_fixtures
    with_account_credentials "${auditAccountId}" "policy-fixture-audit" ensure_backup_account_fixtures

    write_policy_files
    trap 'rm -f "${tagPolicyFile}" "${backupPolicyFile}"' EXIT
    tagPolicyId=$(ensure_policy TAG_POLICY "${tagPolicyName}" "${tagPolicyFile}")
    backupPolicyId=$(ensure_policy BACKUP_POLICY "${backupPolicyName}" "${backupPolicyFile}")
    reset_policy_targets "${tagPolicyId}" "${tagPolicyName}"
    reset_policy_targets "${backupPolicyId}" "${backupPolicyName}"

    : "${DOTENV_FILE:?DOTENV_FILE is required for ensure mode}"
    {
      echo "POLICY_ATTACHMENTS_INTEG_TAG_POLICY_NAME=${tagPolicyName}"
      echo "POLICY_ATTACHMENTS_INTEG_BACKUP_POLICY_NAME=${backupPolicyName}"
      echo "POLICY_ATTACHMENTS_INTEG_MISSING_POLICY_NAME=${missingPolicyName}"
      echo "POLICY_ATTACHMENTS_INTEG_SHARED_SERVICES_ACCOUNT_ID=${sharedServicesAccountId}"
      echo "POLICY_ATTACHMENTS_INTEG_AUDIT_ACCOUNT_ID=${auditAccountId}"
    } > "${DOTENV_FILE}"
    echo "[Policy Attachment Fixtures] Long-lived baseline ensured with zero direct account targets"
    ;;
  reset)
    reset_all_policy_targets
    echo "[Policy Attachment Fixtures] Direct ACCOUNT targets reset to empty"
    ;;
  *)
    echo "[Policy Attachment Fixtures] Unsupported mode: ${mode}" >&2
    exit 1
    ;;
esac
