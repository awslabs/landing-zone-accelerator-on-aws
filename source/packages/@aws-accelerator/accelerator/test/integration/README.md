# Module Integration Tests

Integration tests that exercise LZA modules against real AWS accounts. Each test calls the module handler directly (e.g., `AmazonMacie.configure()`) — not the full accelerator pipeline — providing fast, isolated validation of individual module behavior.

## How It Works

Each module defines **manifests** — JSON files describing a configuration variation to test. The framework executes them serially through a four-phase lifecycle:

```
PREPARE → EXECUTE → ASSERT → CLEANUP
```

- **Prepare** — Set up any pre-conditions in the target account
- **Execute** — Call the module handler with the manifest's configuration
- **Assert** — Verify AWS state matches expectations (API calls + DynamoDB state table)
- **Cleanup** — Reset state for the next manifest

## Project Structure

```
test/integration/
├── framework/                    # Shared test infrastructure
│   ├── types.ts                  # Core interfaces (TestManifest, ModuleTestPlugin, etc.)
│   ├── runner.ts                 # Serial manifest executor with lifecycle management
│   ├── test-environment.ts       # Builds ResolvedEnvironment from CI variables
│   ├── account-resolver.ts       # Maps logical account names → account IDs
│   ├── manifest-loader.ts        # Discovers and validates *.manifest.json files
│   ├── state-table-assertion.ts  # Shared DynamoDB state table verification
│   ├── base-params-builder.ts    # Reusable ModuleParams builder (accounts, org, session)
│   └── create-module-test.ts     # Generic test factory (per-manifest Vitest registration)
├── infrastructure/               # Shared prerequisite infrastructure scripts
│   ├── deploy-integ-prereqs.sh   # Orchestrator — calls common infra + central logs + module prereqs
│   ├── module-common-infra.sh    # DynamoDB tables + CloudWatch log group (management account)
│   └── central-logs-bucket.sh    # KMS key + S3 bucket with service policies (log archive account)
├── modules/
│   └── macie/                    # Macie module tests
│       ├── index.test.integration.ts  # Vitest entry point (3 lines)
│       ├── plugin.ts             # Macie-specific ModuleTestPlugin (config stubs + handler)
│       ├── assertions.ts         # Macie-specific AWS state assertions
│       └── manifests/            # Test configuration variations
│           ├── 01-enable-basic.manifest.json
│           ├── 02-update-settings.manifest.json
│           ├── 03-enable-with-disabled-regions.manifest.json
│           └── 04-disable.manifest.json
└── README.md
```

## Prerequisites

1. **Module infrastructure** — DynamoDB state/retention tables and CloudWatch log group in the management account. Deployed by `deploy-integ-prereqs.sh` (Step 1).
2. **Logging infrastructure** — Central logging S3 bucket and KMS key in the log archive account. Deployed by `deploy-integ-prereqs.sh` (Step 2, cross-account).
3. **IAM role** — An integration test role in every account with permissions for the modules under test.

### Infrastructure Deployment

The `deploy-integ-prereqs.sh` script handles all prerequisite infrastructure:

1. Deploys DynamoDB tables (`Module-State`, `Resource-Retention`) and CloudWatch log group (`Module-Verbose-Logs`) in the management account
2. Assumes cross-account role into the log archive account and deploys the central logging S3 bucket + KMS key

```bash
cd test/integration/infrastructure
bash deploy-integ-prereqs.sh <prefix> <region> <mgmt-account-id> <logarchive-account-id> <partition> <cross-account-role-name>
```

These are one-time resources that persist across test runs.

## Running Tests

### From the accelerator package directory

```bash
# Run all integration tests
yarn test:integration

# Run only Macie tests
yarn test:integration test/integration/modules/macie/index.test.integration.ts
```

### Required Environment Variables

| Variable | Description |
|---|---|
| `ACCOUNT_ID` | Pipeline/invoking account ID |
| `PARTITION` | AWS partition (e.g., `aws`) |
| `AWS_DEFAULT_REGION` | Target region |
| `ENV_NAME` | Environment manifest name for account resolution |
| `ACCELERATOR_PREFIX` | Accelerator prefix (e.g., `LzaIntegTest`) |
| `LOGGING_BUCKET_NAME` | Central logging S3 bucket name |
| `LOGGING_BUCKET_KEY_ARN` | KMS key ARN (actual key ARN, not alias) for the logging bucket |
| `MANAGEMENT_ACCOUNT_ACCESS_ROLE` | IAM role name for cross-account access |
| `VERBOSE_LOG_GROUP_NAME` | CloudWatch log group for verbose logging (optional) |
| `PIPELINE_ACCOUNT_ID` | Account ID for CWL log stream naming (required if `VERBOSE_LOG_GROUP_NAME` is set) |
| `ACCELERATOR_STAGE` | Stage name for CWL log stream prefix (e.g., `integ-macie`) |

## Adding a New Test Configuration (Manifest)

To test a new configuration combination for an existing module, just add a manifest file — no code changes needed.

1. Create a new JSON file in the module's `manifests/` directory (e.g., `05-enable-all-regions.manifest.json`)
2. Follow the naming convention: `{order}-{description}.manifest.json`
3. Set the `order` field to control execution sequence (manifests run in ascending order)
4. Define `moduleConfig` with the configuration to test and `expectedAssertions` with the expected outcomes

Example manifest:

```json
{
  "name": "enable-all-regions",
  "description": "Enable Macie in all regions with no exclusions",
  "order": 5,
  "skipCleanup": true,
  "moduleConfig": {
    "enable": true,
    "delegatedAdminAccount": "Audit",
    "boundary": { "regions": ["us-east-1", "us-west-2"] },
    "regionFilters": { "ignoredRegions": [], "disabledRegions": [] },
    "policyFindingsPublishingFrequency": "FIFTEEN_MINUTES",
    "publishSensitiveDataFindings": true,
    "publishPolicyFindings": true
  },
  "expectedAssertions": {
    "macieSessionEnabled": true,
    "delegatedAdminConfigured": true,
    "publishingFrequency": "FIFTEEN_MINUTES"
  }
}
```

The framework automatically discovers new manifest files, registers per-manifest test cases in Vitest, and reports each as a separate row in GitLab's JUnit test report. No changes to `plugin.ts`, `assertions.ts`, or `index.test.integration.ts` are needed — unless the new manifest requires a new assertion type.

### Manifest Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Display name for test reporting and logs |
| `description` | string | Yes | What this configuration variation tests |
| `order` | number | Yes | Execution order (ascending, must be unique) |
| `moduleConfig` | object | Yes | Module-specific configuration passed to the handler |
| `expectedAssertions` | object | Yes | Keys map to registered assertion functions |
| `skipCleanup` | boolean | No | Skip cleanup phase (use when next manifest depends on this state) |

## Adding a New Module

1. Create a directory under `modules/` (e.g., `modules/guardduty/`)
2. Add manifest files in a `manifests/` subdirectory
3. Implement a `plugin.ts` with `ModuleTestPlugin`:
   - `buildParams()` — use `buildBaseModuleParams()` from the framework, provide only module-specific config overrides
   - `execute()` — call the module handler
   - `assert()` — verify AWS state after execution
4. Create `index.test.integration.ts` (3 lines):
   ```typescript
   import { createModuleIntegrationTest } from '../../framework/create-module-test';
   import { guarddutyPlugin } from './plugin';
   createModuleIntegrationTest('GuardDuty', guarddutyPlugin, __dirname);
   ```
5. Add assertions in `assertions.ts`
6. Add a CI job in `.gitlab/jobs/security/integ-test.yaml`

The framework handles environment setup, manifest discovery, serial execution, per-manifest test registration, and JUnit reporting automatically.

## CI Integration

Integration tests run in GitLab CI when `EXECUTE_INTEGRATION_TEST=Yes`. Module test jobs additionally require that the module's source files have changed (file-change detection via GitLab `changes` keyword).

In the remote repo, jobs are restricted to the `integ` branch only — they will not run on `main`, release branches, or MR pipelines. In forks, jobs run on any branch as long as `EXECUTE_INTEGRATION_TEST=Yes` and the relevant files have changed.

The prereq job runs whenever `EXECUTE_INTEGRATION_TEST=Yes` (no file-change gating) since all module jobs depend on it and the idempotent CLI scripts are a no-op when infrastructure already exists.

Test results appear as per-manifest rows in GitLab's Tests tab via JUnit reporting.

All module logs are shipped to CloudWatch Logs (`{prefix}-Module-Verbose-Logs`) for post-run debugging.

### Required GitLab CI Variables

| Variable | Description |
|---|---|
| `EXECUTE_INTEGRATION_TEST` | `Yes` to enable integration tests, `No` to disable |
| `ACCELERATOR_PREFIX` | Resource naming prefix (e.g., `LzaIntegTest`) |
| `LZA_GITLAB_ROLE_NAME` | IAM role name for CI credential vending (e.g., `LzaGitlabRole`) |
| `SAMPLE_CONFIG_ENV_MANAGEMENT_ACCOUNT_ID` | Management account ID |
| `SAMPLE_CONFIG_ENV_LOGARCHIVE_ACCOUNT_ID` | Log archive account ID |

### Pipeline Flow

1. `integ:prereq:aws:us-east-1` — Deploys DynamoDB tables + CWL log group + logging bucket/KMS key
2. `integ:macie:aws:us-east-1` — Runs Macie integration tests (logging outputs injected via dotenv artifact)

See `.gitlab/jobs/security/integ-test.yaml` for job definitions.
