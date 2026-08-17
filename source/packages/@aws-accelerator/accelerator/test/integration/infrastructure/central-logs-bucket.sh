#!/bin/bash
set -euo pipefail

# Central logs bucket setup (Log Archive account).
#
# Creates the KMS key and S3 bucket used by security modules for findings export.
# The bucket policy and KMS key policy are built dynamically from the SERVICES list.
# Add new service principals below as new security modules are onboarded.
#
# Idempotent: checks before creating, always applies encryption, policies, and settings.
#
# Exports to DOTENV_FILE:
#   LOGGING_BUCKET_NAME  — S3 bucket name
#   LOGGING_BUCKET_KEY_ARN — KMS key ARN (actual key, not alias)
#
# Usage (called by deploy-integ-prereqs.sh):
#   central-logs-bucket.sh <prefix> <region> <mgmt-account-id> <logarchive-account-id> <partition> <cross-account-role-name>

# ============================================================
# Service principals that need access to the central logs bucket.
# Add new services here as modules are onboarded.
# ============================================================
SERVICES=(
  "macie.amazonaws.com"
  "guardduty.amazonaws.com"
  # "securityhub.amazonaws.com"
)

acceleratorPrefix=$1
region=$2
mgmtAccountId=$3
logArchiveAccountId=$4
partition=$5
crossAccountRoleName=$6

BUCKET_PREFIX=$(echo "${acceleratorPrefix}" | tr '[:upper:]' '[:lower:]')
BUCKET_NAME="${BUCKET_PREFIX}-central-logs-${logArchiveAccountId}-${region}"
KMS_ALIAS="alias/${BUCKET_PREFIX}/kms/s3/key"
BUCKET_ARN="arn:${partition}:s3:::${BUCKET_NAME}"

echo ""
echo "[Central Logs] Setting up central logs bucket in Log Archive account..."
echo "[Central Logs]   Bucket: ${BUCKET_NAME}"
echo "[Central Logs]   Services: ${SERVICES[*]}"

# Get Organization ID before assuming into Log Archive (needs management account creds)
ORG_ID=$(aws organizations describe-organization --query 'Organization.Id' --output text 2>/dev/null || echo "")
echo "[Central Logs]   Organization ID: ${ORG_ID:-UNAVAILABLE}"

# Assume role into Log Archive account
ROLE_ARN="arn:${partition}:iam::${logArchiveAccountId}:role/${crossAccountRoleName}"
echo "[Central Logs]   Assuming role: ${ROLE_ARN}"

CREDS=$(aws sts assume-role \
  --role-arn "${ROLE_ARN}" \
  --role-session-name "integ-central-logs" \
  --duration-seconds 3600 \
  --output json)

export AWS_ACCESS_KEY_ID=$(echo "${CREDS}" | jq -r '.Credentials.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo "${CREDS}" | jq -r '.Credentials.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo "${CREDS}" | jq -r '.Credentials.SessionToken')

# ------------------------------------------------------------------
# Build service principal JSON fragments for KMS and bucket policies
# ------------------------------------------------------------------
build_kms_service_statement() {
  local services_json=""
  for svc in "${SERVICES[@]}"; do
    [ -n "${services_json}" ] && services_json="${services_json},"
    services_json="${services_json}\"${svc}\""
  done
  cat <<EOF
    {
      "Sid": "AllowServiceAccess",
      "Effect": "Allow",
      "Principal": { "Service": [${services_json}] },
      "Action": ["kms:Decrypt","kms:DescribeKey","kms:Encrypt","kms:GenerateDataKey","kms:GenerateDataKeyWithoutPlaintext"],
      "Resource": "*"
    }
EOF
}

build_bucket_service_statement() {
  local services_json=""
  for svc in "${SERVICES[@]}"; do
    [ -n "${services_json}" ] && services_json="${services_json},"
    services_json="${services_json}\"${svc}\""
  done
  cat <<EOF
    {
      "Sid": "AllowServiceWrite",
      "Effect": "Allow",
      "Principal": { "Service": [${services_json}] },
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": ["${BUCKET_ARN}", "${BUCKET_ARN}/*"]
    }
EOF
}

# ------------------------------------------------------------------
# KMS key
# ------------------------------------------------------------------
EXISTING_KEY_ARN=$(aws kms describe-key --key-id "${KMS_ALIAS}" --region "${region}" \
  --query 'KeyMetadata.Arn' --output text 2>/dev/null || echo "")

if [ -n "${EXISTING_KEY_ARN}" ] && [ "${EXISTING_KEY_ARN}" != "None" ]; then
  KEY_ARN="${EXISTING_KEY_ARN}"
  echo "[Central Logs]   KMS key already exists: ${KEY_ARN}"
else
  echo "[Central Logs]   Creating KMS key..."

  KEY_ARN=$(aws kms create-key \
    --description "Integration test KMS key for central logs bucket encryption" \
    --region "${region}" \
    --tags TagKey=Accelerator,TagValue="${acceleratorPrefix}" TagKey=Purpose,TagValue=IntegrationTest \
    --query 'KeyMetadata.Arn' --output text)

  aws kms enable-key-rotation \
    --key-id "${KEY_ARN}" \
    --region "${region}"

  aws kms create-alias \
    --alias-name "${KMS_ALIAS}" \
    --target-key-id "${KEY_ARN}" \
    --region "${region}"

  echo "[Central Logs]   KMS key created: ${KEY_ARN}"
fi

# Always apply KMS key policy (idempotent — ensures new services are added)
echo "[Central Logs]   Applying KMS key policy..."
KEY_ID=$(aws kms describe-key --key-id "${KEY_ARN}" --region "${region}" \
  --query 'KeyMetadata.KeyId' --output text)

KMS_SERVICE_STMT=$(build_kms_service_statement)
POLICY_FILE=$(mktemp)
cat > "${POLICY_FILE}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EnableRootAccountAccess",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:${partition}:iam::${logArchiveAccountId}:root" },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "AllowManagementAccountAccess",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:${partition}:iam::${mgmtAccountId}:root" },
      "Action": ["kms:Decrypt","kms:DescribeKey","kms:Encrypt","kms:GenerateDataKey","kms:GenerateDataKeyWithoutPlaintext","kms:ReEncryptFrom","kms:ReEncryptTo"],
      "Resource": "*"
    },
${KMS_SERVICE_STMT}
  ]
}
EOF

aws kms put-key-policy \
  --key-id "${KEY_ID}" \
  --policy-name default \
  --policy "file://${POLICY_FILE}" \
  --region "${region}"
rm -f "${POLICY_FILE}"
echo "[Central Logs]   KMS key policy applied."

# ------------------------------------------------------------------
# S3 bucket
# ------------------------------------------------------------------
if aws s3api head-bucket --bucket "${BUCKET_NAME}" --region "${region}" 2>/dev/null; then
  echo "[Central Logs]   Bucket already exists: ${BUCKET_NAME}"
else
  echo "[Central Logs]   Creating bucket: ${BUCKET_NAME}..."
  if [ "${region}" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "${BUCKET_NAME}" --region "${region}"
  else
    aws s3api create-bucket --bucket "${BUCKET_NAME}" --region "${region}" \
      --create-bucket-configuration LocationConstraint="${region}"
  fi
  echo "[Central Logs]   Bucket created."
fi

# Always apply encryption, public access block, versioning, and bucket policy
echo "[Central Logs]   Applying bucket configuration..."

aws s3api put-bucket-encryption \
  --bucket "${BUCKET_NAME}" \
  --region "${region}" \
  --server-side-encryption-configuration "{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"aws:kms\",\"KMSMasterKeyID\":\"${KEY_ARN}\"},\"BucketKeyEnabled\":true}]}"

aws s3api put-public-access-block \
  --bucket "${BUCKET_NAME}" \
  --region "${region}" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

aws s3api put-bucket-versioning \
  --bucket "${BUCKET_NAME}" \
  --region "${region}" \
  --versioning-configuration Status=Enabled

BUCKET_SERVICE_STMT=$(build_bucket_service_statement)
POLICY_FILE=$(mktemp)

cat > "${POLICY_FILE}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
${BUCKET_SERVICE_STMT},
    {
      "Sid": "AllowOrgPrincipalsReadAccess",
      "Effect": "Allow",
      "Principal": { "AWS": "*" },
      "Action": ["s3:GetObject*", "s3:GetBucket*", "s3:List*"],
      "Resource": ["${BUCKET_ARN}", "${BUCKET_ARN}/*"],
      "Condition": {
        "StringEquals": {
          "aws:PrincipalOrgID": "${ORG_ID}"
        }
      }
    },
    {
      "Sid": "DenyUnencryptedUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "${BUCKET_ARN}/*",
      "Condition": { "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" } }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["${BUCKET_ARN}", "${BUCKET_ARN}/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
EOF
aws s3api put-bucket-policy \
  --bucket "${BUCKET_NAME}" \
  --region "${region}" \
  --policy "file://${POLICY_FILE}"
rm -f "${POLICY_FILE}"

echo "[Central Logs]   Bucket configuration applied."

# ------------------------------------------------------------------
# Create service prefix folders (GuardDuty requires prefix to exist)
# ------------------------------------------------------------------
echo "[Central Logs]   Creating service prefix folders..."
for svc_prefix in guardduty macie; do
  if aws s3api head-object --bucket "${BUCKET_NAME}" --key "${svc_prefix}/" --region "${region}" 2>/dev/null; then
    echo "[Central Logs]     ${svc_prefix}/ already exists"
  else
    aws s3api put-object \
      --bucket "${BUCKET_NAME}" \
      --key "${svc_prefix}/" \
      --server-side-encryption aws:kms \
      --ssekms-key-id "${KEY_ARN}" \
      --region "${region}"
    echo "[Central Logs]     Created ${svc_prefix}/"
  fi
done

# ------------------------------------------------------------------
# Export outputs
# ------------------------------------------------------------------
if [ -n "${DOTENV_FILE:-}" ]; then
  echo "LOGGING_BUCKET_NAME=${BUCKET_NAME}" >> "${DOTENV_FILE}"
  echo "LOGGING_BUCKET_KEY_ARN=${KEY_ARN}" >> "${DOTENV_FILE}"
  echo "[Central Logs]   Exported LOGGING_BUCKET_NAME and LOGGING_BUCKET_KEY_ARN to dotenv."
fi

echo "[Central Logs] Central logs bucket setup complete."
echo "[Central Logs]   LOGGING_BUCKET_NAME=${BUCKET_NAME}"
echo "[Central Logs]   LOGGING_BUCKET_KEY_ARN=${KEY_ARN}"
