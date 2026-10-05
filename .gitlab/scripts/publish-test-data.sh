#!/usr/bin/env bash
# Publish one component's test result to the Mission Control S3 bucket.
# Reads this job's JUnit report, derives pass/fail, and uploads a small JSON.
# Always exits 0 so a publish issue never fails the test job.
#
# Env: MC_DATA_BUCKET, MC_TEST_TYPE (unit|integration|e2e|cats), MC_COMPONENT,
#      AWS_DEFAULT_REGION, MC_TESTDATA_ROLE_ARN (assumed for non-unit types).
# Optional: MC_REPORT_GLOB, MC_MANIFEST, MC_PARTITION, MC_REGION, MC_PRODUCT, MC_REPO.
set +e   # never fail the parent job

log() { echo "[mc-publish] $*"; }

# --- master switch: only publish when explicitly enabled ---------------------
# Set PUBLISH_TEST_DATA=yes (CI/CD variable) on repos that should publish to MC.
# Unset/no (e.g. forks) => skip immediately: no CLI install, no assume, no noise.
if [ "${PUBLISH_TEST_DATA:-no}" != "yes" ]; then
  log "PUBLISH_TEST_DATA not 'yes' — skip"; exit 0
fi

# --- guard rails: bail (exit 0) if essential inputs are missing ---------------
if [ -z "${MC_DATA_BUCKET:-}" ]; then log "MC_DATA_BUCKET not set — skip"; exit 0; fi
if [ -z "${MC_TEST_TYPE:-}" ];   then log "MC_TEST_TYPE not set — skip";   exit 0; fi
if [ -z "${MC_COMPONENT:-}" ];   then log "MC_COMPONENT not set — skip";   exit 0; fi

# --- ensure dependencies (node:24 ships neither aws CLI nor python3) ----------
if ! command -v python3 >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq python3 >/dev/null 2>&1
fi
if ! command -v aws >/dev/null 2>&1; then
  log "installing AWS CLI…"
  wget --progress=dot:mega -O /tmp/awscliv2.zip https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip >/dev/null 2>&1
  unzip -q /tmp/awscliv2.zip -d /tmp >/dev/null 2>&1
  /tmp/aws/install >/dev/null 2>&1
fi
if ! command -v aws >/dev/null 2>&1; then log "aws CLI unavailable — skip"; exit 0; fi
if ! command -v python3 >/dev/null 2>&1; then log "python3 unavailable — skip"; exit 0; fi

# --- integ/e2e/cats run as the LZA admin role; switch to the MC writer role ---
# (unit jobs vend MC_TESTDATA_ROLE_ARN directly, so no switch needed there).
if [ "${MC_TEST_TYPE}" != "unit" ] && [ -n "${MC_TESTDATA_ROLE_ARN:-}" ]; then
  if command -v jq >/dev/null 2>&1; then
    log "assuming MC role ${MC_TESTDATA_ROLE_ARN}"
    assume_err="$(mktemp)"
    creds="$(aws sts assume-role --role-arn "$MC_TESTDATA_ROLE_ARN" \
              --role-session-name mc-publish --query Credentials --output json 2>"$assume_err")"
    if [ -n "$creds" ] && [ "$creds" != "null" ]; then
      AWS_ACCESS_KEY_ID="$(echo "$creds" | jq -r .AccessKeyId)"
      AWS_SECRET_ACCESS_KEY="$(echo "$creds" | jq -r .SecretAccessKey)"
      AWS_SESSION_TOKEN="$(echo "$creds" | jq -r .SessionToken)"
      export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
      log "assumed MC writer role for upload"
    else
      log "could not assume MC role: $(tr -d '\n' < "$assume_err")"
    fi
    rm -f "$assume_err"
  else
    log "jq missing — cannot switch role; will try with existing creds"
  fi
fi

# ----------------------------- context ---------------------------------------
PRODUCT="${MC_PRODUCT:-lza1}"
REPO="${MC_REPO:-${CI_PROJECT_NAME:-landing-zone-accelerator-on-aws}}"
COMMIT="${CI_COMMIT_SHORT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
PARTITION="${MC_PARTITION:-commercial}"
REGION="${MC_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
CI_URL="${CI_PIPELINE_URL:-}"
# Optional commit metadata (shown by the dashboard when present).
COMMIT_MSG="${CI_COMMIT_MESSAGE:-}"
COMMIT_AUTHOR="${CI_COMMIT_AUTHOR:-}"
COMMIT_URL=""
if [ -n "${CI_PROJECT_URL:-}" ] && [ -n "${CI_COMMIT_SHA:-}" ]; then
  COMMIT_URL="${CI_PROJECT_URL}/-/commit/${CI_COMMIT_SHA}"
fi

NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"          # this job's own executedAt
# Run key must be STABLE across all jobs in the same pipeline (they run in
# parallel at slightly different seconds). Use the pipeline creation time, not
# wall-clock, so every component lands under the SAME <ts>__<commit> folder.
RUN_ISO="${CI_PIPELINE_CREATED_AT:-$NOW_ISO}"
# Normalize any ISO-8601 form (with/without fractional secs or tz) to the
# compact sortable key YYYYMMDDThhmmssZ. Keep digits+T only, take the first 15
# chars (YYYYMMDDThhmmss), then append Z.
TS_KEY="$(printf '%s' "$RUN_ISO" | tr -cd '0-9T' | cut -c1-15)Z"  # -> 20260911T000500Z
if [ -n "${CI_COMMIT_TAG:-}" ]; then
  CHANNEL="releases"
  KEY="${CI_COMMIT_TAG}"
else
  # <channel> is a single S3 path segment — branch names may contain '/'
  # (e.g. feature/foo, user/branch), so flatten any '/' to '-'.
  CHANNEL="$(printf '%s' "${CI_COMMIT_REF_NAME:-integ}" | tr '/' '-')"
  KEY="${TS_KEY}__${COMMIT}"
fi

# --- default report glob per type ---------------------------------------------
DEFAULT_UNIT_GLOB="source/packages/**/${MC_COMPONENT}/test-reports/*.xml"
DEFAULT_INTEG_GLOB="source/packages/@aws-accelerator/accelerator/test-reports/*.xml"
if [ "$MC_TEST_TYPE" = "unit" ]; then
  REPORT_GLOB="${MC_REPORT_GLOB:-$DEFAULT_UNIT_GLOB}"
else
  REPORT_GLOB="${MC_REPORT_GLOB:-$DEFAULT_INTEG_GLOB}"
fi

# --- coverage report (unit only): vitest json-summary reporter output ---------
# coverage/coverage-summary.json in the package dir. Override with MC_COVERAGE_GLOB.
COVERAGE_GLOB="${MC_COVERAGE_GLOB:-source/packages/**/${MC_COMPONENT}/coverage/coverage-summary.json}"

# --- S3 key for this component (Hive-partitioned layout) ----------------------
# Uniform key=value segments (matches the metrics-lake layout: Athena/Glue get
# partition projection with no crawler). Ordering: run= BEFORE component= so all
# components of one run group together (needed for per-run aggregation).
#   unit:     product=/repo=/test_type=/dt=/channel=/run=/component=/test_result.json
#   non-unit: product=/repo=/test_type=/dt=/channel=/run=/aws_partition=/region=/component=/test_result.json
# NOTE: the segment is aws_partition (not partition) — 'partition' is a reserved
# word in Athena/Presto, so a column literally named 'partition' needs quoting
# in every query. aws_partition avoids that friction.
DT="$(printf '%s' "$RUN_ISO" | tr -cd '0-9' | cut -c1-8)"   # YYYYMMDD from run time
DT="${DT:0:4}-${DT:4:2}-${DT:6:2}"                           # -> YYYY-MM-DD
BASE="test-data/product=${PRODUCT}/repo=${REPO}/test_type=${MC_TEST_TYPE}/dt=${DT}/channel=${CHANNEL}/run=${KEY}"
if [ "$MC_TEST_TYPE" = "unit" ]; then
  S3_KEY="${BASE}/component=${MC_COMPONENT}/test_result.json"
else
  S3_KEY="${BASE}/aws_partition=${PARTITION}/region=${REGION}/component=${MC_COMPONENT}/test_result.json"
fi

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

log "type=$MC_TEST_TYPE component=$MC_COMPONENT channel=$CHANNEL key=$KEY glob=$REPORT_GLOB"

# --- build the JSON (parse JUnit, derive status) ------------------------------
# SECURITY: the heredoc delimiter is single-quoted ('PY') so the shell performs NO
# expansion inside the Python source. Every dynamic value (including branch-derived
# values like CHANNEL) is passed through the environment and read with os.environ,
# so a hostile value cannot break out of a string literal and execute as Python.
MC_REPO_FALLBACK="$REPO" \
MC_CHANNEL="$CHANNEL" \
MC_COMMIT="$COMMIT" \
MC_EXECUTED_AT="$NOW_ISO" \
MC_CI_URL="$CI_URL" \
MC_PARTITION="$PARTITION" \
MC_REGION="$REGION" \
MC_REPORT_GLOB="$REPORT_GLOB" \
MC_COVERAGE_GLOB="$COVERAGE_GLOB" \
MC_COMMIT_URL="$COMMIT_URL" \
python3 - "$OUT" <<'PY'
import glob, json, os, sys
import xml.etree.ElementTree as ET

out          = sys.argv[1]
product      = os.environ.get("MC_PRODUCT", "lza1")
repo         = os.environ["MC_REPO"] if os.environ.get("MC_REPO") else os.environ.get("MC_REPO_FALLBACK", "")
channel      = os.environ.get("MC_CHANNEL", "")
commit       = os.environ.get("MC_COMMIT", "")
ttype        = os.environ["MC_TEST_TYPE"]
component    = os.environ["MC_COMPONENT"]
executed_at  = os.environ.get("MC_EXECUTED_AT", "")
ci_url       = os.environ.get("MC_CI_URL", "")
partition    = os.environ.get("MC_PARTITION", "")
region       = os.environ.get("MC_REGION", "")
report_glob  = os.environ.get("MC_REPORT_GLOB", "")
manifest     = os.environ.get("MC_MANIFEST", "")
coverage_glob = os.environ.get("MC_COVERAGE_GLOB", "")
# Commit metadata read from env (avoids quoting issues with messages).
commit_msg    = (os.environ.get("CI_COMMIT_MESSAGE", "") or "").strip().splitlines()[0] if os.environ.get("CI_COMMIT_MESSAGE") else ""
commit_author = os.environ.get("CI_COMMIT_AUTHOR", "")
commit_url    = os.environ.get("MC_COMMIT_URL", "")

total = failed = 0
found = False
for f in glob.glob(report_glob, recursive=True):
    try:
        root = ET.parse(f).getroot()
    except Exception:
        continue
    found = True
    suites = [root] if root.tag == "testsuite" else root.iter("testsuite")
    for s in suites:
        total  += int(s.get("tests", 0) or 0)
        failed += int(s.get("failures", 0) or 0) + int(s.get("errors", 0) or 0)

if not found or total == 0:
    print("NO_REPORT")   # nothing to report for this component — skip
    sys.exit(0)

status = "fail" if failed > 0 else "pass"
doc = {
    "product": product, "repo": repo, "channel": channel, "commit": commit,
    "test_type": ttype, "status": status, "executedAt": executed_at,
    "summary": {"total": total, "passed": total - failed, "failed": failed},
}
if ci_url:
    doc["ciUrl"] = ci_url
if commit_msg:
    doc["commitMessage"] = commit_msg
if commit_author:
    doc["commitAuthor"] = commit_author
if commit_url:
    doc["commitUrl"] = commit_url

details = {}
if ttype == "unit":
    # Coverage: parse vitest/istanbul coverage-summary.json if present.
    # Shape: { "total": {lines/statements/functions/branches: {pct}}, "<file>": {...} }
    cov_file = ""
    for f in glob.glob(coverage_glob, recursive=True):
        cov_file = f
        break
    if cov_file and os.path.isfile(cov_file):
        try:
            cov = json.load(open(cov_file))
            tot = cov.get("total", {})
            def pct(node, key):
                v = (node.get(key) or {}).get("pct")
                return round(v, 1) if isinstance(v, (int, float)) else None
            # Package-level rollup (lines %) drives summary.coverage.
            if pct(tot, "lines") is not None:
                doc["summary"]["coverage"] = pct(tot, "lines")
            files = []
            for path, node in cov.items():
                if path == "total" or not isinstance(node, dict):
                    continue
                # Trim absolute CI paths to a readable relative path.
                rel = path
                marker = "/" + component + "/"
                if marker in rel:
                    rel = rel.split(marker, 1)[1]
                elif "/source/" in rel:
                    rel = "source/" + rel.split("/source/", 1)[1]
                files.append({
                    "path": rel,
                    "statements": pct(node, "statements"),
                    "branches": pct(node, "branches"),
                    "functions": pct(node, "functions"),
                    "lines": pct(node, "lines"),
                })
            files.sort(key=lambda r: r["path"])
            if files:
                details["files"] = files
        except Exception:
            pass
else:
    # Integration: embed scenario descriptions from the manifest if present.
    # aws_partition (not 'partition') — reserved word in Athena/Presto.
    doc["aws_partition"] = partition
    doc["region"] = region
    if manifest and os.path.isfile(manifest):
        try:
            m = json.load(open(manifest))
            scen = m.get("scenarios", m if isinstance(m, list) else [])
            if isinstance(m, dict) and m.get("displayName"):
                details["displayName"] = m["displayName"]
            details["scenarios"] = [
                {"description": s.get("description") or s.get("name", "")}
                for s in scen if isinstance(s, dict)
            ]
        except Exception:
            pass
doc["details"] = details

with open(out, "w") as fh:
    json.dump(doc, fh, indent=2)
print("WROTE")
PY

if [ ! -s "$OUT" ]; then
  log "no report for '$MC_COMPONENT' ($REPORT_GLOB) — nothing to publish"
  exit 0
fi

# --- upload -------------------------------------------------------------------
if aws s3 cp "$OUT" "s3://${MC_DATA_BUCKET}/${S3_KEY}" \
     --content-type application/json --cache-control no-cache >/dev/null 2>&1; then
  log "uploaded s3://${MC_DATA_BUCKET}/${S3_KEY}"
else
  log "upload failed (ignored) for ${S3_KEY}"
fi

exit 0
