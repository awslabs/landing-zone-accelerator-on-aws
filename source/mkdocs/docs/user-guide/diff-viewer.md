# CDK Diff Viewer

!!! warning "Experimental"
    This feature is experimental and may change in future releases. Feedback and bug reports are welcome.

The CDK Diff Viewer is a self-contained HTML page generated during the pipeline's Review stage. It provides a consolidated view of all CloudFormation stack diffs across your entire LZA environment, replacing the need to download and inspect individual `.diff` files from S3.

!!! info "Authoritative previews come from change sets"
    The viewer flags **likely-destructive changes inferred from the synthesized CloudFormation templates**. For a precise, deploy-time preview of what CloudFormation will actually do, create a [CloudFormation change set](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets-create.html) against each target stack. The viewer helps you find *where* to look; change sets tell you exactly *what* will change.

## How it works

When the approval stage is enabled (`enableApprovalStage: true` in the installer), the pipeline's `pre-approval` action:

1. Collects all `.diff.json` files produced during the Bootstrap stage from S3.
2. Runs `generate-diff-viewer-cli.ts` to produce a single `diff-viewer.html` file.
3. Uploads the HTML file to the pipeline S3 bucket alongside the raw diffs.

The HTML is entirely self-contained — no external scripts, fonts, images, or network requests. All diff content is embedded as a gzip-compressed, base64-encoded blob and decompressed client-side via the browser's `DecompressionStream` API.

## Accessing the diff viewer

After the pipeline reaches the Review stage, download the HTML file from S3:

```bash
aws s3 cp s3://<pipeline-bucket>/AWSAccelerator-Pipel/Diffs/<execution-id>/diff-viewer.html ./diff-viewer.html
open diff-viewer.html
```

The S3 path and a download command are printed in the CodeBuild logs for the `pre-approval` action.

## Features

Click the **?** button in the top-left of the sidebar at any time for a condensed in-app help panel.

### Impact report (CloudFormation Diff Summary)

The viewer opens to a **CloudFormation Diff Summary** page with two collapsible cards (both expanded by default — click a title to collapse/expand):

1. **Report header** — title and export actions (Markdown, JSON).
2. **Critical Networking Changes** — the top-priority signal. See [below](#critical-networking-changes).
3. **Stacks Requiring Review** — paginated list of stacks that touch a tracked resource type. Includes an embedded **Filters** block (see [below](#stacks-requiring-review)).
4. **Scope** — total accounts and regions affected.

If you collapse the Critical Networking Changes section while changes exist, an inline <span style="color:#c93c37">⚠️ Critical networking changes exist — expand to review</span> warning remains next to the title so nothing slips past unreviewed.

### Critical Networking Changes

The Critical Networking Changes section is the headline feature. It surfaces every networking resource that this deployment will **delete, replace, conditionally replace, or orphan** — the kinds of changes that carry real blast radius.

**What counts as a critical networking change.** A resource must meet *both* conditions:

- It is a networking resource type (VPC, Subnet, Route, Route Table, Security Group / rules, NACL / entries, TGW and TGW attachments / routes / route tables, VPN, VPC peering, VPC endpoints, Network Firewall, DirectConnect, Global Accelerator, Network Manager, Route53, Route53 Resolver, RAM resource shares, and related — see [below](#tracked-networking-resource-types) for the full list).
- Its change is destructive, where destructive means one of:

    | Impact | Meaning |
    |---|---|
    | `WILL_DESTROY` | Resource will be deleted. Any data or state tied to it is lost. |
    | `WILL_REPLACE` | Resource will be deleted and recreated. Physical identity (ARN, IP, endpoints) changes. |
    | `MAY_REPLACE` | CDK cannot determine statically — may cause replacement at deploy time. |
    | `WILL_ORPHAN` | Resource will be removed from stack management but not deleted. No longer tracked by LZA. |

**Layout.** A two-column table — **Stack** and **Reviewed** — with one row per stack that contains any critical networking change.

- The whole section is **collapsible** via the section title. When collapsed with changes still present, an inline <span style="color:#c93c37">⚠️ Critical networking changes exist — expand to review</span> warning stays next to the title.
- Each row has a chevron (`▾`/`▸`) to expand or collapse the per-resource detail. Rows are **expanded by default** so nothing is hidden on first load.
- Expanded detail lists each destructive resource with a red badge (`Will Destroy` / `Will Replace` / `May Replace` / `Will Orphan`), the short resource type, the logical ID, and — for replace impacts — the property names that triggered the replacement.
- Click a stack name to drill into the full diff for that stack.
- Tick the **Reviewed** checkbox to dim and strike through the stack; the detail row auto-collapses at the same time. The sidebar updates in sync.
- If the list grows large (many stacks), it paginates at 25 per page with a filter box to search by stack name.

If the deployment contains **no** critical networking changes, the section shows a single green "✅ No critical networking changes detected" line.

#### Tracked networking resource types

The complete set of resource types considered networking (and therefore eligible for the Critical Networking Changes section) is:

| Category | Resource types |
|---|---|
| DirectConnect | `AWS::DirectConnect::Connection`, `Gateway`, `GatewayAssociation`, `VirtualInterface` |
| EC2 — core VPC & routing | `ClientVpnEndpoint`, `CustomerGateway`, `EIP`, `FlowLog`, `InternetGateway`, `NatGateway`, `NetworkAcl`, `NetworkAclEntry`, `PrefixList`, `Route`, `RouteTable`, `SecurityGroup`, `SecurityGroupEgress`, `SecurityGroupIngress`, `Subnet`, `SubnetRouteTableAssociation` |
| EC2 — transit gateway | `TransitGateway`, `TransitGatewayAttachment`, `TransitGatewayConnect`, `TransitGatewayMulticastDomain`, `TransitGatewayPeeringAttachment`, `TransitGatewayRoute`, `TransitGatewayRouteTable`, `TransitGatewayRouteTableAssociation`, `TransitGatewayRouteTablePropagation`, `TransitGatewayVpcAttachment` |
| EC2 — VPC peering / endpoints / VPN | `VPC`, `VPCCidrBlock`, `VPCEndpoint`, `VPCEndpointService`, `VPCEndpointServicePermissions`, `VPCGatewayAttachment`, `VPCPeeringConnection`, `VPNConnection`, `VPNConnectionRoute`, `VPNGateway`, `VPNGatewayRoutePropagation` |
| ELB | `ElasticLoadBalancing::LoadBalancer`, `ElasticLoadBalancingV2::LoadBalancer`, `Listener`, `TargetGroup` |
| Global Accelerator | `Accelerator`, `EndpointGroup`, `Listener` |
| Network Firewall | `Firewall`, `FirewallPolicy`, `LoggingConfiguration`, `RuleGroup` |
| Network Manager | `CoreNetwork`, `GlobalNetwork`, `SiteToSiteVpnAttachment`, `TransitGatewayPeering`, `TransitGatewayRegistration`, `VpcAttachment` |
| RAM | `ResourceShare` |
| Route53 / Route53Resolver | `HostedZone`, `RecordSet`, `FirewallDomainList`, `FirewallRuleGroup`, `FirewallRuleGroupAssociation`, `ResolverEndpoint`, `ResolverQueryLoggingConfig`, `ResolverQueryLoggingConfigAssociation`, `ResolverRule`, `ResolverRuleAssociation` |

You can also toggle which resource types are tracked by the **Stacks Requiring Review** table using the checkboxes in the Resource Types to Track section. Your selections are persisted in `localStorage`.

### Stack diff view

Click a stack name anywhere in the viewer (sidebar, Critical Networking Changes, or Stacks Requiring Review) to open the full stack diff. Sections are collapsible (`▼`/`▶`):

- **Parameters** — template parameter changes.
- **Conditions** — CloudFormation condition changes.
- **IAM Statement Changes** — IAM policy additions and removals in a colorized table. Full rows are highlighted for additions/removals including continuation rows.
- **Security Group Rule Changes** — SG ingress/egress additions and removals.
- **Resources** — per-resource diff cards. See below for the destructive callout.
- **Outputs** — stack output changes.
- **Noise** — collapsed by default. Contains low-signal churn (see [Noise filtering](#noise-filtering)).

**Destructive resource cards are outlined in red.** A 2 px red border on a resource card indicates the change will delete, replace (definitely or conditionally), or orphan the resource. Inside the card:

- An action badge (`Create`, `Update`, `Delete`, `Replace`, `May Replace`, `Orphan`, `Import`).
- A replacement banner explaining the impact and listing the triggering properties (for replace-type changes only).
- Per-property diffs — each changed property shows old value, new value, and an expandable full JSON diff with **📋 Old** / **📋 New** buttons to copy the raw JSON to your clipboard.

### Stacks Requiring Review

Every stack that touches at least one tracked resource type appears here. Layout mirrors Critical Networking Changes — a two-column table (Stack | Reviewed) where each row expands to show the per-resource detail (badge + resource type + logical ID).

Ticking the **Reviewed** checkbox also collapses that stack's detail row so the summary page stays compact as you work through a deployment.

#### Filters block

At the top of the Stacks Requiring Review card, the **Filters** block groups every control that narrows what the table shows:

- **Stack search** — substring match against the stack name
- **Reviewed filter** — `Unreviewed` (default) / `Reviewed` / `All`
- **Resource Types to Track** — a collapsible chevron (closed by default). Expand to see:
    - A **Select all** button that ticks every type
    - A **Clear all** button that unticks every type
    - One checkbox per resource type discovered in the diff

Default selection is **every** resource type. Toggling any checkbox updates the table immediately; selection is persisted per-origin in `localStorage`.

### Sidebar collapse

Click the **◀** button in the sidebar header (next to the `?` help and ☀️ theme buttons) to collapse the entire sidebar. A floating **▶** button then appears in the top-left corner of the viewport — click it to restore the sidebar. The collapse state is persisted in `localStorage` so the preference survives reload.

### Stack navigation

Stacks are grouped by section (Logging, Security, NetworkVpc, etc.) in a collapsible sidebar on the left. Click a section header (`▼`/`▶`) to expand or collapse it. Click a stack name to view its diff.

The **CloudFormation Diff Summary** link at the top of the sidebar returns to the impact report. Its indentation matches the section headers below it and it underlines on hover to indicate it is a link.

### Modules

When a pipeline run includes module runner operations (e.g. transit gateway associations, Macie enablement, SSM operations), their dry-run output is surfaced in a dedicated **Modules** section in the sidebar, alongside the CloudFormation stack sections. This lets you review pending module changes without downloading and extracting the `*.tgz` diff archives.

Each module appears as an entry under the **Modules** section. Clicking it opens the module's dry-run output rendered as a colorized text block:

- **Added** lines (`[+]` or a leading `+`) — blue
- **Removed** lines (`[-]` or a leading `-`) — red
- **Context** lines (everything else) — muted

Modules are classified for the sidebar the same way stacks are:

- A module whose dry-run shows real adds/removes (`[+]`/`[-]`) is marked **changed**.
- A module reported as `SKIPPED` (configuration unchanged) or with empty output is marked **no changes**, so the default *Unreviewed* filter hides it (and *Unchanged* surfaces it).

Module entries flow through the same **filter**, **search**, and **review-tracking** machinery as stacks — they are searchable by name, respect the Changed/Unchanged/Reviewed filters, and carry a reviewed checkbox.

!!! note "Comparison baseline"
    Module dry-run output compares the desired state from your LZA configuration against the **current live AWS state** queried at diff time, so it reflects operations the module runner would perform to reconcile config with the account. It only reports resources within each module's management scope; resources not managed by LZA are not surfaced. This differs from the CloudFormation sections, which compare synthesized templates against the deployed stacks. The Modules section is excluded from the impact report totals (it covers module operations, not CloudFormation resources).

### Filtering and search

Use the **Filter** button to show stacks by status:

- **Unreviewed** (default) — stacks you haven't reviewed yet. Unchanged stacks are auto-reviewed, so this view surfaces only the stacks that warrant attention.
- **Changed** — stacks with meaningful resource changes.
- **Unchanged** — stacks with no differences (or noise-only changes).
- **Reviewed** — stacks you've marked as reviewed.
- **All** — every stack.

The search bar filters by stack name or section name.

### Review tracking

Each stack has a checkbox to mark it as reviewed. Reviewed stacks appear with strikethrough text and reduced opacity. Checkboxes appear in three places (sidebar, Critical Networking Changes, Stacks Requiring Review) and all stay in sync.

Unchanged stacks — including stacks whose only changes are noise — are automatically marked as reviewed on load.

!!! note "In-memory state"
    Review state lives in the browser's memory and is not written to `localStorage`. Closing or refreshing the HTML file resets manual review progress. Unchanged stacks are re-marked automatically. See [Export and share](#export-and-share) below for how to hand off review progress to another reviewer.

### Export and share

The impact report header provides two download actions:

| Button | What it does |
|---|---|
| **⬇️ Markdown** | Downloads a formatted summary (`lza-diff-summary_<timestamp>.md`) with tables of totals, resource actions, destructive changes (including trigger properties), and networking changes. Suitable for change-approval tickets or COE docs. |
| **⬇️ JSON** | Downloads the full structured `ImpactReport` as `lza-diff-summary_<timestamp>.json` for programmatic consumption (diff comparison across pipeline runs, automated gating, etc.). |

To share review progress with another reviewer, open the viewer with a `#r=<indices>` URL fragment. Each index is the position of a stack in the sorted `stacks[]` array. Out-of-range or malformed values are silently ignored. This is the low-tech collaboration path — the viewer honors the fragment on load.

### Color-coded diffs

Diff content is color-coded to be accessible for color-vision deficiency — a left border and leading symbol accompany each color so the signal is not colour-only:

- <span style="color:#e06c75">**Red**</span> with `-` prefix and red left border — removals.
- <span style="color:#89b4fa">**Blue**</span> with `+` prefix and blue left border — additions.
- <span style="color:#6c7086">**Muted italic**</span> — context lines and identity markers.

Both dark and light themes are available. Toggle with the ☀️ / 🌙 button in the sidebar header; preference is persisted in `localStorage`.

## Noise filtering

The viewer detects and separates common no-op changes that appear on every pipeline run but represent no functional difference. Noise detection runs on the structured CDK diff output (`StructuredStackDiff`) — the same classification logic is applied server-side and client-side.

### Noise types

| Change type | Description |
|---|---|
| Lambda `S3Key` / `Code` | Asset hash changes when Lambda code is rebuilt. The hash bump alone doesn't indicate what changed in the function code. |
| Lambda `SOLUTION_ID` / `Environment` / `Variables` | Version string bump in Lambda environment variables. |
| SSM `AcceleratorVersion` | `AcceleratorVersion` SSM parameter value update — one per release. |
| `Custom::*` uuid rotation | UUID-only change on CDK custom resources. Forces a re-invocation at deploy time but doesn't change behaviour. |

### How noise is handled

Noise is handled at two levels:

1. **Stack classification** — stacks where *all* resource changes are noise (and there are no parameter / output / condition changes) are classified as **Unchanged**. They are hidden from the Unreviewed filter and auto-marked as reviewed.
2. **Section separation** — within stacks that have *both* real changes and noise, the stack diff view splits content into:

    - **Resources** — meaningful changes, visible by default.
    - **Noise** — collapsed by default with a muted header showing the noise resource count. Click to expand.

Noise detection does not affect delete / create actions — only `modify` can be classified as noise.

## Security properties

The generated HTML is distributed to reviewers and opened in a browser, so it is hardened:

- **Strict Content Security Policy**: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';`. The only loosened directives are the `unsafe-inline` for the embedded script and style — required because the viewer is a single-file artifact.
- **No network access**. All data is embedded; the viewer never makes outbound requests.
- **No third-party code**. No frameworks, no CDN scripts, no fonts.
- **Offline-capable**. The file works over `file://` with no server.
- **All dynamic content escaped**. HTML-construction paths escape `&`, `<`, `>`, `"` before concatenation, and CSS selector constructions use `CSS.escape()`.
- **URL fragment is validated**. Review-state indices are parsed with `parseInt(, 10)` and range-checked against the loaded stack list; malformed or out-of-range values are silently ignored.

## Local usage

You can generate the diff viewer locally without running the full pipeline. After synthesizing your stacks:

```bash
cd source/packages/@aws-accelerator/accelerator

# Collect diff JSON files from cdk.out
mkdir -p rawDiff
find cdk.out -name "*.diff.json" -print0 | xargs -0 -J {} cp {} rawDiff/

# Generate the viewer
yarn run ts-node --cwdMode --transpile-only generate-diff-viewer-cli.ts rawDiff diff-viewer.html
open diff-viewer.html
```

The CLI accepts two arguments: the directory containing `.diff.json` files and the output HTML file path.

## Region parsing

The viewer extracts `{account, region}` from each stack name. The parser supports every AWS region family:

- Commercial: `us-east-1`, `ap-southeast-2`, etc.
- GovCloud: `us-gov-east-1`, `us-gov-west-1`.
- Secret / Top-Secret: `us-iso-east-1`, `us-isob-east-1`.
- China: `cn-north-1`, `cn-northwest-1`.
- Stack names with suffixes appended after the region (e.g., from customizations) are tolerated.

Availability-zone suffixes (`us-east-1b`) are not mis-parsed as regions — they fail to match.

## Performance and scaling

The pipeline has been validated against synthetic workloads well beyond realistic LZA deployments:

| Scale | HTML size | End-to-end generation | Browser load (Chromium) | JS heap (peak) |
|---:|---:|---:|---:|---:|
| 1,000 stacks | 100 KB | 4 ms | <100 ms | < 50 MB |
| 100,000 stacks | 2 MB | 170 ms | ~400 ms | ~150 MB |
| 600,000 stacks | 11 MB | 1 s | ~1 s | ~750 MB |

For realistic LZA deployments (typically 200–1,000 stacks), both generation and browser load are well under one second. The architecture relies on:

- **Gzip + base64** data transport in a single HTML file — 600K stacks compresses from ~55 MB JSON to 11 MB HTML.
- **Paginated sidebar and tables** — 500 items per section initially with "Load more" buttons; 25 per page in the impact-report tables.
- **Unreviewed-by-default filter** — auto-reviewed unchanged stacks are hidden from the default view, so the initial render only costs the count of *actually* changed stacks.
- **Card cache** — each stack's detail card is built on demand and reused on subsequent visits.

## Limitations

- **Review state is not persisted.** Manual review progress lives in memory only. Use **🔗 Copy Link** to share progress with another reviewer via URL fragment, or export Markdown/JSON for an archived snapshot. Resource-type filter selections and theme preference *are* persisted in `localStorage`.
- **Inferred, not authoritative.** The viewer reports changes from the synthesized templates. For deploy-time certainty, use [CloudFormation change sets](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets-create.html) against each target stack.
- **Browser compatibility.** The viewer requires a browser that supports `DecompressionStream` (gzip). This includes Chrome 80+, Edge 80+, Firefox 113+, and Safari 16.4+. Internet Explorer is not supported.
- **No cross-execution comparison.** The viewer shows diffs from a single pipeline execution. It does not compare diffs across multiple executions or show historical trends. The JSON export is suitable for external tools that want to diff successive runs.
- **Large-scale caveats.** At extreme scale (hundreds of thousands of stacks), the sidebar DOM grows as sections are expanded. For practical LZA deployments this is not a concern.
