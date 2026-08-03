#!/bin/bash
set -euo pipefail

# TGW module integration test prerequisites.
#
# Creates long-lived baseline AWS resources exercised by the TGW integration
# manifests: a Transit Gateway in the Network account with two route tables,
# a VPC + attachment in Network, a VPN attachment (dummy customer gateway),
# a Direct Connect Gateway in each account, a RAM share of the TGW to SharedServices, and a
# VPC + attachment in SharedServices. Publishes SSM parameters at the
# canonical paths consumed by @aws-lza `configureTgw`.
#
# Idempotent: every step is describe-then-create; safe to re-run.
# Deploy-only (matches Macie prereq convention). No teardown flag.
#
# Baseline state is kept ZERO associations / ZERO propagations. The test
# narrative's final manifest restores the env to this zero state.
#
# Usage (called by deploy-integ-prereqs.sh):
#   tgw-prereqs.sh <prefix> <region> <mgmt-account-id> <logarchive-account-id> <partition> <cross-account-role-name>

acceleratorPrefix=$1
region=$2
mgmtAccountId=$3       # unused; caller runs under mgmt creds already
logArchiveAccountId=$4 # unused
partition=$5
crossAccountRoleName=$6

# ENV_MANIFEST path is inherited from the CI env — lets us resolve Network + SharedServices
ENV_MANIFEST_PATH="${ENV_MANIFEST:?ENV_MANIFEST env var must point at the environment manifest JSON}"
ENV_NAME="${ENV_NAME:?ENV_NAME env var required}"

echo ""
echo "[TGW Prereqs] ============================================"
echo "[TGW Prereqs] Transit Gateway baseline deployment"
echo "[TGW Prereqs] ============================================"
echo "[TGW Prereqs] Prefix:      ${acceleratorPrefix}"
echo "[TGW Prereqs] Region:      ${region}"
echo "[TGW Prereqs] Partition:   ${partition}"
echo "[TGW Prereqs] Role:        ${crossAccountRoleName}"
echo "[TGW Prereqs] Manifest:    ${ENV_MANIFEST_PATH}"
echo "[TGW Prereqs] Env name:    ${ENV_NAME}"

# ------------------------------------------------------------------
# Resolve account IDs from ENV_MANIFEST
# ------------------------------------------------------------------
resolve_account_id() {
  local account_name="$1"
  jq -r --arg env "${ENV_NAME}" --arg part "${partition}" --arg name "${account_name}" \
    '.environments[] | select(.name==$env and .partition==$part) | .accounts[] | select(.name==$name) | .id' \
    "${ENV_MANIFEST_PATH}"
}

NETWORK_ACCOUNT_ID=$(resolve_account_id "Network")
SHARED_SERVICES_ACCOUNT_ID=$(resolve_account_id "Shared Services")

if [ -z "${NETWORK_ACCOUNT_ID}" ] || [ -z "${SHARED_SERVICES_ACCOUNT_ID}" ]; then
  echo "[TGW Prereqs] ERROR: Could not resolve Network or SharedServices account from ENV_MANIFEST."
  echo "[TGW Prereqs]   Network=${NETWORK_ACCOUNT_ID}"
  echo "[TGW Prereqs]   SharedServices=${SHARED_SERVICES_ACCOUNT_ID}"
  exit 1
fi

echo "[TGW Prereqs] Network account:         ${NETWORK_ACCOUNT_ID}"
echo "[TGW Prereqs] SharedServices account:  ${SHARED_SERVICES_ACCOUNT_ID}"

# ------------------------------------------------------------------
# Naming / tagging convention — tag-based idempotency
# ------------------------------------------------------------------
TAG_KEY="IntegTest"
TAG_VALUE="${acceleratorPrefix}-tgw-integ"
SSM_PREFIX="/accelerator"

TGW_NAME="main-tgw"
CORE_RT_NAME="core-rt"
SEGREGATED_RT_NAME="segregated-rt"
NETWORK_VPC_NAME="network-vpc"
NETWORK_VPC_CIDR="10.100.0.0/16"
NETWORK_SUBNET_CIDR="10.100.1.0/24"
NETWORK_VPC_ATTACH_NAME="network-vpc-attach"
NETWORK_VPN_NAME="network-vpn"
NETWORK_CGW_IP="203.0.113.12"    # RFC 5737 TEST-NET-3 — guaranteed non-routable
NETWORK_DXGW_NAME="network-dxgw"
NETWORK_DXGW_ASN="64512"
SHARED_DXGW_NAME="shared-dxgw"
SHARED_DXGW_ASN="64514"
SHARED_VPC_NAME="shared-vpc"
SHARED_VPC_CIDR="10.101.0.0/16"
SHARED_SUBNET_CIDR="10.101.1.0/24"
SHARED_VPC_ATTACH_NAME="shared-vpc-attach"
TEMPLATE_VPC_NAME="template-vpc"
TEMPLATE_NETWORK_VPC_CIDR="10.102.0.0/16"
TEMPLATE_NETWORK_SUBNET_CIDR="10.102.1.0/24"
TEMPLATE_SHARED_VPC_CIDR="10.103.0.0/16"
TEMPLATE_SHARED_SUBNET_CIDR="10.103.1.0/24"
TEMPLATE_VPC_ATTACH_NAME="template-vpc-attach"

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

# Assume into a target account; echoes AWS_ACCESS_KEY_ID / SECRET / TOKEN
# export lines for eval by caller. Exits non-zero on failure.
assume_role_exports() {
  local target_account_id="$1"
  local session_name="$2"
  local role_arn="arn:${partition}:iam::${target_account_id}:role/${crossAccountRoleName}"
  local creds
  creds=$(aws sts assume-role \
    --role-arn "${role_arn}" \
    --role-session-name "${session_name}" \
    --duration-seconds 3600 \
    --output json)
  echo "export AWS_ACCESS_KEY_ID=$(echo "${creds}" | jq -r '.Credentials.AccessKeyId')"
  echo "export AWS_SECRET_ACCESS_KEY=$(echo "${creds}" | jq -r '.Credentials.SecretAccessKey')"
  echo "export AWS_SESSION_TOKEN=$(echo "${creds}" | jq -r '.Credentials.SessionToken')"
}

clear_aws_creds() {
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
}

# Run a block of commands with credentials for the target account.
# Saves and restores the caller's credentials around the block.
with_account_creds() {
  local target_account_id="$1"
  local session_name="$2"
  shift 2
  local saved_key="${AWS_ACCESS_KEY_ID:-}"
  local saved_secret="${AWS_SECRET_ACCESS_KEY:-}"
  local saved_token="${AWS_SESSION_TOKEN:-}"
  eval "$(assume_role_exports "${target_account_id}" "${session_name}")"
  "$@"
  local rc=$?
  export AWS_ACCESS_KEY_ID="${saved_key}"
  export AWS_SECRET_ACCESS_KEY="${saved_secret}"
  export AWS_SESSION_TOKEN="${saved_token}"
  [ -z "${saved_key}" ] && unset AWS_ACCESS_KEY_ID || true
  [ -z "${saved_secret}" ] && unset AWS_SECRET_ACCESS_KEY || true
  [ -z "${saved_token}" ] && unset AWS_SESSION_TOKEN || true
  return ${rc}
}

# Find a resource by Name tag + IntegTest tag. Echoes the first matching ID, or empty.
# Usage: find_by_tags <resource-kind> <name-value> <query-path>
# e.g. find_by_tags "transit-gateway" "main-tgw" "TransitGateways[0].TransitGatewayId"
find_by_tags() {
  local resource_filter_name="$1"
  local name_value="$2"
  local query_path="$3"
  aws ec2 describe-"${resource_filter_name}" \
    --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=tag:Name,Values=${name_value}" \
    --region "${region}" \
    --query "${query_path}" --output text 2>/dev/null | head -1
}

# Put an SSM parameter. Overwrites idempotently.
# Usage: put_ssm_param <name> <value>
put_ssm_param() {
  local param_name="$1"
  local param_value="$2"
  aws ssm put-parameter \
    --name "${param_name}" \
    --value "${param_value}" \
    --type String \
    --overwrite \
    --region "${region}" > /dev/null
}

# Standard tag spec string for `aws ec2 create-*`.
# Usage: tag_spec <resource-type> <name-value>
tag_spec() {
  local resource_type="$1"
  local name_value="$2"
  echo "ResourceType=${resource_type},Tags=[{Key=${TAG_KEY},Value=${TAG_VALUE}},{Key=Name,Value=${name_value}}]"
}

# ------------------------------------------------------------------
# Assume into Network account and provision TGW + routing + attachments
# ------------------------------------------------------------------
echo ""
echo "[TGW Prereqs] --- Network account (${NETWORK_ACCOUNT_ID}) ---"
eval "$(assume_role_exports "${NETWORK_ACCOUNT_ID}" "tgw-prereqs-network")"

# Transit Gateway
TGW_ID=$(find_by_tags "transit-gateways" "${TGW_NAME}" "TransitGateways[?State!='deleted' && State!='deleting']|[0].TransitGatewayId")
if [ -z "${TGW_ID}" ] || [ "${TGW_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating Transit Gateway ${TGW_NAME}..."
  TGW_ID=$(aws ec2 create-transit-gateway \
    --description "${TGW_NAME} (integ test)" \
    --options "AmazonSideAsn=64513,AutoAcceptSharedAttachments=enable,DefaultRouteTableAssociation=disable,DefaultRouteTablePropagation=disable,DnsSupport=enable,VpnEcmpSupport=enable" \
    --tag-specifications "$(tag_spec transit-gateway "${TGW_NAME}")" \
    --region "${region}" \
    --query 'TransitGateway.TransitGatewayId' --output text)
  echo "[TGW Prereqs]   Waiting for TGW ${TGW_ID} to become available..."
  while true; do
    state=$(aws ec2 describe-transit-gateways --transit-gateway-ids "${TGW_ID}" \
      --region "${region}" --query 'TransitGateways[0].State' --output text)
    [ "${state}" = "available" ] && break
    sleep 15
  done
else
  echo "[TGW Prereqs]   TGW already exists: ${TGW_ID}"
fi

# Route tables
CORE_RT_ID=$(find_by_tags "transit-gateway-route-tables" "${CORE_RT_NAME}" "TransitGatewayRouteTables[?State!='deleted' && State!='deleting']|[0].TransitGatewayRouteTableId")
if [ -z "${CORE_RT_ID}" ] || [ "${CORE_RT_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating route table ${CORE_RT_NAME}..."
  CORE_RT_ID=$(aws ec2 create-transit-gateway-route-table \
    --transit-gateway-id "${TGW_ID}" \
    --tag-specifications "$(tag_spec transit-gateway-route-table "${CORE_RT_NAME}")" \
    --region "${region}" \
    --query 'TransitGatewayRouteTable.TransitGatewayRouteTableId' --output text)
else
  echo "[TGW Prereqs]   RT ${CORE_RT_NAME} already exists: ${CORE_RT_ID}"
fi

SEGREGATED_RT_ID=$(find_by_tags "transit-gateway-route-tables" "${SEGREGATED_RT_NAME}" "TransitGatewayRouteTables[?State!='deleted' && State!='deleting']|[0].TransitGatewayRouteTableId")
if [ -z "${SEGREGATED_RT_ID}" ] || [ "${SEGREGATED_RT_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating route table ${SEGREGATED_RT_NAME}..."
  SEGREGATED_RT_ID=$(aws ec2 create-transit-gateway-route-table \
    --transit-gateway-id "${TGW_ID}" \
    --tag-specifications "$(tag_spec transit-gateway-route-table "${SEGREGATED_RT_NAME}")" \
    --region "${region}" \
    --query 'TransitGatewayRouteTable.TransitGatewayRouteTableId' --output text)
else
  echo "[TGW Prereqs]   RT ${SEGREGATED_RT_NAME} already exists: ${SEGREGATED_RT_ID}"
fi

echo "[TGW Prereqs]   TGW:  ${TGW_ID}"
echo "[TGW Prereqs]   Core: ${CORE_RT_ID}"
echo "[TGW Prereqs]   Seg:  ${SEGREGATED_RT_ID}"

# VPC in Network
NETWORK_VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=tag:Name,Values=${NETWORK_VPC_NAME}" \
  --region "${region}" --query 'Vpcs[?State==`available`]|[0].VpcId' --output text 2>/dev/null | head -1)
if [ -z "${NETWORK_VPC_ID}" ] || [ "${NETWORK_VPC_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating VPC ${NETWORK_VPC_NAME}..."
  NETWORK_VPC_ID=$(aws ec2 create-vpc \
    --cidr-block "${NETWORK_VPC_CIDR}" \
    --tag-specifications "$(tag_spec vpc "${NETWORK_VPC_NAME}")" \
    --region "${region}" \
    --query 'Vpc.VpcId' --output text)
  aws ec2 wait vpc-available --vpc-ids "${NETWORK_VPC_ID}" --region "${region}"
else
  echo "[TGW Prereqs]   VPC ${NETWORK_VPC_NAME} already exists: ${NETWORK_VPC_ID}"
fi

# Subnet in Network VPC
NETWORK_SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=vpc-id,Values=${NETWORK_VPC_ID}" \
  --region "${region}" --query 'Subnets[0].SubnetId' --output text 2>/dev/null | head -1)
if [ -z "${NETWORK_SUBNET_ID}" ] || [ "${NETWORK_SUBNET_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating subnet for ${NETWORK_VPC_NAME}..."
  NETWORK_SUBNET_ID=$(aws ec2 create-subnet \
    --vpc-id "${NETWORK_VPC_ID}" \
    --cidr-block "${NETWORK_SUBNET_CIDR}" \
    --tag-specifications "$(tag_spec subnet "${NETWORK_VPC_NAME}-subnet")" \
    --region "${region}" \
    --query 'Subnet.SubnetId' --output text)
else
  echo "[TGW Prereqs]   Subnet already exists: ${NETWORK_SUBNET_ID}"
fi

# Network VPC attachment
NETWORK_VPC_ATTACH_ID=$(aws ec2 describe-transit-gateway-vpc-attachments \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=tag:Name,Values=${NETWORK_VPC_ATTACH_NAME}" \
    "Name=transit-gateway-id,Values=${TGW_ID}" \
  --region "${region}" \
  --query 'TransitGatewayVpcAttachments[?State!=`deleted` && State!=`deleting`]|[0].TransitGatewayAttachmentId' \
  --output text 2>/dev/null | head -1)
if [ -z "${NETWORK_VPC_ATTACH_ID}" ] || [ "${NETWORK_VPC_ATTACH_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating Network VPC attachment..."
  NETWORK_VPC_ATTACH_ID=$(aws ec2 create-transit-gateway-vpc-attachment \
    --transit-gateway-id "${TGW_ID}" \
    --vpc-id "${NETWORK_VPC_ID}" \
    --subnet-ids "${NETWORK_SUBNET_ID}" \
    --tag-specifications "$(tag_spec transit-gateway-attachment "${NETWORK_VPC_ATTACH_NAME}")" \
    --region "${region}" \
    --query 'TransitGatewayVpcAttachment.TransitGatewayAttachmentId' --output text)
  echo "[TGW Prereqs]   Waiting for attachment ${NETWORK_VPC_ATTACH_ID}..."
  while true; do
    state=$(aws ec2 describe-transit-gateway-vpc-attachments \
      --transit-gateway-attachment-ids "${NETWORK_VPC_ATTACH_ID}" \
      --region "${region}" \
      --query 'TransitGatewayVpcAttachments[0].State' --output text)
    [ "${state}" = "available" ] && break
    sleep 10
  done
else
  echo "[TGW Prereqs]   Network VPC attachment exists: ${NETWORK_VPC_ATTACH_ID}"
fi

# Network-side VPC template fixture: same VPC/attachment name as SharedServices,
# but physically separate resources in the Network account.
TEMPLATE_NETWORK_VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=tag:Name,Values=${TEMPLATE_VPC_NAME}" \
  --region "${region}" --query 'Vpcs[?State==`available`]|[0].VpcId' --output text 2>/dev/null | head -1)
if [ -z "${TEMPLATE_NETWORK_VPC_ID}" ] || [ "${TEMPLATE_NETWORK_VPC_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating Network template VPC ${TEMPLATE_VPC_NAME}..."
  TEMPLATE_NETWORK_VPC_ID=$(aws ec2 create-vpc \
    --cidr-block "${TEMPLATE_NETWORK_VPC_CIDR}" \
    --tag-specifications "$(tag_spec vpc "${TEMPLATE_VPC_NAME}")" \
    --region "${region}" \
    --query 'Vpc.VpcId' --output text)
  aws ec2 wait vpc-available --vpc-ids "${TEMPLATE_NETWORK_VPC_ID}" --region "${region}"
else
  echo "[TGW Prereqs]   Network template VPC ${TEMPLATE_VPC_NAME} already exists: ${TEMPLATE_NETWORK_VPC_ID}"
fi

TEMPLATE_NETWORK_SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=vpc-id,Values=${TEMPLATE_NETWORK_VPC_ID}" \
  --region "${region}" --query 'Subnets[0].SubnetId' --output text 2>/dev/null | head -1)
if [ -z "${TEMPLATE_NETWORK_SUBNET_ID}" ] || [ "${TEMPLATE_NETWORK_SUBNET_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating subnet for Network template VPC..."
  TEMPLATE_NETWORK_SUBNET_ID=$(aws ec2 create-subnet \
    --vpc-id "${TEMPLATE_NETWORK_VPC_ID}" \
    --cidr-block "${TEMPLATE_NETWORK_SUBNET_CIDR}" \
    --tag-specifications "$(tag_spec subnet "${TEMPLATE_VPC_NAME}-subnet")" \
    --region "${region}" \
    --query 'Subnet.SubnetId' --output text)
else
  echo "[TGW Prereqs]   Network template subnet already exists: ${TEMPLATE_NETWORK_SUBNET_ID}"
fi

TEMPLATE_NETWORK_VPC_ATTACH_ID=$(aws ec2 describe-transit-gateway-vpc-attachments \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=tag:Name,Values=${TEMPLATE_VPC_ATTACH_NAME}" \
    "Name=transit-gateway-id,Values=${TGW_ID}" \
  --region "${region}" \
  --query 'TransitGatewayVpcAttachments[?State!=`deleted` && State!=`deleting`]|[0].TransitGatewayAttachmentId' \
  --output text 2>/dev/null | head -1)
if [ -z "${TEMPLATE_NETWORK_VPC_ATTACH_ID}" ] || [ "${TEMPLATE_NETWORK_VPC_ATTACH_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating Network template VPC attachment..."
  TEMPLATE_NETWORK_VPC_ATTACH_ID=$(aws ec2 create-transit-gateway-vpc-attachment \
    --transit-gateway-id "${TGW_ID}" \
    --vpc-id "${TEMPLATE_NETWORK_VPC_ID}" \
    --subnet-ids "${TEMPLATE_NETWORK_SUBNET_ID}" \
    --tag-specifications "$(tag_spec transit-gateway-attachment "${TEMPLATE_VPC_ATTACH_NAME}")" \
    --region "${region}" \
    --query 'TransitGatewayVpcAttachment.TransitGatewayAttachmentId' --output text)
  echo "[TGW Prereqs]   Waiting for template attachment ${TEMPLATE_NETWORK_VPC_ATTACH_ID}..."
  while true; do
    state=$(aws ec2 describe-transit-gateway-vpc-attachments \
      --transit-gateway-attachment-ids "${TEMPLATE_NETWORK_VPC_ATTACH_ID}" \
      --region "${region}" \
      --query 'TransitGatewayVpcAttachments[0].State' --output text)
    [ "${state}" = "available" ] && break
    sleep 10
  done
else
  echo "[TGW Prereqs]   Network template VPC attachment exists: ${TEMPLATE_NETWORK_VPC_ATTACH_ID}"
fi

# Customer Gateway + VPN (dummy) + VPN TGW attachment discovery
NETWORK_CGW_NAME="network-cgw"
CGW_ID=$(aws ec2 describe-customer-gateways \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=tag:Name,Values=${NETWORK_CGW_NAME}" \
    "Name=state,Values=available" \
  --region "${region}" --query 'CustomerGateways[0].CustomerGatewayId' --output text 2>/dev/null | head -1)
if [ -z "${CGW_ID}" ] || [ "${CGW_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating Customer Gateway ${NETWORK_CGW_NAME}..."
  CGW_ID=$(aws ec2 create-customer-gateway \
    --bgp-asn 65000 \
    --public-ip "${NETWORK_CGW_IP}" \
    --type ipsec.1 \
    --tag-specifications "$(tag_spec customer-gateway "${NETWORK_CGW_NAME}")" \
    --region "${region}" \
    --query 'CustomerGateway.CustomerGatewayId' --output text)
else
  echo "[TGW Prereqs]   Customer Gateway exists: ${CGW_ID}"
fi

VPN_ID=$(aws ec2 describe-vpn-connections \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=tag:Name,Values=${NETWORK_VPN_NAME}" \
    "Name=state,Values=available,pending" \
  --region "${region}" --query 'VpnConnections[0].VpnConnectionId' --output text 2>/dev/null | head -1)
if [ -z "${VPN_ID}" ] || [ "${VPN_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating VPN Connection ${NETWORK_VPN_NAME}..."
  VPN_ID=$(aws ec2 create-vpn-connection \
    --customer-gateway-id "${CGW_ID}" \
    --transit-gateway-id "${TGW_ID}" \
    --type ipsec.1 \
    --options "{\"StaticRoutesOnly\":true}" \
    --tag-specifications "$(tag_spec vpn-connection "${NETWORK_VPN_NAME}")" \
    --region "${region}" \
    --query 'VpnConnection.VpnConnectionId' --output text)
else
  echo "[TGW Prereqs]   VPN Connection exists: ${VPN_ID}"
fi

# Discover VPN TGW attachment (VPN stays 'pending' indefinitely without real peer).
echo "[TGW Prereqs]   Discovering VPN TGW attachment for ${VPN_ID}..."
NETWORK_VPN_ATTACH_ID=""
for i in $(seq 1 30); do
  NETWORK_VPN_ATTACH_ID=$(aws ec2 describe-transit-gateway-attachments \
    --filters "Name=transit-gateway-id,Values=${TGW_ID}" \
      "Name=resource-type,Values=vpn" \
      "Name=resource-id,Values=${VPN_ID}" \
      "Name=state,Values=available,pending,initiating-request,initiatingRequest" \
    --region "${region}" \
    --query 'TransitGatewayAttachments[0].TransitGatewayAttachmentId' --output text 2>/dev/null | head -1)
  if [ -n "${NETWORK_VPN_ATTACH_ID}" ] && [ "${NETWORK_VPN_ATTACH_ID}" != "None" ]; then
    break
  fi
  sleep 10
done
if [ -z "${NETWORK_VPN_ATTACH_ID}" ] || [ "${NETWORK_VPN_ATTACH_ID}" = "None" ]; then
  echo "[TGW Prereqs]   WARN: VPN TGW attachment not yet visible after 5 min; continuing."
  NETWORK_VPN_ATTACH_ID=""
else
  echo "[TGW Prereqs]   VPN TGW attachment: ${NETWORK_VPN_ATTACH_ID}"
fi

# Direct Connect Gateway (owned by Network account)
NETWORK_DXGW_ID=$(aws directconnect describe-direct-connect-gateways \
  --region "${region}" \
  --query "directConnectGateways[?directConnectGatewayName=='${NETWORK_DXGW_NAME}' && directConnectGatewayState=='available']|[0].directConnectGatewayId" \
  --output text 2>/dev/null | head -1)
if [ -z "${NETWORK_DXGW_ID}" ] || [ "${NETWORK_DXGW_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating Direct Connect Gateway ${NETWORK_DXGW_NAME}..."
  NETWORK_DXGW_ID=$(aws directconnect create-direct-connect-gateway \
    --direct-connect-gateway-name "${NETWORK_DXGW_NAME}" \
    --amazon-side-asn "${NETWORK_DXGW_ASN}" \
    --region "${region}" \
    --query 'directConnectGateway.directConnectGatewayId' --output text)
else
  echo "[TGW Prereqs]   Direct Connect Gateway exists: ${NETWORK_DXGW_ID}"
fi

# RAM share of TGW to SharedServices
TGW_ARN="arn:${partition}:ec2:${region}:${NETWORK_ACCOUNT_ID}:transit-gateway/${TGW_ID}"
RAM_SHARE_NAME="${acceleratorPrefix}-tgw-integ-share"
RAM_SHARE_ARN=$(aws ram get-resource-shares \
  --resource-owner SELF \
  --tag-filters "tagKey=${TAG_KEY},tagValues=${TAG_VALUE}" \
  --region "${region}" \
  --query "resourceShares[?name=='${RAM_SHARE_NAME}' && status!='DELETED' && status!='DELETING']|[0].resourceShareArn" \
  --output text 2>/dev/null | head -1)
if [ -z "${RAM_SHARE_ARN}" ] || [ "${RAM_SHARE_ARN}" = "None" ]; then
  echo "[TGW Prereqs]   Creating RAM share ${RAM_SHARE_NAME}..."
  RAM_SHARE_ARN=$(aws ram create-resource-share \
    --name "${RAM_SHARE_NAME}" \
    --resource-arns "${TGW_ARN}" \
    --principals "${SHARED_SERVICES_ACCOUNT_ID}" \
    --allow-external-principals \
    --tags "key=${TAG_KEY},value=${TAG_VALUE}" "key=Name,value=${RAM_SHARE_NAME}" \
    --region "${region}" \
    --query 'resourceShare.resourceShareArn' --output text)
else
  echo "[TGW Prereqs]   RAM share exists: ${RAM_SHARE_ARN}"
fi

# Publish SSM parameters (canonical paths consumed by @aws-lza configureTgw)
echo "[TGW Prereqs]   Publishing SSM parameters under ${SSM_PREFIX}..."
put_ssm_param "${SSM_PREFIX}/network/transitGateways/${TGW_NAME}/id" "${TGW_ID}"
put_ssm_param "${SSM_PREFIX}/network/transitGateways/${TGW_NAME}/routeTables/${CORE_RT_NAME}/id" "${CORE_RT_ID}"
put_ssm_param "${SSM_PREFIX}/network/transitGateways/${TGW_NAME}/routeTables/${SEGREGATED_RT_NAME}/id" "${SEGREGATED_RT_ID}"
put_ssm_param "${SSM_PREFIX}/network/vpc/${NETWORK_VPC_NAME}/transitGatewayAttachment/${NETWORK_VPC_ATTACH_NAME}/id" "${NETWORK_VPC_ATTACH_ID}"
put_ssm_param "${SSM_PREFIX}/network/vpc/${TEMPLATE_VPC_NAME}/transitGatewayAttachment/${TEMPLATE_VPC_ATTACH_NAME}/id" "${TEMPLATE_NETWORK_VPC_ATTACH_ID}"
# VPN attachments are resolved by @aws-lza via EC2 Describe (tag:Name + tgw-id);
# publishing SSM copies for downstream tooling / debugging visibility only.
if [ -n "${NETWORK_VPN_ATTACH_ID}" ]; then
  put_ssm_param "${SSM_PREFIX}/network/customerGateways/${NETWORK_CGW_NAME}/vpnConnection/${NETWORK_VPN_NAME}/transitGatewayAttachmentId" "${NETWORK_VPN_ATTACH_ID}"
  put_ssm_param "${SSM_PREFIX}/network/vpn/${NETWORK_VPN_NAME}/transitGatewayAttachment/${NETWORK_VPN_NAME}/id" "${NETWORK_VPN_ATTACH_ID}"
fi
put_ssm_param "${SSM_PREFIX}/network/directConnectGateways/${NETWORK_DXGW_NAME}/id" "${NETWORK_DXGW_ID}"

clear_aws_creds

# ------------------------------------------------------------------
# Assume into SharedServices account and provision VPC + TGW attachment
# ------------------------------------------------------------------
echo ""
echo "[TGW Prereqs] --- SharedServices account (${SHARED_SERVICES_ACCOUNT_ID}) ---"
eval "$(assume_role_exports "${SHARED_SERVICES_ACCOUNT_ID}" "tgw-prereqs-shared")"

# Direct Connect Gateway (owned by SharedServices account)
SHARED_DXGW_ID=$(aws directconnect describe-direct-connect-gateways \
  --region "${region}" \
  --query "directConnectGateways[?directConnectGatewayName=='${SHARED_DXGW_NAME}' && directConnectGatewayState=='available']|[0].directConnectGatewayId" \
  --output text 2>/dev/null | head -1)
if [ -z "${SHARED_DXGW_ID}" ] || [ "${SHARED_DXGW_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating Direct Connect Gateway ${SHARED_DXGW_NAME}..."
  SHARED_DXGW_ID=$(aws directconnect create-direct-connect-gateway \
    --direct-connect-gateway-name "${SHARED_DXGW_NAME}" \
    --amazon-side-asn "${SHARED_DXGW_ASN}" \
    --region "${region}" \
    --query 'directConnectGateway.directConnectGatewayId' --output text)
else
  echo "[TGW Prereqs]   Direct Connect Gateway exists: ${SHARED_DXGW_ID}"
fi

# Accept any pending RAM invitation for our share
PENDING_INVITATION_ARN=$(aws ram get-resource-share-invitations \
  --region "${region}" \
  --query "resourceShareInvitations[?resourceShareName=='${RAM_SHARE_NAME}' && status=='PENDING']|[0].resourceShareInvitationArn" \
  --output text 2>/dev/null | head -1)
if [ -n "${PENDING_INVITATION_ARN}" ] && [ "${PENDING_INVITATION_ARN}" != "None" ]; then
  echo "[TGW Prereqs]   Accepting RAM invitation ${PENDING_INVITATION_ARN}..."
  aws ram accept-resource-share-invitation \
    --resource-share-invitation-arn "${PENDING_INVITATION_ARN}" \
    --region "${region}" > /dev/null
else
  echo "[TGW Prereqs]   No pending RAM invitation (already accepted or auto-accept)."
fi

# Shared VPC + subnet
SHARED_VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=tag:Name,Values=${SHARED_VPC_NAME}" \
  --region "${region}" --query 'Vpcs[?State==`available`]|[0].VpcId' --output text 2>/dev/null | head -1)
if [ -z "${SHARED_VPC_ID}" ] || [ "${SHARED_VPC_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating VPC ${SHARED_VPC_NAME}..."
  SHARED_VPC_ID=$(aws ec2 create-vpc \
    --cidr-block "${SHARED_VPC_CIDR}" \
    --tag-specifications "$(tag_spec vpc "${SHARED_VPC_NAME}")" \
    --region "${region}" \
    --query 'Vpc.VpcId' --output text)
  aws ec2 wait vpc-available --vpc-ids "${SHARED_VPC_ID}" --region "${region}"
else
  echo "[TGW Prereqs]   VPC ${SHARED_VPC_NAME} already exists: ${SHARED_VPC_ID}"
fi

SHARED_SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=vpc-id,Values=${SHARED_VPC_ID}" \
  --region "${region}" --query 'Subnets[0].SubnetId' --output text 2>/dev/null | head -1)
if [ -z "${SHARED_SUBNET_ID}" ] || [ "${SHARED_SUBNET_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating subnet for ${SHARED_VPC_NAME}..."
  SHARED_SUBNET_ID=$(aws ec2 create-subnet \
    --vpc-id "${SHARED_VPC_ID}" \
    --cidr-block "${SHARED_SUBNET_CIDR}" \
    --tag-specifications "$(tag_spec subnet "${SHARED_VPC_NAME}-subnet")" \
    --region "${region}" \
    --query 'Subnet.SubnetId' --output text)
else
  echo "[TGW Prereqs]   Subnet already exists: ${SHARED_SUBNET_ID}"
fi

# SharedServices VPC TGW attachment (to the RAM-shared TGW)
SHARED_VPC_ATTACH_ID=$(aws ec2 describe-transit-gateway-vpc-attachments \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=tag:Name,Values=${SHARED_VPC_ATTACH_NAME}" \
    "Name=transit-gateway-id,Values=${TGW_ID}" \
  --region "${region}" \
  --query 'TransitGatewayVpcAttachments[?State!=`deleted` && State!=`deleting`]|[0].TransitGatewayAttachmentId' \
  --output text 2>/dev/null | head -1)
if [ -z "${SHARED_VPC_ATTACH_ID}" ] || [ "${SHARED_VPC_ATTACH_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating SharedServices VPC attachment..."
  SHARED_VPC_ATTACH_ID=$(aws ec2 create-transit-gateway-vpc-attachment \
    --transit-gateway-id "${TGW_ID}" \
    --vpc-id "${SHARED_VPC_ID}" \
    --subnet-ids "${SHARED_SUBNET_ID}" \
    --tag-specifications "$(tag_spec transit-gateway-attachment "${SHARED_VPC_ATTACH_NAME}")" \
    --region "${region}" \
    --query 'TransitGatewayVpcAttachment.TransitGatewayAttachmentId' --output text)
  echo "[TGW Prereqs]   Waiting for attachment ${SHARED_VPC_ATTACH_ID}..."
  while true; do
    state=$(aws ec2 describe-transit-gateway-vpc-attachments \
      --transit-gateway-attachment-ids "${SHARED_VPC_ATTACH_ID}" \
      --region "${region}" \
      --query 'TransitGatewayVpcAttachments[0].State' --output text)
    [ "${state}" = "available" ] && break
    sleep 10
  done
else
  echo "[TGW Prereqs]   SharedServices VPC attachment exists: ${SHARED_VPC_ATTACH_ID}"
fi

# SharedServices-side VPC template fixture: same VPC/attachment name as Network,
# but physically separate resources in the SharedServices account.
TEMPLATE_SHARED_VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=tag:Name,Values=${TEMPLATE_VPC_NAME}" \
  --region "${region}" --query 'Vpcs[?State==`available`]|[0].VpcId' --output text 2>/dev/null | head -1)
if [ -z "${TEMPLATE_SHARED_VPC_ID}" ] || [ "${TEMPLATE_SHARED_VPC_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating SharedServices template VPC ${TEMPLATE_VPC_NAME}..."
  TEMPLATE_SHARED_VPC_ID=$(aws ec2 create-vpc \
    --cidr-block "${TEMPLATE_SHARED_VPC_CIDR}" \
    --tag-specifications "$(tag_spec vpc "${TEMPLATE_VPC_NAME}")" \
    --region "${region}" \
    --query 'Vpc.VpcId' --output text)
  aws ec2 wait vpc-available --vpc-ids "${TEMPLATE_SHARED_VPC_ID}" --region "${region}"
else
  echo "[TGW Prereqs]   SharedServices template VPC ${TEMPLATE_VPC_NAME} already exists: ${TEMPLATE_SHARED_VPC_ID}"
fi

TEMPLATE_SHARED_SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=vpc-id,Values=${TEMPLATE_SHARED_VPC_ID}" \
  --region "${region}" --query 'Subnets[0].SubnetId' --output text 2>/dev/null | head -1)
if [ -z "${TEMPLATE_SHARED_SUBNET_ID}" ] || [ "${TEMPLATE_SHARED_SUBNET_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating subnet for SharedServices template VPC..."
  TEMPLATE_SHARED_SUBNET_ID=$(aws ec2 create-subnet \
    --vpc-id "${TEMPLATE_SHARED_VPC_ID}" \
    --cidr-block "${TEMPLATE_SHARED_SUBNET_CIDR}" \
    --tag-specifications "$(tag_spec subnet "${TEMPLATE_VPC_NAME}-subnet")" \
    --region "${region}" \
    --query 'Subnet.SubnetId' --output text)
else
  echo "[TGW Prereqs]   SharedServices template subnet already exists: ${TEMPLATE_SHARED_SUBNET_ID}"
fi

TEMPLATE_SHARED_VPC_ATTACH_ID=$(aws ec2 describe-transit-gateway-vpc-attachments \
  --filters "Name=tag:${TAG_KEY},Values=${TAG_VALUE}" "Name=tag:Name,Values=${TEMPLATE_VPC_ATTACH_NAME}" \
    "Name=transit-gateway-id,Values=${TGW_ID}" \
  --region "${region}" \
  --query 'TransitGatewayVpcAttachments[?State!=`deleted` && State!=`deleting`]|[0].TransitGatewayAttachmentId' \
  --output text 2>/dev/null | head -1)
if [ -z "${TEMPLATE_SHARED_VPC_ATTACH_ID}" ] || [ "${TEMPLATE_SHARED_VPC_ATTACH_ID}" = "None" ]; then
  echo "[TGW Prereqs]   Creating SharedServices template VPC attachment..."
  TEMPLATE_SHARED_VPC_ATTACH_ID=$(aws ec2 create-transit-gateway-vpc-attachment \
    --transit-gateway-id "${TGW_ID}" \
    --vpc-id "${TEMPLATE_SHARED_VPC_ID}" \
    --subnet-ids "${TEMPLATE_SHARED_SUBNET_ID}" \
    --tag-specifications "$(tag_spec transit-gateway-attachment "${TEMPLATE_VPC_ATTACH_NAME}")" \
    --region "${region}" \
    --query 'TransitGatewayVpcAttachment.TransitGatewayAttachmentId' --output text)
  echo "[TGW Prereqs]   Waiting for template attachment ${TEMPLATE_SHARED_VPC_ATTACH_ID}..."
  while true; do
    state=$(aws ec2 describe-transit-gateway-vpc-attachments \
      --transit-gateway-attachment-ids "${TEMPLATE_SHARED_VPC_ATTACH_ID}" \
      --region "${region}" \
      --query 'TransitGatewayVpcAttachments[0].State' --output text)
    [ "${state}" = "available" ] && break
    sleep 10
  done
else
  echo "[TGW Prereqs]   SharedServices template VPC attachment exists: ${TEMPLATE_SHARED_VPC_ATTACH_ID}"
fi

# SSM parameter for SharedServices attachment
put_ssm_param "${SSM_PREFIX}/network/vpc/${SHARED_VPC_NAME}/transitGatewayAttachment/${SHARED_VPC_ATTACH_NAME}/id" "${SHARED_VPC_ATTACH_ID}"
put_ssm_param "${SSM_PREFIX}/network/vpc/${TEMPLATE_VPC_NAME}/transitGatewayAttachment/${TEMPLATE_VPC_ATTACH_NAME}/id" "${TEMPLATE_SHARED_VPC_ATTACH_ID}"

# SSM parameter for DX Gateway (owned by SharedServices)
put_ssm_param "${SSM_PREFIX}/network/directConnectGateways/${SHARED_DXGW_NAME}/id" "${SHARED_DXGW_ID}"

clear_aws_creds

# ------------------------------------------------------------------
# Append env exports for downstream tooling / tests
# ------------------------------------------------------------------
if [ -n "${DOTENV_FILE:-}" ]; then
  echo "[TGW Prereqs] Appending exports to ${DOTENV_FILE}..."
  {
    echo "TGW_INTEG_SSM_PREFIX=${SSM_PREFIX}"
    echo "TGW_INTEG_NETWORK_ACCOUNT_ID=${NETWORK_ACCOUNT_ID}"
    echo "TGW_INTEG_SHARED_SERVICES_ACCOUNT_ID=${SHARED_SERVICES_ACCOUNT_ID}"
    echo "TGW_INTEG_HOME_REGION=${region}"
  } >> "${DOTENV_FILE}"
else
  echo "[TGW Prereqs] DOTENV_FILE not set; skipping env export."
fi

echo ""
echo "[TGW Prereqs] ============================================"
echo "[TGW Prereqs] Baseline deployment complete."
echo "[TGW Prereqs]   TGW:                  ${TGW_ID}"
echo "[TGW Prereqs]   Core RT:              ${CORE_RT_ID}"
echo "[TGW Prereqs]   Segregated RT:        ${SEGREGATED_RT_ID}"
echo "[TGW Prereqs]   Network VPC attach:   ${NETWORK_VPC_ATTACH_ID}"
echo "[TGW Prereqs]   Network template attach:${TEMPLATE_NETWORK_VPC_ATTACH_ID}"
echo "[TGW Prereqs]   Network VPN attach:   ${NETWORK_VPN_ATTACH_ID:-<pending>}"
echo "[TGW Prereqs]   Network DX Gateway:   ${NETWORK_DXGW_ID}"
echo "[TGW Prereqs]   Shared DX Gateway:    ${SHARED_DXGW_ID}"
echo "[TGW Prereqs]   RAM share:            ${RAM_SHARE_ARN}"
echo "[TGW Prereqs]   Shared VPC attach:    ${SHARED_VPC_ATTACH_ID}"
echo "[TGW Prereqs]   Shared template attach:${TEMPLATE_SHARED_VPC_ATTACH_ID}"
echo "[TGW Prereqs] ============================================"
