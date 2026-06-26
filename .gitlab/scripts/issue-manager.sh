#!/bin/bash
set -e

DRY_RUN="${DRY_RUN:-false}"
FINDINGS_FILE="filtered-findings.json"
GITLAB_API="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}"
SCAN_DATE=$(date -u +"%Y-%m-%d")

if [ "$DRY_RUN" = "true" ]; then
  echo "=== DRY RUN MODE — no issues created or modified ==="
fi

gitlab_api() {
  local response http_code
  response=$(curl -s -w '\n%{http_code}' --header "PRIVATE-TOKEN: ${VULN_SCAN_TOKEN}" "$@")
  http_code=$(echo "$response" | tail -1)
  response=$(echo "$response" | sed '$d')
  if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
    echo "ERROR: GitLab API returned HTTP ${http_code}: $(echo "$response" | head -c 200)" >&2
    return 1
  fi
  echo "$response"
}

add_scan_comment() {
  local issue_iid=$1 pkg=$2 versions=$3 fixed_ver=$4 severity=$5 suffix=${6:+" $6"}

  local body="Still present in daily vulnerability scan on **${SCAN_DATE}**${suffix}

- Package: \`${pkg}\`
- Affected Versions: \`${versions}\`
- Fixed Version: \`${fixed_ver}\`
- Severity: **${severity}**"

  if [ "$DRY_RUN" = "true" ]; then
    echo "  [DRY RUN] Would add comment to #${issue_iid}"
    return 0
  fi

  gitlab_api --request POST \
    --header "Content-Type: application/json" \
    --data "$(jq -n --arg body "$body" '{body: $body}')" \
    "${GITLAB_API}/issues/${issue_iid}/notes" > /dev/null
}

VULN_ASSIGNEE="${VULN_ASSIGNEE:-}"
ASSIGNEE_ID=""
if [ "$DRY_RUN" = "true" ] && [ -z "$VULN_ASSIGNEE" ]; then
  echo "DRY RUN: skipping assignee resolution"
elif [ -z "$VULN_ASSIGNEE" ]; then
  echo "ERROR: VULN_ASSIGNEE CI variable must be set" >&2
  exit 1
else
  ASSIGNEE_ID=$(gitlab_api \
    "${GITLAB_API}/members/all?query=${VULN_ASSIGNEE}" | jq -r --arg u "$VULN_ASSIGNEE" '.[] | select(.username == $u) | .id // empty' | head -1)

  if [ -n "$ASSIGNEE_ID" ]; then
    echo "Resolved assignee: ${VULN_ASSIGNEE} -> user ID ${ASSIGNEE_ID}"
  else
    echo "WARNING: Could not resolve user ${VULN_ASSIGNEE}, issues will be unassigned"
  fi
fi

if [ ! -f "$FINDINGS_FILE" ]; then
  echo "No findings file found"
  exit 0
fi

TOTAL_FINDINGS=$(jq 'length' "$FINDINGS_FILE")
echo "Processing $TOTAL_FINDINGS unique CVE+Package combinations..."

if [ "$TOTAL_FINDINGS" -eq 0 ]; then
  echo "No active vulnerabilities found"
fi

echo "Fetching all open CVE issues for deduplication..."
ALL_OPEN_CVE_ISSUES="[]"
PAGE=1
while true; do
  PAGE_RESULT=$(gitlab_api "${GITLAB_API}/issues?labels=CVE&state=opened&per_page=100&page=$PAGE") || {
    echo "ERROR: Failed to fetch issues (page $PAGE)" >&2
    break
  }
  PAGE_COUNT=$(echo "$PAGE_RESULT" | jq -r 'length // 0')
  [ "$PAGE_COUNT" -eq 0 ] && break
  ALL_OPEN_CVE_ISSUES=$(echo "$ALL_OPEN_CVE_ISSUES" "$PAGE_RESULT" | jq -s '.[0] + .[1]')
  [ "$PAGE_COUNT" -lt 100 ] && break
  PAGE=$((PAGE + 1))
done
echo "  Found $(echo "$ALL_OPEN_CVE_ISSUES" | jq 'length') open CVE issues"
if [ "$PAGE_COUNT" -ge 100 ] && [ "$PAGE_COUNT" -ne 0 ]; then
  echo "  WARNING: Issue fetch may be incomplete — deduplication could miss existing issues" >&2
fi

# Helper: find existing open issue by CVE+Package using contains() match on title
# Uses "$pkg:" to avoid false-positive prefix matches (e.g. "foo" matching "foobar")
find_existing_issue() {
  local cve="$1" pkg="$2"
  echo "$ALL_OPEN_CVE_ISSUES" | jq -r --arg cve "$cve" --arg pkg "$pkg" \
    '[.[] | select(.title | contains($cve) and contains($pkg + ":"))] | first | .iid // empty'
}

# Process each unique CVE+Package combination
jq -c '.[]' "$FINDINGS_FILE" | while read -r vuln; do
  CVE_ID=$(echo "$vuln" | jq -r '.cve')
  PKG_NAME=$(echo "$vuln" | jq -r '.package')
  SEVERITY=$(echo "$vuln" | jq -r '.severity')
  TITLE=$(echo "$vuln" | jq -r '.title')
  FIXED_VER=$(echo "$vuln" | jq -r '.fixedVersion // "N/A"')
  VERSIONS=$(echo "$vuln" | jq -r '.versions | join(", ")')

  echo "Processing: $CVE_ID - $PKG_NAME"

  # Search for existing open issue with this CVE+Package
  EXISTING_ISSUE=$(find_existing_issue "$CVE_ID" "$PKG_NAME")

  if [ -n "$EXISTING_ISSUE" ]; then
    echo "  Found existing issue #$EXISTING_ISSUE, adding comment..."
    add_scan_comment "$EXISTING_ISSUE" "$PKG_NAME" "$VERSIONS" "$FIXED_VER" "$SEVERITY"
    echo "  Updated issue #$EXISTING_ISSUE"
  else
    echo "  Creating new issue..."
    CLEAN_TITLE=$(echo "$TITLE" | sed "s|^${PKG_NAME}: ||g; s|^${PKG_NAME}: ||g")
    ISSUE_TITLE="[${SEVERITY}] ${CVE_ID} - ${PKG_NAME}: ${CLEAN_TITLE}"
    ISSUE_DESC="| Field | Value |
|-------|-------|
| **CVE** | \`${CVE_ID}\` |
| **Package** | \`${PKG_NAME}\` |
| **Severity** | ${SEVERITY} |
| **Affected Versions** | ${VERSIONS} |
| **Fixed Version** | \`${FIXED_VER}\` |

### Description
${CLEAN_TITLE}

### Remediation
Update \`${PKG_NAME}\` to version \`${FIXED_VER}\` or later.

---
_Detected by daily vulnerability scan on ${SCAN_DATE} · [Pipeline](${CI_PIPELINE_URL:-})_"

    if [ "$DRY_RUN" = "true" ]; then
      echo "  [DRY RUN] Would create issue: $ISSUE_TITLE"
    else
    CREATE_RESPONSE=$(gitlab_api --request POST \
      --header "Content-Type: application/json" \
      --data "$(jq -n \
        --arg title "$ISSUE_TITLE" \
        --arg desc "$ISSUE_DESC" \
        '{title: $title, description: $desc, labels: ["CVE", "automated"]} | if $aid != "" then .assignee_ids = [($aid | tonumber)] else . end' \
        --arg aid "${ASSIGNEE_ID:-}")" \
      "${GITLAB_API}/issues")

    if echo "$CREATE_RESPONSE" | jq -e '.iid' > /dev/null 2>&1; then
      echo "  Created issue #$(echo "$CREATE_RESPONSE" | jq -r '.iid')"
    else
      echo "  ERROR creating issue: $(echo "$CREATE_RESPONSE" | head -c 300)"
    fi
    fi
  fi
done

echo "Issue management complete"

# Process masked findings
MASKED_FILE="masked-findings.json"
if [ -f "$MASKED_FILE" ] && [ "$(jq 'length' "$MASKED_FILE")" -gt 0 ]; then
  echo "Processing $(jq 'length' "$MASKED_FILE") masked vulnerabilities..."

  jq -c '.[]' "$MASKED_FILE" | while read -r vuln; do
    CVE_ID=$(echo "$vuln" | jq -r '.cve')
    PKG_NAME=$(echo "$vuln" | jq -r '.package')
    SEVERITY=$(echo "$vuln" | jq -r '.severity')
    TITLE=$(echo "$vuln" | jq -r '.title')
    FIXED_VER=$(echo "$vuln" | jq -r '.fixedVersion // "N/A"')
    VERSIONS=$(echo "$vuln" | jq -r '.versions | join(", ")')

    echo "Processing masked: $CVE_ID - $PKG_NAME"

    EXISTING_ISSUE=$(find_existing_issue "$CVE_ID" "$PKG_NAME")

    if [ -n "$EXISTING_ISSUE" ]; then
      echo "  Found existing issue #$EXISTING_ISSUE, adding comment..."
      add_scan_comment "$EXISTING_ISSUE" "$PKG_NAME" "$VERSIONS" "$FIXED_VER" "$SEVERITY" "(masked by yarn resolution)"
      echo "  Updated issue #$EXISTING_ISSUE"
    else
      echo "  Creating masked vulnerability issue..."
      CLEAN_TITLE=$(echo "$TITLE" | sed "s|^${PKG_NAME}: ||g; s|^${PKG_NAME}: ||g")
      ISSUE_TITLE="[${SEVERITY}] ${CVE_ID} - ${PKG_NAME}: ${CLEAN_TITLE}"
      ISSUE_DESC="| Field | Value |
|-------|-------|
| **CVE** | \`${CVE_ID}\` |
| **Package** | \`${PKG_NAME}\` |
| **Severity** | ${SEVERITY} |
| **Affected Versions** | ${VERSIONS} |
| **Fixed Version** | \`${FIXED_VER}\` |

> **WARNING: Masked by yarn resolution** — this vulnerability is not present in the current lockfile because a \`resolutions\` override in \`package.json\` forces a different version. It will resurface if the resolution is removed or becomes incompatible.

### Description
${CLEAN_TITLE}

### Remediation
Ensure the upstream dependency updates \`${PKG_NAME}\` to version \`${FIXED_VER}\` or later so the resolution can be safely removed.

---
_Detected by daily vulnerability scan (no-resolutions delta) on ${SCAN_DATE} · [Pipeline](${CI_PIPELINE_URL:-})_"

      if [ "$DRY_RUN" = "true" ]; then
        echo "  [DRY RUN] Would create masked issue: $ISSUE_TITLE"
      else
      CREATE_RESPONSE=$(gitlab_api --request POST \
        --header "Content-Type: application/json" \
        --data "$(jq -n \
          --arg title "$ISSUE_TITLE" \
          --arg desc "$ISSUE_DESC" \
          '{title: $title, description: $desc, labels: ["CVE", "masked", "automated"]} | if $aid != "" then .assignee_ids = [($aid | tonumber)] else . end' \
          --arg aid "${ASSIGNEE_ID:-}")" \
        "${GITLAB_API}/issues")

      if echo "$CREATE_RESPONSE" | jq -e '.iid' > /dev/null 2>&1; then
        echo "  Created issue #$(echo "$CREATE_RESPONSE" | jq -r '.iid')"
      else
        echo "  ERROR creating issue: $(echo "$CREATE_RESPONSE" | head -c 300)"
      fi
      fi
    fi
  done
fi

echo "All issue processing complete"
