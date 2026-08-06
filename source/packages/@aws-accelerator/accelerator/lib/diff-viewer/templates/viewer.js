// ============================================================================
// LZA CDK Diff Viewer — Client-side logic (JSON-only)
// ----------------------------------------------------------------------------
// This script is embedded inline inside the generated `diff-viewer.html` file
// by `generate-diff-viewer.ts` (server-side). It expects two globals to be
// defined before this script runs:
//
//   impactReport  — structured summary (see ImpactReport in generate-diff-viewer.ts)
//                   embedded as a JSON literal via safeJsonEmbed().
//   dataBlob      — base64-encoded gzipped JSON of StackDiffData[] (the full
//                   per-stack diff payload, kept out of impactReport to keep
//                   that inline JSON small).
//   moduleBlob    — base64-encoded gzipped JSON of ModuleDiff[]
//                   ({name, hasChanges, content}) holding module runner dry-run
//                   output (*.module.diff). Decompressed alongside dataBlob and
//                   rendered as a "Modules" sidebar section so module-only
//                   changes are visible without downloading the .tgz archives.
//
// Architecture
// ------------
//   - No framework: vanilla DOM, plain function scope.
//   - State lives in module-level `var` bindings (see "DOM refs & state" block).
//   - Render model is rebuild-from-state: each view (sidebar, impact report,
//     stack-detail card) generates a fresh HTML string from state and assigns
//     to `container.innerHTML` / `sidebarList.innerHTML`. Event handlers are
//     then wired up in a "wireUp" pass that runs after innerHTML is set.
//
// Data flow
// ---------
//   1. On load: decompressBlob(dataBlob) -> stacks[]  (async, ~ms)
//   2. Auto-review: any stack with meta.hasChanges === false is added to the
//      `reviewed` map so the default Unreviewed filter hides it.
//   3. URL fragment: if the page URL has `#r=<indices>`, those stack indices
//      are merged into `reviewed` so a shared review-progress link works.
//   4. renderSidebar() + renderImpactReport() paint the initial UI.
//   5. User interactions mutate state (`reviewed`, `collapsed`, `activeKey`,
//      `selectedTypes`) and trigger re-render of the relevant view.
//
// Notable features
// ----------------
//   - Noise filtering (Lambda code churn, Custom:: uuid, SSM AcceleratorVersion)
//     runs client-side here mirroring the server-side classifier, so "Noise"
//     sections inside stack views match the overall impact-report counts.
//   - Critical Networking Changes: the top panel of the impact report.
//     Intersection of destructiveChanges ∩ networking resource types.
//   - Export / share: Markdown + JSON downloads + URL-fragment share link.
//
// Security
// --------
//   - Every HTML concatenation uses esc() for dynamic data.
//   - No eval / Function() / string-form setTimeout.
//   - URL-fragment indices are validated via parseInt + range check.
//   - CSP (set by shell.html) permits only inline-script/style; no network.
// ============================================================================

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Escape a string for safe insertion into either HTML text content or a
 * double-quoted attribute value. Escapes `&`, `<`, `>`, `"`, `'`.
 * Used on every attacker-influenced string before concatenating into markup.
 */
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// ── Shared DOM wiring helpers ────────────────────────────────────────────
// These helpers are used by any section that renders `.stack-link` anchors,
// `.report-review-cb` checkboxes, or Prev/Next pagination buttons. Keeping the
// wiring in one place avoids event-handler drift between views and makes the
// behaviour (click a stack → drill in; tick a box → dim row + update sidebar)
// easier to audit.

/**
 * Attach click handlers to every `.stack-link` inside `root`. Each link has a
 * `data-stack="<full stack name>"` attribute; the handler looks the stack up
 * in the global `stacks` array and calls showDiff().
 */
function wireStackLinks(root) {
  root.querySelectorAll('.stack-link').forEach(function(a) {
    a.onclick = function(e) {
      e.preventDefault();
      var name = this.getAttribute('data-stack');
      var target = stacks.find(function(s) { return s.meta.name === name; });
      if (target) showDiff(target);
    };
  });
}

/**
 * Attach change handlers to every `.report-review-cb` inside `root`. Updating
 * a checkbox updates the global `reviewed` map, toggles `.report-reviewed` on
 * the closest `<tr>`, strikes through the adjacent `.stack-link`, and forces a
 * sidebar re-render so the sidebar checkbox stays in sync.
 */
function wireReviewCheckboxes(root) {
  root.querySelectorAll('.report-review-cb').forEach(function(cb) {
    // Block propagation so clicking the checkbox doesn't trigger any row-level
    // click handlers (e.g., expand/collapse on a wrapping element).
    cb.onclick = function(e) { e.stopPropagation(); };
    cb.onchange = function() {
      var key = this.getAttribute('data-key');
      reviewed[key] = this.checked;
      var row = this.closest('tr');
      if (row) {
        row.classList.toggle('report-reviewed', this.checked);
        var link = row.querySelector('.stack-link');
        if (link) link.classList.toggle('reviewed-link', this.checked);

        // When marking a stack as reviewed, collapse its paired detail row
        // (and flip the chevron) — users have finished with that stack, no
        // need to keep its resource list expanded on the summary page.
        if (this.checked) {
          var stackKey = row.getAttribute('data-stack-key');
          if (stackKey) {
            var tbody = row.parentNode;
            var detail = tbody.querySelector('.crit-detail-row[data-parent-key="' + CSS.escape(stackKey) + '"]');
            if (detail) detail.classList.remove('crit-open');
            var chev = row.querySelector('.crit-expand-btn');
            if (chev) {
              chev.textContent = '\u25b8';
              chev.setAttribute('aria-expanded', 'false');
            }
            row.classList.remove('crit-expanded');
          }
        }
      }
      renderSidebar();
    };
  });
}

/**
 * Build the shared "X items · Page N/M [‹ Prev] [Next ›]" pagination footer
 * as an HTML string. Returns '' when there is only one page. Callers render
 * this into the pagination container and then wire the buttons by id.
 *
 * @param {number} total      number of items in the visible (post-filter) list
 * @param {number} page       current 0-indexed page number
 * @param {number} totalPages total number of pages (>= 1)
 * @param {string} idPrefix   **MUST be a static, developer-controlled token**
 *                            with only `[A-Za-z0-9_-]` characters — inlined
 *                            verbatim into an HTML `id` attribute.
 * @param {string} itemLabel  singular label root (e.g. 'item'). Escaped before
 *                            insertion into text context, but callers should
 *                            still pass a short static string for clarity.
 */
function paginationFooterHtml(total, page, totalPages, idPrefix, itemLabel) {
  var label = esc(itemLabel || 'item');
  var html = '<span class="page-info">' + total + ' ' + label + (total === 1 ? '' : 's') +
    ' \u00b7 Page ' + (page + 1) + '/' + totalPages + '</span>';
  if (totalPages > 1) {
    html += '<span class="page-buttons">' +
      '<button class="page-btn" id="' + idPrefix + '-prev"' + (page === 0 ? ' disabled' : '') + '>\u2039 Prev</button>' +
      '<button class="page-btn" id="' + idPrefix + '-next"' + (page >= totalPages - 1 ? ' disabled' : '') + '>Next \u203a</button>' +
      '</span>';
  }
  return html;
}

/**
 * Attach click + keyboard handlers to every `.crit-expand-btn` inside `root`.
 * Each button toggles the visibility of the paired `.crit-detail-row` (matched
 * by data-stack-key <-> data-parent-key) and updates the chevron character
 * and aria-expanded state accordingly. Used by both paginatedRowRenderer
 * (Critical Networking Changes) and the Stacks Requiring Review table.
 */
function wireCritExpandChevrons(root) {
  root.querySelectorAll('.crit-expand-btn').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation(); e.preventDefault();
      var row = this.closest('tr');
      if (!row) return;
      var key = row.getAttribute('data-stack-key');
      var detail = root.querySelector('.crit-detail-row[data-parent-key="' + CSS.escape(key) + '"]');
      if (!detail) return;
      var willOpen = !detail.classList.contains('crit-open');
      detail.classList.toggle('crit-open', willOpen);
      this.textContent = willOpen ? '\u25be' : '\u25b8';
      this.setAttribute('aria-expanded', String(willOpen));
      row.classList.toggle('crit-expanded', willOpen);
    };
  });
}

/**
 * Wire a section-level collapsible header + body pair. Clicking the header
 * (or pressing Enter/Space while focused) toggles the body's `hidden`
 * attribute, flips the `.section-collapse-chevron` glyph, and updates
 * aria-expanded on the header. Optional `onToggle(isOpen)` callback lets the
 * caller react (e.g. show a collapse-time warning).
 *
 * @param {Element?}            hdrEl     the clickable header element
 * @param {Element?}            bodyEl    the content element to hide/show
 * @param {(isOpen:boolean)=>void} [onToggle]
 */
function wireCollapsibleSection(hdrEl, bodyEl, onToggle) {
  if (!hdrEl || !bodyEl) return;
  var toggle = function() {
    var wasOpen = !bodyEl.hidden;
    bodyEl.hidden = wasOpen;
    var chev = hdrEl.querySelector('.section-collapse-chevron');
    if (chev) chev.textContent = wasOpen ? '\u25b8' : '\u25be';
    hdrEl.setAttribute('aria-expanded', String(!wasOpen));
    if (onToggle) onToggle(!wasOpen);
  };
  hdrEl.onclick = toggle;
  hdrEl.onkeydown = function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  };
}

/**
 * Build the paired summary + detail <tr>s for one stack in a table that uses
 * the Critical Networking Changes layout (2 columns: Stack | Reviewed, with
 * an expandable detail row listing each resource). Used by both the Critical
 * Networking Changes section and the Stacks Requiring Review table so their
 * markup stays in lockstep.
 *
 * @param opts.key             "<section>/<name>" review key
 * @param opts.stackName       full stack name (displayed + data-stack)
 * @param opts.isReviewed      whether the Reviewed checkbox starts checked
 * @param opts.detailItemsHtml pre-rendered HTML for the crit-detail-list contents
 */
function critExpandableRowHtml(opts) {
  var isRev = !!opts.isReviewed;
  var k = opts.key;
  var stackName = opts.stackName;

  var h = '<tr class="report-stack-row crit-summary-row crit-expanded' + (isRev ? ' report-reviewed' : '') + '" data-stack-key="' + esc(k) + '">';
  h += '<td class="crit-stack-cell">';
  h += '<button type="button" class="crit-expand-btn" aria-label="Toggle detail" aria-expanded="true">\u25be</button>';
  h += '<a href="#" class="stack-link' + (isRev ? ' reviewed-link' : '') + '" data-stack="' + esc(stackName) + '" title="' + esc(stackName) + '">' + esc(stackName) + '</a>';
  h += '</td>';
  h += '<td style="text-align:center; width:4rem"><input type="checkbox" class="report-review-cb" data-key="' + esc(k) + '"' + (isRev ? ' checked' : '') + '></td>';
  h += '</tr>';
  h += '<tr class="crit-detail-row crit-open" data-parent-key="' + esc(k) + '"><td colspan="2"><div class="crit-detail-list">';
  h += opts.detailItemsHtml;
  h += '</div></td></tr>';
  return h;
}

/**
 * Build one `<div class="crit-item">` detail line. Used for every resource
 * shown inside an expandable stack row in both Critical Networking Changes
 * and Stacks Requiring Review.
 *
 * @param opts.badgeHtml     pre-rendered HTML for the impact badge (callers
 *                           use either `destructive-badge destructive-<tone>`
 *                           or the generic `impactBadge(impact)`)
 * @param opts.resourceType  full CFN resource type — always set as the title
 *                           (tooltip) for accessibility and full-name copy.
 * @param opts.displayType   optional override for the visible text; defaults
 *                           to resourceType. Critical Networking passes the
 *                           `AWS::`-stripped short form here for density.
 * @param opts.logicalId     CFN logical id
 * @param opts.trigger       optional "trigger: <props>" chip (string, already
 *                           joined with commas; empty/undefined = omit)
 */
function critDetailItemHtml(opts) {
  var display = opts.displayType !== undefined ? opts.displayType : opts.resourceType;
  var h = '<div class="crit-item">';
  h += opts.badgeHtml;
  h += '<code class="change-type" title="' + esc(opts.resourceType) + '">' + esc(display) + '</code>';
  h += '<code class="change-id" title="' + esc(opts.logicalId) + '">' + esc(opts.logicalId) + '</code>';
  if (opts.trigger) {
    h += '<span class="change-trigger" title="Properties that triggered this replacement">trigger: <code>' + esc(opts.trigger) + '</code></span>';
  }
  h += '</div>';
  return h;
}

/**
 * Copy `text` to the clipboard. Prefers `navigator.clipboard.writeText` (async,
 * requires secure context or file://) and falls back to a hidden-textarea +
 * document.execCommand('copy') for older browsers / restricted environments.
 * Returns a Promise that resolves once the copy completes (or rejects on error).
 */
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(function() {
      fallbackCopy(text);
    });
  }
  fallbackCopy(text);
  return Promise.resolve();
}

/**
 * CDK changeImpact → { display label, CSS class } for the inline action badge.
 * Unknown impacts fall back to a neutral "update" look and show the raw string.
 */
var IMPACT_LABELS = {
  WILL_CREATE:  { label: 'Will Create',  cls: 'action-create' },
  WILL_UPDATE:  { label: 'Will Update',  cls: 'action-modify' },
  WILL_REPLACE: { label: 'Will Replace', cls: 'action-replace' },
  MAY_REPLACE:  { label: 'May Replace',  cls: 'action-may-replace' },
  WILL_DESTROY: { label: 'Will Destroy', cls: 'action-delete' },
  WILL_ORPHAN:  { label: 'Will Orphan',  cls: 'action-modify' },
  WILL_IMPORT:  { label: 'Will Import',  cls: 'action-create' },
};

/** Render a pill-shaped badge for a CDK changeImpact string. */
function impactBadge(impact) {
  var info = IMPACT_LABELS[impact] || { label: impact, cls: 'action-modify' };
  return '<span class="action-badge ' + info.cls + '">' + esc(info.label) + '</span>';
}

// ── Noise detection (client-side, matches server) ────────────────────────

// Property/type sets describing changes that appear on every deployment but
// carry no functional meaning. MUST stay in sync with generate-diff-viewer.ts
// so stack classification (hasChanges) and section separation agree.
var NOISE_LEAF = { S3Key:1, SOLUTION_ID:1, uuid:1, Value:1 };
var NOISE_CONTAINER = { Code:1, Environment:1, Variables:1 };
var NOISE_TYPES = { 'AWS::Lambda::Function':1, 'AWS::CloudFormation::CustomResource':1, 'AWS::SSM::Parameter':1 };

/**
 * True when a resource change is pure noise (Lambda asset-hash churn,
 * AcceleratorVersion SSM bump, Custom::* uuid rotation).
 * Only `modify` actions can be noise — create/delete are always meaningful.
 */
function isNoise(r) {
  if (r.action !== 'modify') return false;
  var props = Object.keys(r.properties);
  if (props.length === 0) return false;
  if (props.every(function(p) { return NOISE_LEAF[p] || NOISE_CONTAINER[p]; }) && NOISE_TYPES[r.resourceType]) return true;
  if (r.resourceType === 'AWS::SSM::Parameter' && r.logicalId.indexOf('AcceleratorVersion') !== -1) return true;
  if (r.resourceType.indexOf('Custom::') === 0 && props.every(function(p) { return p === 'uuid'; })) return true;
  return false;
}

// ── Decompression ────────────────────────────────────────────────────────

/**
 * Decode a base64 gzip blob and parse the resulting JSON array of StackDiffData.
 * Uses the browser's native DecompressionStream (gzip) — no third-party library.
 * Runs async because DecompressionStream is stream-based.
 *
 * @param {string} b64  base64-encoded gzip payload (from the `dataBlob` global)
 * @returns {Promise<Array>}  StackDiffData[] — see generate-diff-viewer.ts
 */
async function decompressBlob(b64) {
  var bin = Uint8Array.from(atob(b64), function(c) { return c.charCodeAt(0); });
  var ds = new DecompressionStream('gzip');
  var writer = ds.writable.getWriter();
  writer.write(bin);
  writer.close();
  var reader = ds.readable.getReader();
  var chunks = [];
  while (true) {
    var result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
  }
  var totalLen = chunks.reduce(function(a, c) { return a + c.length; }, 0);
  var merged = new Uint8Array(totalLen);
  var offset = 0;
  for (var i = 0; i < chunks.length; i++) { merged.set(chunks[i], offset); offset += chunks[i].length; }
  return JSON.parse(new TextDecoder().decode(merged));
}

// ── DOM refs & module state ──────────────────────────────────────────────
// All mutable state lives here. Render functions rebuild HTML from state;
// they never perform incremental DOM patching.

var container = document.getElementById('cards');       // main content area
var sidebarList = document.getElementById('sidebar-list');
var mainEl = document.getElementById('main');
var summaryEl = document.getElementById('summary');     // "X stacks · Y changed" line

var stacks = [];             // StackDiffData[] — populated after decompression
var sectionOrder = [];       // Section names in the order first seen (for stable sidebar grouping)
var collapsed = {};          // section name -> boolean (true = collapsed in sidebar)
var reviewed = {};           // "<section>/<name>" -> boolean (true = user marked reviewed)
var currentFilter = 'unreviewed';  // active sidebar filter
var searchTimeout;           // debounce handle for the sidebar search input
var activeKey = null;        // "<section>/<name>" of currently-displayed stack detail
var cardCache = {};          // "<section>/<name>" -> rendered detail card DOM node
var dataReady = false;       // flips true once decompressBlob resolves
var typeFilterExpanded = false; // persisted across re-renders so ticking a type-cb doesn't collapse the subsection

// ── Data loading ─────────────────────────────────────────────────────────

summaryEl.textContent = 'Decompressing...';

// Kick off the async pipeline: decompress → populate state → paint initial UI.
// Runs exactly once on page load. `dataPromise` is awaited by showDiff() when
// the user clicks a stack link before decompression finishes.
var dataPromise = Promise.all([decompressBlob(dataBlob), decompressModuleBlob()]).then(function(results) {
  stacks = results[0].concat(buildModuleStacks(results[1]));
  var sectionSet = {};
  for (var i = 0; i < stacks.length; i++) {
    var m = stacks[i].meta;
    if (!sectionSet[m.section]) { sectionSet[m.section] = true; sectionOrder.push(m.section); }
    if (!m.hasChanges) reviewed[m.section + '/' + m.name] = true;
  }
  // Overlay review state from URL fragment (e.g. a shared review-progress link).
  // Runs after the auto-review pass so explicit user-reviewed flags stick.
  applyReviewFragment();
  sectionOrder.forEach(function(s) { collapsed[s] = true; });
  dataReady = true;
  summaryEl.textContent = stacks.length + ' stacks \u00b7 ' + stacks.filter(function(s) { return s.meta.hasChanges; }).length + ' changed';
  renderSidebar();
  renderImpactReport();
}).catch(function(err) {
  container.innerHTML = '<div style="padding:2rem;color:var(--red)"><h2>Failed to load diff data</h2><p>' + esc(String(err)) + '</p></div>';
});

// ── Resource type filter state ───────────────────────────────────────────
// `selectedTypes` controls which resource types feed the Stacks Requiring
// Review table. Persisted per-origin in localStorage so the user's choices
// survive reload. Initialized from impactReport on first load.

var selectedTypes = {};
(function() {
  var saved = localStorage.getItem('lza-diff-notable-types');
  if (saved) { try { selectedTypes = JSON.parse(saved); } catch(e) { selectedTypes = {}; } }
  // Default (first-load) behavior: every resource type in the diff is tracked.
  // The user can narrow the list via the Resource Types to Track checkboxes
  // inside the Stacks Requiring Review section.
  for (var i = 0; i < impactReport.allResourceTypes.length; i++) {
    var t = impactReport.allResourceTypes[i];
    if (selectedTypes[t] === undefined) selectedTypes[t] = true;
  }
})();

/** Return the list of currently-ticked resource types (stable order by allResourceTypes). */
function getSelectedTypes() {
  return impactReport.allResourceTypes.filter(function(t) { return selectedTypes[t]; });
}

// ── Impact report (summary page) ────────────────────────────────────────

// Destructive impact metadata for the priority-1 panel
var DESTRUCTIVE_META = {
  WILL_DESTROY: { label: 'Will Destroy', tone: 'destroy', description: 'Resource will be deleted. Any data or state tied to it will be lost.' },
  WILL_REPLACE: { label: 'Will Replace', tone: 'replace', description: 'Resource will be deleted and recreated. Physical identity (ARN, IP, endpoints) will change.' },
  MAY_REPLACE:  { label: 'May Replace',  tone: 'may-replace', description: 'CDK cannot determine statically. May cause replacement at deploy time — review carefully.' },
  WILL_ORPHAN:  { label: 'Will Orphan',  tone: 'orphan', description: 'Resource will be removed from stack management but not deleted. No longer tracked by LZA.' },
};

/**
 * Strip the `AWS::` prefix from a resource type for compact display.
 * `AWS::Route53Resolver::ResolverRuleAssociation` → `Route53Resolver::ResolverRuleAssociation`
 */
function shortType(t) {
  return (t || '').replace(/^AWS::/, '');
}

/**
 * Render a paginated list of compact row-cards (not a table — avoids column alignment issues
 * when cell content varies in length). Returns { html, wireUp } — caller inserts html, then calls wireUp().
 *
 * opts: { id, rows, renderRow(row) -> string, searchFields: string[], pageSize, emptyMessage }
 */
function paginatedRowRenderer(opts) {
  var state = { page: 0, search: '' };
  var pageSize = opts.pageSize || 25;

  function visibleRows() {
    var s = (state.search || '').toLowerCase();
    if (!s) return opts.rows;
    return opts.rows.filter(function(r) {
      return opts.searchFields.some(function(f) { return (r[f] || '').toLowerCase().indexOf(s) !== -1; });
    });
  }

  function buildHtml() {
    if (opts.rows.length === 0) {
      return opts.emptyMessage ? '<p class="report-ok">' + esc(opts.emptyMessage) + '</p>' : '';
    }
    var h = '<div class="report-controls">';
    h += '<input type="text" id="' + opts.id + '-search" class="report-search" placeholder="Filter...">';
    h += '</div>';
    h += '<table class="report-table ' + (opts.listClass || '') + '"><thead><tr>';
    for (var c = 0; c < opts.tableHeader.length; c++) h += '<th>' + esc(opts.tableHeader[c]) + '</th>';
    h += '</tr></thead><tbody id="' + opts.id + '-list"></tbody></table>';
    h += '<div class="report-pagination" id="' + opts.id + '-pagination"></div>';
    return h;
  }

  function renderRows() {
    var list = document.getElementById(opts.id + '-list');
    var pagination = document.getElementById(opts.id + '-pagination');
    if (!list) return;
    var rows = visibleRows();
    var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (state.page >= totalPages) state.page = totalPages - 1;
    var pageRows = rows.slice(state.page * pageSize, (state.page + 1) * pageSize);
    var html = '';
    for (var i = 0; i < pageRows.length; i++) html += opts.renderRow(pageRows[i]);
    list.innerHTML = html;
    pagination.innerHTML = paginationFooterHtml(rows.length, state.page, totalPages, opts.id + '-page', 'item');

    // Pagination buttons (created by paginationFooterHtml — hook them up now)
    var prev = document.getElementById(opts.id + '-page-prev');
    var next = document.getElementById(opts.id + '-page-next');
    if (prev) prev.onclick = function() { state.page--; renderRows(); };
    if (next) next.onclick = function() { state.page++; renderRows(); };

    // Shared wiring for any row that contains a stack link, review checkbox,
    // or a Critical Changes expand chevron.
    wireStackLinks(list);
    wireReviewCheckboxes(list);
    wireCritExpandChevrons(list);
  }

  function wireUp() {
    if (opts.rows.length === 0) return;
    var searchEl = document.getElementById(opts.id + '-search');
    var t;
    if (searchEl) searchEl.oninput = function() { clearTimeout(t); t = setTimeout(function() { state.search = searchEl.value; state.page = 0; renderRows(); }, 200); };
    renderRows();
  }

  return { html: buildHtml(), wireUp: wireUp };
}

function renderDestructiveSection(report) {
  // Filter destructiveChanges to networking resource types only (intersection with networkingChanges)
  var netTypes = {};
  for (var ni = 0; ni < report.networkingChanges.length; ni++) {
    netTypes[report.networkingChanges[ni].resourceType] = true;
  }
  var filtered = report.destructiveChanges.filter(function(d) { return netTypes[d.resourceType]; });
  var hasChanges = filtered.length > 0;

  // Section is collapsible (expanded by default). If there are critical changes
  // and the user collapses it, we show an inline warning next to the title so
  // nothing disappears unreviewed.
  var h = '<div class="report-section destructive-section">';
  h += '<h3 class="report-section-title destructive-title section-collapsible" role="button" tabindex="0" aria-expanded="true">';
  h += '<span class="section-collapse-chevron">\u25be</span> Critical Networking Changes';
  if (hasChanges) {
    h += '<span class="crit-collapsed-warning">\u26a0\ufe0f Critical networking changes exist \u2014 expand to review</span>';
  }
  h += '</h3>';
  h += '<div class="section-body" id="crit-networking-body">';

  if (!hasChanges) {
    h += '<p class="report-ok">\u2705 No critical networking changes detected. No networking resources will be deleted, replaced, or orphaned.</p>';
    h += '</div></div>';  // close section-body + report-section
    return h;
  }
  h += '<p class="destructive-summary-text">These stacks contain networking resources that will be <strong>deleted, replaced, or orphaned</strong>. Review each stack before approving this deployment.</p>';
  h += '<p class="destructive-summary-text">For a precise, deploy-time preview of what will actually happen, create a <strong><a href="https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets-create.html" target="_blank" rel="noopener noreferrer">CloudFormation change set</a></strong> against each target stack. This viewer flags likely-destructive changes inferred from the synthesized templates; a change set reflects the exact operations CloudFormation will perform against the live stack.</p>';

  // Group destructive changes by stack
  var byStack = {};
  var stackOrder = [];
  for (var i = 0; i < filtered.length; i++) {
    var d = filtered[i];
    if (!byStack[d.stackName]) {
      byStack[d.stackName] = { stackName: d.stackName, section: d.section, changes: [] };
      stackOrder.push(d.stackName);
    }
    byStack[d.stackName].changes.push(d);
  }
  var stackGroups = stackOrder.map(function(n) { return byStack[n]; });

  destructiveTable = paginatedRowRenderer({
    id: 'destructive-list',
    rows: stackGroups,
    searchFields: ['stackName'],
    pageSize: 25,
    listClass: 'destructive-table',
    tableHeader: ['Stack', 'Reviewed'],
    renderRow: function(sg) {
      var k = sg.section + '/' + sg.stackName;
      var detailHtml = sg.changes.map(function(c) {
        var meta = DESTRUCTIVE_META[c.impact] || { label: c.impact, tone: 'destroy' };
        var badge = '<span class="destructive-badge destructive-' + meta.tone + '">' + esc(meta.label) + '</span>';
        return critDetailItemHtml({
          badgeHtml: badge,
          resourceType: c.resourceType,
          displayType: shortType(c.resourceType),
          logicalId: c.logicalId,
          trigger: c.triggerProperties && c.triggerProperties.length > 0 ? c.triggerProperties.join(', ') : '',
        });
      }).join('');
      return critExpandableRowHtml({
        key: k,
        stackName: sg.stackName,
        isReviewed: reviewed[k],
        detailItemsHtml: detailHtml,
      });
    },
  });
  h += destructiveTable.html;
  h += '</div></div>';  // close section-body + report-section
  return h;
}

// Table handle captured during render() so wireUp can run after innerHTML is set
var destructiveTable = null;

// ── Export helpers ───────────────────────────────────────────────────────
// Client-side Markdown/JSON downloads of the impact report. Uses Blob +
// URL.createObjectURL so the download runs entirely offline (no server).

/**
 * Create a transient Blob URL and click a hidden `<a download>` to save it,
 * then revoke the URL. Works on file:// and https:// alike.
 * @param {Blob} blob         payload to download
 * @param {string} filename   desired filename shown to the user
 */
function triggerDownload(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/** ISO-8601 timestamp slug suitable for filenames (colons → dashes, T → _). */
function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/T/, '_').replace(/Z$/, '');
}

/**
 * Serialize the impact report (plus a generation timestamp) to pretty JSON
 * for programmatic consumption or archival.
 */
function buildExportJson(report) {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalStacks: report.totalStacks,
    stacksWithChanges: report.stacksWithChanges,
    stacksWithDestructive: report.stacksWithDestructive,
    stacksWithNetworkingChanges: report.stacksWithNetworkingChanges,
    resourceCounts: report.resourceCounts,
    destructiveCounts: report.destructiveCounts,
    accountsAffected: report.accountsAffected,
    regionsAffected: report.regionsAffected,
    destructiveChanges: report.destructiveChanges,
    networkingChanges: report.networkingChanges,
  }, null, 2);
}

/**
 * Escape a cell value for inclusion in a Markdown table.
 * Pipes break table rows; newlines collapse adjacent rows — both are replaced
 * with safer equivalents so the generated document stays well-formed.
 */
function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * Assemble the human-readable Markdown summary — totals table, resource action
 * breakdown, destructive-change table (with trigger properties), and networking
 * change table. Suitable for pasting into change-approval tickets or COE docs.
 */
function buildExportMarkdown(report) {
  var lines = [];
  lines.push('# LZA CDK Diff — Impact Summary');
  lines.push('');
  lines.push('_Generated: ' + new Date().toISOString() + '_');
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('| --- | ---: |');
  lines.push('| Total Stacks | ' + report.totalStacks + ' |');
  lines.push('| Stacks with Changes | ' + report.stacksWithChanges + ' |');
  lines.push('| Stacks with Destructive Changes | ' + report.stacksWithDestructive + ' |');
  lines.push('| Stacks with Networking Changes | ' + report.stacksWithNetworkingChanges + ' |');
  lines.push('| Accounts Affected | ' + report.accountsAffected.length + ' |');
  lines.push('| Regions Affected | ' + report.regionsAffected.length + ' |');
  lines.push('');
  lines.push('## Resource Actions');
  lines.push('');
  lines.push('| Action | Count |');
  lines.push('| --- | ---: |');
  lines.push('| Creates | ' + report.resourceCounts.creates + ' |');
  lines.push('| Modifies | ' + report.resourceCounts.modifies + ' |');
  lines.push('| Deletes | ' + report.resourceCounts.deletes + ' |');
  lines.push('| Replaces | ' + report.resourceCounts.replaces + ' |');
  lines.push('');
  lines.push('## Destructive Changes');
  lines.push('');
  var dc = report.destructiveCounts;
  lines.push('| Impact | Count |');
  lines.push('| --- | ---: |');
  lines.push('| Will Destroy | ' + dc.willDestroy + ' |');
  lines.push('| Will Replace | ' + dc.willReplace + ' |');
  lines.push('| May Replace | ' + dc.mayReplace + ' |');
  lines.push('| Will Orphan | ' + dc.willOrphan + ' |');
  lines.push('');
  if (report.destructiveChanges.length === 0) {
    lines.push('_No destructive changes detected._');
  } else {
    lines.push('| Impact | Resource Type | Logical ID | Trigger Properties | Stack | Account | Region |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (var i = 0; i < report.destructiveChanges.length; i++) {
      var d = report.destructiveChanges[i];
      var trigger = d.triggerProperties ? d.triggerProperties.join(', ') : '';
      lines.push('| ' + d.impact + ' | `' + mdEscape(d.resourceType) + '` | `' + mdEscape(d.logicalId) + '` | ' + (trigger ? '`' + mdEscape(trigger) + '`' : '—') + ' | ' + mdEscape(d.stackName) + ' | ' + mdEscape(d.account) + ' | ' + mdEscape(d.region) + ' |');
    }
  }
  lines.push('');
  lines.push('## Networking Changes');
  lines.push('');
  if (report.networkingChanges.length === 0) {
    lines.push('_No networking changes detected._');
  } else {
    lines.push('| Action | Impact | Resource Type | Logical ID | Stack | Account | Region |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (var j = 0; j < report.networkingChanges.length; j++) {
      var n = report.networkingChanges[j];
      lines.push('| ' + n.action + ' | ' + (n.impact || '') + ' | `' + mdEscape(n.resourceType) + '` | `' + mdEscape(n.logicalId) + '` | ' + mdEscape(n.stackName) + ' | ' + mdEscape(n.account) + ' | ' + mdEscape(n.region) + ' |');
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** Wired to the `⬇️ JSON` button — downloads the structured report as JSON. */
function exportReportJson() {
  var blob = new Blob([buildExportJson(impactReport)], { type: 'application/json' });
  triggerDownload(blob, 'lza-diff-summary_' + timestampSlug() + '.json');
}

/** Wired to the `⬇️ Markdown` button — downloads the human-readable summary. */
function exportReportMarkdown() {
  var blob = new Blob([buildExportMarkdown(impactReport)], { type: 'text/markdown' });
  triggerDownload(blob, 'lza-diff-summary_' + timestampSlug() + '.md');
}

// ── URL-fragment review state ────────────────────────────────────────────

/**
 * Parse `#r=i1,i2,i3` fragment where each i is a 0-based index into stacks[].
 * Applies matching indices to the `reviewed` map. Call after stacks[] is loaded.
 * Silently ignores malformed/out-of-range indices so the UI still works if the
 * fragment is stale relative to the current diff set.
 */
function applyReviewFragment() {
  var hash = (window.location.hash || '').replace(/^#/, '');
  if (hash.indexOf('r=') !== 0) return;
  var payload = hash.slice(2);
  if (!payload) return;
  var indices = payload.split(',').map(function(s) { return parseInt(s, 10); });
  for (var i = 0; i < indices.length; i++) {
    var idx = indices[i];
    if (!isFinite(idx) || idx < 0 || idx >= stacks.length) continue;
    var m = stacks[idx].meta;
    reviewed[m.section + '/' + m.name] = true;
  }
}

/**
 * Fallback for browsers without the async clipboard API (e.g. some file://
 * configurations). Uses the deprecated but still-supported document.execCommand('copy')
 * on a transient hidden <textarea>. Called internally by copyText().
 */
function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
}

// ── Impact report (CloudFormation Diff Summary landing page) ─────────────

/**
 * Rebuild the impact report into the main content area. Called on initial
 * load, when the user clicks "CloudFormation Diff Summary" in the sidebar,
 * or when the Resource Types to Track filter changes.
 *
 * Sections rendered (in order):
 *   1. Header with Markdown / JSON / Copy Link actions.
 *   2. Critical Networking Changes (per-stack table; via renderDestructiveSection).
 *   3. Resource Types to Track (checkbox grid).
 *   4. Stacks Requiring Review (paginated table with its own search + filter).
 *   5. Scope (accounts/regions count).
 *
 * All dynamic content is escaped via esc(). Event handlers are wired after
 * innerHTML is assigned.
 */
function renderImpactReport() {
  if (!dataReady) return;
  var report = impactReport;
  var selectedSet = {};
  getSelectedTypes().forEach(function(t) { selectedSet[t] = true; });

  // Aggregate from structured data
  var changeMap = {};
  var filteredStacks = [];

  for (var si = 0; si < stacks.length; si++) {
    var s = stacks[si];
    // Skip module pseudo-stacks: they carry `content` (raw dry-run text) but no
    // structured `diff`, so dereferencing s.diff.resources below would throw and
    // blank the whole report. The impact report covers CDK stacks only.
    if (!s.meta.hasChanges || s.module) continue;
    var matching = s.diff.resources.filter(function(r) { return selectedSet[r.resourceType] && !isNoise(r); });
    if (matching.length > 0) {
      filteredStacks.push({ meta: s.meta, resources: matching });
    }
    for (var ri = 0; ri < matching.length; ri++) {
      var r = matching[ri];
      var key = r.resourceType + '|' + r.action;
      if (!changeMap[key]) changeMap[key] = { resourceType: r.resourceType, action: r.action, count: 0, stacks: {} };
      changeMap[key].count++;
      changeMap[key].stacks[s.meta.name] = true;
    }
  }

  var sortedChanges = Object.keys(changeMap).sort(function(a, b) { return changeMap[b].count - changeMap[a].count; })
    .map(function(k) { var e = changeMap[k]; return { resourceType: e.resourceType, action: e.action, count: e.count, stackCount: Object.keys(e.stacks).length }; });

  // Build HTML
  var h = '<div class="impact-report">';
  h += '<div class="report-header-row">';
  h += '<h2 class="report-title">CloudFormation Diff Summary</h2>';
  h += '<div class="report-header-actions">';
  h += '<button id="export-md-btn" class="export-btn" title="Download Markdown summary">\u2b07\ufe0f Markdown</button>';
  h += '<button id="export-json-btn" class="export-btn" title="Download JSON summary">\u2b07\ufe0f JSON</button>';
  h += '</div>';
  h += '</div>';

  // ── Critical Changes (top priority) ──
  h += renderDestructiveSection(report);

  // Stacks Requiring Review — includes an in-section collapsible "Resource
  // Types to Track" subsection; paginated stack table follows.
  var stacksTable = renderStacksRequiringReview(filteredStacks, report, selectedSet);
  h += stacksTable.html;

  h += '<div class="report-section"><h3 class="report-section-title">Scope</h3>';
  h += '<p>' + report.accountsAffected.length + ' account(s) \u00b7 ' + report.regionsAffected.length + ' region(s)</p></div>';
  h += '</div>';
  container.innerHTML = h;

  // Wire up destructive paginated table
  if (destructiveTable) destructiveTable.wireUp();

  // Wire up the Critical Networking Changes collapsible header
  var critSection = container.querySelector('.destructive-section');
  wireCollapsibleSection(
    container.querySelector('.destructive-section .section-collapsible'),
    document.getElementById('crit-networking-body'),
    function(isOpen) {
      // While collapsed, show the inline "changes exist" warning next to the title.
      if (critSection) critSection.classList.toggle('section-collapsed', !isOpen);
    },
  );

  // Wire up export + share buttons
  var mdBtn = document.getElementById('export-md-btn');
  if (mdBtn) mdBtn.onclick = exportReportMarkdown;
  var jsonBtn = document.getElementById('export-json-btn');
  if (jsonBtn) jsonBtn.onclick = exportReportJson;

  // Wire up the Stacks Requiring Review collapsible header
  wireCollapsibleSection(
    container.querySelector('.stacks-requiring-review-section .section-collapsible'),
    document.getElementById('stacks-req-body'),
  );

  // Wire up Stacks Requiring Review table (search/filter/pagination/checkboxes
  // + the collapsible Resource Types to Track subsection inside it)
  stacksTable.wireUp();
}

/**
 * Render the "Stacks Requiring Review" section: every stack that touches a
 * currently-tracked resource type, grouped per row with action counts.
 *
 * Also hosts a collapsible "Resource Types to Track" subsection so the user
 * can narrow which resource types feed this table. The subsection is closed
 * by default — the table reflects the *current* selection set.
 *
 * Returns `{ html, wireUp }` so the caller inserts the markup via innerHTML
 * then calls wireUp() to attach pagination / search / filter / checkbox /
 * stack-link / type-filter handlers.
 *
 * @param {Array}  filteredStacks  [{ meta, resources[] }] — one entry per stack
 *                                  that matched the current type selection.
 * @param {Object} report          impactReport — used for the type list in the
 *                                  collapsible filter subsection.
 * @param {Object} selectedSet     map {resourceType -> true} for currently-
 *                                  selected types (used to render checkbox state).
 */
function renderStacksRequiringReview(filteredStacks, report, selectedSet) {
  var totalTypes = report.allResourceTypes.length;
  var selectedCount = report.allResourceTypes.filter(function(t) { return selectedSet[t]; }).length;

  var html = '<div class="report-section stacks-requiring-review-section">';
  html += '<h3 class="report-section-title section-collapsible" role="button" tabindex="0" aria-expanded="true">';
  html += '<span class="section-collapse-chevron">\u25be</span> Stacks Requiring Review';
  html += '</h3>';
  html += '<div class="section-body" id="stacks-req-body">';

  // ── Filters block — groups the stack search / reviewed-filter dropdown and
  //    the Resource Types to Track collapsible under a single labeled container.
  //    Search goes first (primary action); type filter sits below (advanced).
  html += '<div class="filters-block">';
  html += '<div class="filters-label">Filters</div>';

  // Stack search + reviewed filter dropdown (always visible)
  html += '<div class="report-controls"><input type="text" id="stack-search" class="report-search" placeholder="Filter stacks...">';
  html += '<select id="stack-filter" class="report-select"><option value="all">All</option><option value="unreviewed" selected>Unreviewed</option><option value="reviewed">Reviewed</option></select></div>';

  // Collapsible Resource Types to Track subsection. The open/closed state is
  // persisted in module-level `typeFilterExpanded` so that ticking an
  // individual resource-type checkbox (which re-renders the whole impact
  // report) doesn't collapse the user's view.
  var openChev = typeFilterExpanded ? '\u25be' : '\u25b8';
  html += '<div class="type-filter-subsection">';
  html += '<div class="type-filter-toggle" role="button" tabindex="0" aria-expanded="' + (typeFilterExpanded ? 'true' : 'false') + '">';
  html += '<span class="type-filter-chevron">' + openChev + '</span> Resource Types to Track ';
  html += '<span class="type-filter-count">(' + selectedCount + ' of ' + totalTypes + ' selected)</span>';
  html += '</div>';
  html += '<div class="type-filter-body" id="type-filter-body"' + (typeFilterExpanded ? '' : ' hidden') + '>';
  // Bulk controls above the checkbox grid — Select all / Clear all.
  html += '<div class="type-filter-bulk">';
  html += '<button type="button" id="type-cb-select-all" class="page-btn">Select all</button>';
  html += '<button type="button" id="type-cb-clear-all" class="page-btn">Clear all</button>';
  html += '</div>';
  html += '<div class="type-filter-grid" id="type-filter-grid">';
  for (var ti = 0; ti < report.allResourceTypes.length; ti++) {
    var t = report.allResourceTypes[ti];
    var checked = selectedSet[t] ? ' checked' : '';
    html += '<label class="type-filter-item"><input type="checkbox" class="type-cb" data-type="' + esc(t) + '"' + checked + '><code>' + esc(t) + '</code></label>';
  }
  html += '</div>';
  html += '</div>';  // end .type-filter-body
  html += '</div>';

  html += '</div>'; // end .filters-block

  if (filteredStacks.length === 0) {
    // No stacks match — show a reassuring message and close both the
    // section-body and the outer report-section card.
    html += '<p class="report-ok">\u2705 No stacks match the current Resource Types to Track selection.</p>';
    html += '</div></div>';
    return { html: html, wireUp: function() { wireTypeFilter(); } };
  }

  html += '<table class="report-table destructive-table"><thead><tr><th>Stack</th><th>Reviewed</th></tr></thead><tbody id="stack-tbody"></tbody></table>';
  html += '<div class="report-pagination" id="stack-pagination"></div></div></div>';  // close section-body + report-section

  var PAGE_SIZE = 25;
  var stackPage = 0;
  var searchDebounce;

  function visibleStacks() {
    var searchVal = (document.getElementById('stack-search').value || '').toLowerCase();
    var filterVal = document.getElementById('stack-filter').value;
    return filteredStacks.filter(function(fs) {
      var k = fs.meta.section + '/' + fs.meta.name;
      if (filterVal === 'unreviewed' && reviewed[k]) return false;
      if (filterVal === 'reviewed' && !reviewed[k]) return false;
      if (searchVal && fs.meta.name.toLowerCase().indexOf(searchVal) === -1) return false;
      return true;
    });
  }

  /**
   * Render two <tr>s per stack (summary + expandable detail). Mirrors the
   * Critical Networking Changes layout exactly via the shared helpers.
   */
  function renderRow(fs) {
    var k = fs.meta.section + '/' + fs.meta.name;
    var detailHtml = fs.resources.map(function(r) {
      var impact = r.action === 'create' ? 'WILL_CREATE'
                 : r.action === 'delete' ? 'WILL_DESTROY'
                 : (r.changeImpact || 'WILL_UPDATE');
      return critDetailItemHtml({
        badgeHtml: impactBadge(impact),
        resourceType: r.resourceType,  // stacks-req shows full type (no shortType)
        logicalId: r.logicalId,
      });
    }).join('');
    return critExpandableRowHtml({
      key: k,
      stackName: fs.meta.name,
      isReviewed: reviewed[k],
      detailItemsHtml: detailHtml,
    });
  }

  function renderBody() {
    var tbody = document.getElementById('stack-tbody');
    var pagination = document.getElementById('stack-pagination');
    if (!tbody) return;

    var visible = visibleStacks();
    var totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    if (stackPage >= totalPages) stackPage = totalPages - 1;
    var pageItems = visible.slice(stackPage * PAGE_SIZE, (stackPage + 1) * PAGE_SIZE);

    tbody.innerHTML = pageItems.map(renderRow).join('');
    pagination.innerHTML = paginationFooterHtml(visible.length, stackPage, totalPages, 'page', 'stack');

    // Pagination buttons
    var prev = document.getElementById('page-prev');
    var next = document.getElementById('page-next');
    if (prev) prev.onclick = function() { stackPage--; renderBody(); };
    if (next) next.onclick = function() { stackPage++; renderBody(); };

    // Shared checkbox + stack-link + expand-chevron wiring (mirrors Critical Networking Changes)
    wireReviewCheckboxes(tbody);
    wireStackLinks(tbody);
    wireCritExpandChevrons(tbody);
  }

  /**
   * Hook up the Resource Types to Track subsection: the collapse toggle +
   * checkbox changes (which persist to localStorage and re-render the whole
   * impact report so filteredStacks recomputes).
   */
  function wireTypeFilter() {
    var toggle = document.querySelector('.type-filter-toggle');
    var body = document.getElementById('type-filter-body');
    if (toggle && body) {
      var chev = toggle.querySelector('.type-filter-chevron');
      toggle.onclick = function() {
        var open = !body.hidden;
        body.hidden = open;
        typeFilterExpanded = !body.hidden;  // preserve state for subsequent re-renders
        if (chev) chev.textContent = open ? '\u25b8' : '\u25be';
        toggle.setAttribute('aria-expanded', String(!open));
      };
      toggle.onkeydown = function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); }
      };
    }

    // Helper: write a new selection state for every type, persist, re-render.
    function setAllTypes(isSelected) {
      for (var i = 0; i < report.allResourceTypes.length; i++) {
        selectedTypes[report.allResourceTypes[i]] = isSelected;
      }
      localStorage.setItem('lza-diff-notable-types', JSON.stringify(selectedTypes));
      renderImpactReport();
    }

    // Select All button — always selects every type.
    var selectAll = document.getElementById('type-cb-select-all');
    if (selectAll) selectAll.onclick = function() { setAllTypes(true); };
    // Clear All button — always unchecks every type.
    var clearAll = document.getElementById('type-cb-clear-all');
    if (clearAll) clearAll.onclick = function() { setAllTypes(false); };

    // Individual checkboxes: mutate selectedTypes + persist + re-render the impact report
    document.querySelectorAll('#type-filter-grid .type-cb').forEach(function(cb) {
      cb.onchange = function() {
        selectedTypes[this.getAttribute('data-type')] = this.checked;
        localStorage.setItem('lza-diff-notable-types', JSON.stringify(selectedTypes));
        renderImpactReport();
      };
    });
  }

  function wireUp() {
    wireTypeFilter();
    var searchEl = document.getElementById('stack-search');
    var filterEl = document.getElementById('stack-filter');
    if (searchEl) {
      searchEl.oninput = function() {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(function() { stackPage = 0; renderBody(); }, 200);
      };
    }
    if (filterEl) filterEl.onchange = function() { stackPage = 0; renderBody(); };
    renderBody();
  }

  return { html: html, wireUp: wireUp };
}

// ── Sidebar ──────────────────────────────────────────────────────────────

/**
 * Apply the current sidebar filter + search to the full `stacks[]` list and
 * return the subset the user should see. Used by renderSidebar.
 *
 * @param {string} filter  one of 'all', 'changes', 'no-changes', 'reviewed', 'unreviewed'
 * @param {string} search  substring matched against stack name or section (case-insensitive)
 */
function getFiltered(filter, search) {
  var s = (search || '').toLowerCase();
  return stacks.filter(function(st) {
    var m = st.meta, k = m.section + '/' + m.name;
    if (filter === 'changes' && !m.hasChanges) return false;
    if (filter === 'no-changes' && m.hasChanges) return false;
    if (filter === 'reviewed' && !reviewed[k]) return false;
    if (filter === 'unreviewed' && reviewed[k]) return false;
    if (s && m.name.toLowerCase().indexOf(s) === -1 && m.section.toLowerCase().indexOf(s) === -1) return false;
    return true;
  });
}

/**
 * Rebuild the sidebar (stack list) from current state. Applies currentFilter +
 * search, groups by section, respects `collapsed[section]` for visibility, and
 * paginates each section at 500 items with a "Load more" button to keep DOM
 * size bounded for large deployments.
 */
function renderSidebar() {
  if (!dataReady) return;
  var filtered = getFiltered(currentFilter, document.getElementById('search').value);
  var groups = {};
  sectionOrder.forEach(function(s) { groups[s] = []; });
  filtered.forEach(function(st) { var sec = st.meta.section; if (!groups[sec]) groups[sec] = []; groups[sec].push(st); });

  var changedF = filtered.filter(function(st) { return st.meta.hasChanges; }).length;
  summaryEl.textContent = filtered.length + ' stacks \u00b7 ' + changedF + ' changed \u00b7 ' + (filtered.length - changedF) + ' unchanged';
  sidebarList.innerHTML = '';

  sectionOrder.forEach(function(section) {
    var items = groups[section];
    if (!items || items.length === 0) return;
    var changedCount = items.filter(function(st) { return st.meta.hasChanges; }).length;

    var header = document.createElement('div');
    header.className = 'section-header' + (collapsed[section] ? ' collapsed' : '');
    header.innerHTML = '<span><span class="section-chevron">\u25bc</span>' + esc(section) + '</span><span class="section-counts">' + changedCount + '/' + items.length + '</span>';
    var itemsUl = document.createElement('ul');
    itemsUl.className = 'section-items';
    itemsUl.style.display = collapsed[section] ? 'none' : '';
    header.onclick = function() { collapsed[section] = !collapsed[section]; header.classList.toggle('collapsed'); itemsUl.style.display = collapsed[section] ? 'none' : ''; };
    sidebarList.appendChild(header);

    var PAGE = 500, shown = 0;
    function loadPage() {
      var old = itemsUl.querySelector('.load-more-btn');
      if (old) old.remove();
      var end = Math.min(shown + PAGE, items.length);
      for (var i = shown; i < end; i++) {
        var st = items[i], m = st.meta, k = m.section + '/' + m.name;
        var li = document.createElement('li');
        li.className = 'sidebar-item' + (k === activeKey ? ' active' : '') + (reviewed[k] ? ' reviewed' : '');
        li.setAttribute('role', 'button'); li.setAttribute('tabindex', '0');
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.className = 'review-cb'; cb.checked = !!reviewed[k]; cb.title = 'Mark as reviewed';
        (function(key, cbRef, liRef) {
          cbRef.onclick = function(e) { e.stopPropagation(); reviewed[key] = cbRef.checked; liRef.classList.toggle('reviewed', cbRef.checked); if (currentFilter === 'reviewed' || currentFilter === 'unreviewed') renderSidebar(); };
        })(k, cb, li);
        var nameSpan = document.createElement('span');
        nameSpan.className = 'name'; nameSpan.title = m.name; nameSpan.textContent = m.name;
        var dot = document.createElement('span');
        dot.className = 'dot ' + (m.hasChanges ? 'changes' : 'no-changes');
        li.appendChild(cb); li.appendChild(nameSpan); li.appendChild(dot);
        (function(stackRef) { li.onclick = function() { showDiff(stackRef); }; })(st);
        itemsUl.appendChild(li);
      }
      shown = end;
      if (shown < items.length) {
        var more = document.createElement('li');
        more.className = 'sidebar-item load-more-btn';
        more.style.cssText = 'justify-content:center;color:var(--blue);cursor:pointer;font-size:0.78rem;padding:0.5rem';
        more.textContent = 'Load more (' + (items.length - shown) + ' remaining)';
        more.onclick = loadPage;
        itemsUl.appendChild(more);
      }
    }
    loadPage();
    sidebarList.appendChild(itemsUl);
  });
}

// ── Structured diff card rendering ───────────────────────────────────────

/** Flatten an object to dot-path leaf entries: { "a.b": "val" } */
function flattenObj(obj, prefix) {
  var out = {};
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== 'object') { out[prefix || ''] = obj; return out; }
  if (Array.isArray(obj)) { out[prefix || ''] = obj; return out; } // arrays handled separately
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], p = prefix ? prefix + '.' + k : k;
    var child = flattenObj(obj[k], p);
    var ck = Object.keys(child);
    for (var j = 0; j < ck.length; j++) out[ck[j]] = child[ck[j]];
  }
  return out;
}

/**
 * Stringify a leaf value for display in a diff line.
 * null/undefined → em-dash; objects/arrays → compact JSON; primitives → String(v).
 */
function leafVal(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Find a good identity key for array elements (e.g. "name", "Key", "key", "id", "logicalId").
 * Returns null if no consistent key found.
 */
function findArrayKey(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  var candidates = ['name', 'Name', 'Key', 'key', 'id', 'Id', 'logicalId', 'LogicalResourceId', 'ParameterKey'];
  for (var c = 0; c < candidates.length; c++) {
    var k = candidates[c];
    if (arr.every(function(el) { return el && typeof el === 'object' && !Array.isArray(el) && el[k] !== undefined; })) return k;
  }
  return null;
}

/**
 * Diff two arrays of objects by matching on an identity key.
 * Returns lines showing only what changed per element.
 */
function diffArrays(oldArr, newArr) {
  var idKey = findArrayKey(oldArr) || findArrayKey(newArr);
  if (!idKey) return null; // fall back to simple diff

  var oldMap = {}, newMap = {};
  (oldArr || []).forEach(function(el) { if (el[idKey] !== undefined) oldMap[el[idKey]] = el; });
  (newArr || []).forEach(function(el) { if (el[idKey] !== undefined) newMap[el[idKey]] = el; });

  var allIds = {};
  Object.keys(oldMap).forEach(function(k) { allIds[k] = true; });
  Object.keys(newMap).forEach(function(k) { allIds[k] = true; });
  var sorted = Object.keys(allIds).sort();

  var lines = [];
  for (var i = 0; i < sorted.length; i++) {
    var id = sorted[i];
    var oel = oldMap[id], nel = newMap[id];
    if (!oel) {
      // Entire element added
      lines.push('<div class="vd-added">+ [' + esc(idKey) + '=' + esc(id) + '] ' + esc(JSON.stringify(nel)) + '</div>');
    } else if (!nel) {
      // Entire element removed
      lines.push('<div class="vd-removed">- [' + esc(idKey) + '=' + esc(id) + '] ' + esc(JSON.stringify(oel)) + '</div>');
    } else {
      // Both exist — diff their fields
      var oFlat = flattenObj(oel, '');
      var nFlat = flattenObj(nel, '');
      var fKeys = {};
      Object.keys(oFlat).forEach(function(k) { fKeys[k] = true; });
      Object.keys(nFlat).forEach(function(k) { fKeys[k] = true; });
      var changed = [];
      Object.keys(fKeys).sort().forEach(function(fk) {
        if (fk === idKey) return; // skip the identity key itself
        var ov = oFlat[fk], nv = nFlat[fk];
        if (leafVal(ov) !== leafVal(nv)) {
          if (ov === undefined) changed.push({ op: '+', key: fk, val: nv });
          else if (nv === undefined) changed.push({ op: '-', key: fk, val: ov });
          else { changed.push({ op: '-', key: fk, val: ov }); changed.push({ op: '+', key: fk, val: nv }); }
        }
      });
      if (changed.length > 0) {
        lines.push('<div class="vd-context">[' + esc(idKey) + '=' + esc(id) + ']</div>');
        for (var c = 0; c < changed.length; c++) {
          var ch = changed[c];
          var cls = ch.op === '+' ? 'vd-added' : 'vd-removed';
          lines.push('<div class="' + cls + '">  ' + ch.op + ' ' + esc(ch.key + ': ' + leafVal(ch.val)) + '</div>');
        }
      }
    }
  }
  return lines.length > 0 ? lines.join('') : null;
}

/**
 * Render a human-readable diff of two values.
 * For objects, flattens to dot-paths and only shows paths that changed.
 * For arrays of objects, matches by identity key and diffs per-element.
 */
function renderValueDiff(oldVal, newVal) {
  if (oldVal === undefined && newVal === undefined) return '';
  if (oldVal === undefined || oldVal === null) {
    if (typeof newVal === 'object' && newVal !== null && !Array.isArray(newVal)) {
      var flat = flattenObj(newVal, '');
      return Object.keys(flat).sort().map(function(k) {
        return '<div class="vd-added">+ ' + esc(k ? k + ': ' : '') + esc(leafVal(flat[k])) + '</div>';
      }).join('');
    }
    return '<div class="vd-added">+ ' + esc(leafVal(newVal)) + '</div>';
  }
  if (newVal === undefined || newVal === null) {
    if (typeof oldVal === 'object' && oldVal !== null && !Array.isArray(oldVal)) {
      var flat = flattenObj(oldVal, '');
      return Object.keys(flat).sort().map(function(k) {
        return '<div class="vd-removed">- ' + esc(k ? k + ': ' : '') + esc(leafVal(flat[k])) + '</div>';
      }).join('');
    }
    return '<div class="vd-removed">- ' + esc(leafVal(oldVal)) + '</div>';
  }
  // Both primitives
  if (typeof oldVal !== 'object' && typeof newVal !== 'object') {
    if (String(oldVal) === String(newVal)) return '<div class="vd-unchanged">' + esc(String(oldVal)) + '</div>';
    return '<div class="vd-removed">- ' + esc(String(oldVal)) + '</div><div class="vd-added">+ ' + esc(String(newVal)) + '</div>';
  }
  // Arrays — try smart element matching
  if (Array.isArray(oldVal) || Array.isArray(newVal)) {
    var oa = Array.isArray(oldVal) ? oldVal : [];
    var na = Array.isArray(newVal) ? newVal : [];
    // Primitive arrays: show added/removed values directly (set-style diff)
    var allPrim = oa.concat(na).every(function(e) { return typeof e !== 'object' || e === null; });
    if (allPrim) {
      var oldSet = {}, newSet = {};
      oa.forEach(function(e) { oldSet[String(e)] = true; });
      na.forEach(function(e) { newSet[String(e)] = true; });
      var lines = [];
      oa.forEach(function(e) { if (!newSet[String(e)]) lines.push('<div class="vd-removed">- ' + esc(String(e)) + '</div>'); });
      na.forEach(function(e) { if (!oldSet[String(e)]) lines.push('<div class="vd-added">+ ' + esc(String(e)) + '</div>'); });
      return lines.length > 0 ? lines.join('') : '<div class="vd-unchanged">(unchanged)</div>';
    }
    var arrResult = diffArrays(oldVal, newVal);
    if (arrResult) return arrResult;
    // Fallback: stringify comparison
    var os = JSON.stringify(oldVal), ns = JSON.stringify(newVal);
    if (os === ns) return '<div class="vd-unchanged">(unchanged)</div>';
    return '<div class="vd-removed">- ' + esc(os) + '</div><div class="vd-added">+ ' + esc(ns) + '</div>';
  }
  // Both objects — flatten and show ONLY changed paths
  var oldFlat = flattenObj(oldVal, '');
  var newFlat = flattenObj(newVal, '');
  var allKeys = {};
  Object.keys(oldFlat).forEach(function(k) { allKeys[k] = true; });
  Object.keys(newFlat).forEach(function(k) { allKeys[k] = true; });
  var sorted = Object.keys(allKeys).sort();
  var lines = [];
  for (var i = 0; i < sorted.length; i++) {
    var k = sorted[i];
    var ov = oldFlat[k], nv = newFlat[k];
    var label = k ? k + ': ' : '';
    if (ov === undefined) {
      lines.push('<div class="vd-added">+ ' + esc(label + leafVal(nv)) + '</div>');
    } else if (nv === undefined) {
      lines.push('<div class="vd-removed">- ' + esc(label + leafVal(ov)) + '</div>');
    } else if (leafVal(ov) !== leafVal(nv)) {
      lines.push('<div class="vd-removed">- ' + esc(label + leafVal(ov)) + '</div>');
      lines.push('<div class="vd-added">+ ' + esc(label + leafVal(nv)) + '</div>');
    }
  }
  if (lines.length === 0) return '<div class="vd-unchanged">(no leaf changes)</div>';
  return lines.join('');
}

/**
 * Render a unified JSON diff with line-level highlighting.
 * Uses LCS (longest common subsequence) to compute the diff.
 */
function renderJsonDiff(oldVal, newVal) {
  var oldLines = oldVal ? JSON.stringify(oldVal, null, 2).split('\n') : [];
  var newLines = newVal ? JSON.stringify(newVal, null, 2).split('\n') : [];

  // Compute LCS table on trimmed lines
  var m = oldLines.length, n = newLines.length;
  var lcs = [];
  for (var i = 0; i <= m; i++) {
    lcs[i] = new Array(n + 1).fill(0);
  }
  for (var i = 1; i <= m; i++) {
    for (var j = 1; j <= n; j++) {
      if (oldLines[i - 1].trim() === newLines[j - 1].trim()) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  var result = [];
  var i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1].trim() === newLines[j - 1].trim()) {
      result.unshift({ type: ' ', text: newLines[j - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      result.unshift({ type: '+', text: newLines[j - 1] });
      j--;
    } else if (i > 0) {
      result.unshift({ type: '-', text: oldLines[i - 1] });
      i--;
    }
  }

  var oldJson = oldVal ? JSON.stringify(oldVal, null, 2) : '';
  var newJson = newVal ? JSON.stringify(newVal, null, 2) : '';
  var copyId = 'jdcopy-' + (propUid++);

  var html = '<div class="jd-toolbar">';
  if (oldJson) html += '<button class="jd-copy" data-copy-id="' + copyId + '-old" title="Copy deployed JSON">\ud83d\udccb Old</button>';
  if (newJson) html += '<button class="jd-copy" data-copy-id="' + copyId + '-new" title="Copy new JSON">\ud83d\udccb New</button>';
  html += '</div>';
  html += '<pre class="json-diff">';
  for (var r = 0; r < result.length; r++) {
    var line = result[r];
    var cls = line.type === '+' ? 'jd-add' : line.type === '-' ? 'jd-rem' : 'jd-ctx';
    html += '<div class="' + cls + '">' + esc(line.type + ' ' + line.text) + '</div>';
  }
  html += '</pre>';
  if (oldJson) html += '<textarea class="jd-hidden" id="' + copyId + '-old">' + esc(oldJson) + '</textarea>';
  if (newJson) html += '<textarea class="jd-hidden" id="' + copyId + '-new">' + esc(newJson) + '</textarea>';
  return html;
}

var propUid = 0;

/**
 * Render a single property's diff row: name + action badge on top, then either
 * a flattened "only changed paths" diff (small values) or a full JSON diff in
 * an expandable `<details>` element (large/complex values).
 */
function renderPropertyRow(propName, pv) {
  var uid = propUid++;
  var h = '<div class="sd-prop">';
  h += '<div class="sd-prop-header">';
  h += '<code class="sd-prop-name">' + esc(propName) + '</code>';
  if (pv.changeImpact) h += ' ' + impactBadge(pv.changeImpact);
  h += '</div>';
  // For large complex values, render as JSON diff only (no flattened text)
  var oldSize = pv.oldValue !== undefined ? JSON.stringify(pv.oldValue).length : 0;
  var newSize = pv.newValue !== undefined ? JSON.stringify(pv.newValue).length : 0;
  var isComplex = (oldSize + newSize) > 500 &&
    ((pv.oldValue !== undefined && typeof pv.oldValue === 'object') || (pv.newValue !== undefined && typeof pv.newValue === 'object'));
  if (isComplex) {
    h += '<details class="sd-prop-raw" open><summary>JSON Diff</summary>';
    h += renderJsonDiff(pv.oldValue, pv.newValue);
    h += '</details>';
  } else {
    h += '<div class="sd-prop-diff">' + renderValueDiff(pv.oldValue, pv.newValue) + '</div>';
  }
  h += '</div>';
  return h;
}

/**
 * Render one resource card inside a stack detail view. Outer card gets a red
 * border when the change is destructive (delete, replace, may-replace, orphan
 * — including property-level WILL_REPLACE / MAY_REPLACE that force replacement).
 * Header toggles an inner body with replacement banners, per-property diffs,
 * and an expandable full-resource JSON diff.
 *
 * @param res  ResourceChange from StructuredStackDiff
 * @param idx  index within the current card list; used to generate unique DOM ids
 */
function renderResourceCard(res, idx) {
  var props = Object.keys(res.properties);
  var propertyProps = props.filter(function(p) { return res.properties[p].isProperty !== false; });
  var hasProps = propertyProps.length > 0;
  var hasJson = res.oldResource || res.newResource;

  // Detect replacement impact (split into definite vs conditional)
  var willReplaceProps = propertyProps.filter(function(p) { return res.properties[p].changeImpact === 'WILL_REPLACE'; });
  var mayReplaceProps = propertyProps.filter(function(p) { return res.properties[p].changeImpact === 'MAY_REPLACE'; });
  var willReplace = willReplaceProps.length > 0 || res.changeImpact === 'WILL_REPLACE';
  var mayReplace = mayReplaceProps.length > 0 || res.changeImpact === 'MAY_REPLACE';
  var hasReplace = willReplace || mayReplace;
  // A change is destructive if it deletes, replaces (definite or conditional), or orphans the resource
  var isDestructive = hasReplace
    || res.action === 'delete'
    || res.changeImpact === 'WILL_DESTROY'
    || res.changeImpact === 'WILL_ORPHAN';

  var h = '<div class="sd-resource' + (isDestructive ? ' sd-destructive' : '') + (hasReplace ? ' sd-will-replace' : '') + '">';
  h += '<div class="sd-resource-header sd-expandable" data-idx="' + idx + '">';
  h += '<span class="sd-chevron">\u25b6</span>';
  h += impactBadge(res.changeImpact);
  h += ' <code class="sd-type">' + esc(res.resourceType) + '</code>';
  h += ' <span class="sd-logicalid">' + esc(res.logicalId) + '</span>';
  if (hasProps) h += ' <span class="sd-prop-count">(' + propertyProps.length + ' prop' + (propertyProps.length === 1 ? '' : 's') + ')</span>';
  if (willReplace && willReplaceProps.length > 0) h += ' <span class="sd-replace-warning" title="Will cause resource replacement">\u26a0\ufe0f Replaces on: ' + esc(willReplaceProps.join(', ')) + '</span>';
  else if (mayReplace && mayReplaceProps.length > 0) h += ' <span class="sd-replace-warning" title="May cause resource replacement">\u26a0\ufe0f May replace on: ' + esc(mayReplaceProps.join(', ')) + '</span>';
  h += '</div>';
  h += '<div class="sd-resource-body" id="sd-props-' + idx + '" style="display:none">';
  if (willReplace) {
    h += '<div class="sd-replace-banner"><strong>\u26a0\ufe0f Resource replacement:</strong> This change <strong>will</strong> delete and recreate the resource. Any data or state tied to the physical resource will be lost.</div>';
  } else if (mayReplace) {
    h += '<div class="sd-replace-banner"><strong>\u26a0\ufe0f Possible replacement:</strong> This change <strong>may</strong> delete and recreate the resource depending on the actual value at deploy time. Review carefully before deploying.</div>';
  }
  if (hasProps) {
    for (var i = 0; i < propertyProps.length; i++) {
      h += renderPropertyRow(propertyProps[i], res.properties[propertyProps[i]]);
    }
  }
  if (hasJson) {
    h += '<details class="sd-resource-raw"' + (!hasProps ? ' open' : '') + '><summary>JSON Diff</summary>';
    h += renderJsonDiff(res.oldResource, res.newResource);
    h += '</details>';
  }
  h += '</div></div>';
  return h;
}

/**
 * Render a collapsible section listing SectionChange[] items (used for
 * Parameters / Conditions / Outputs in a stack detail view).
 * Each item shows its key name and a value diff (flattened + optional JSON).
 */
function renderSectionTable(title, items) {
  if (!items || items.length === 0) return '';
  var h = '<div class="sd-section">';
  h += '<div class="sd-section-title sd-section-toggle"><span class="sd-sec-chevron">\u25bc</span> ' + esc(title) + ' (' + items.length + ')</div>';
  h += '<div class="sd-section-body">';
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    h += '<div class="sd-prop">';
    h += '<div class="sd-prop-header"><code class="sd-prop-name">' + esc(item.key) + '</code></div>';
    h += '<div class="sd-prop-diff">' + renderValueDiff(item.oldValue, item.newValue) + '</div>';
    if ((item.oldValue !== undefined && typeof item.oldValue === 'object') || (item.newValue !== undefined && typeof item.newValue === 'object')) {
      h += '<details class="sd-prop-raw"><summary>JSON Diff</summary>';
      h += renderJsonDiff(item.oldValue, item.newValue);
      h += '</details>';
    }
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

/**
 * Render a CDK-provided policy-change table (IAM statements or Security Group
 * rules). Input shape: `[header, ...rows]` where each row is `[op, ...cells]`
 * and `op` is `'+'`, `'-'`, or `''`. Additions/removals get coloured row
 * backgrounds; the op marker column shows + / −.
 */
function renderPolicyTable(title, table) {
  if (!table || table.length < 2) return '';
  var header = table[0];
  var rows = table.slice(1);
  // Count additions and removals
  var adds = 0, rems = 0;
  rows.forEach(function(r) { if (r[0] === '+') adds++; else if (r[0] === '-') rems++; });
  var h = '<div class="sd-section">';
  h += '<div class="sd-section-title sd-section-toggle"><span class="sd-sec-chevron">\u25bc</span> ' + esc(title);
  h += ' <span class="sd-policy-counts">';
  if (adds > 0) h += '<span class="sd-pcount-add">+' + adds + '</span> ';
  if (rems > 0) h += '<span class="sd-pcount-rem">-' + rems + '</span>';
  h += '</span></div>';
  h += '<div class="sd-section-body">';
  h += '<table class="sd-policy-table"><thead><tr>';
  h += '<th class="sd-pol-marker"></th>';
  for (var i = 1; i < header.length; i++) h += '<th>' + esc(header[i]) + '</th>';
  h += '</tr></thead><tbody>';
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var cls = row[0] === '+' ? 'sd-pol-add' : row[0] === '-' ? 'sd-pol-rem' : '';
    h += '<tr class="' + cls + '"><td class="sd-pol-marker">' + esc(row[0] || ' ') + '</td>';
    for (var c = 1; c < row.length; c++) h += '<td>' + esc(row[c] || '') + '</td>';
    h += '</tr>';
  }
  h += '</tbody></table></div></div>';
  return h;
}

/**
 * Assemble the full body of a stack-detail card: Parameters, Conditions, IAM
 * and SG change tables, the Resources list (noise segregated), and Outputs.
 * Noise resources are placed in a collapsed section at the bottom.
 */
function renderDiffBody(diff) {
  if (diff.isEmpty) return '<p class="report-ok">No differences</p>';

  var notable = diff.resources.filter(function(r) { return !isNoise(r); });
  var noise = diff.resources.filter(isNoise);
  var h = '';

  h += renderSectionTable('Parameters', diff.parameters);
  h += renderSectionTable('Conditions', diff.conditions);

  // IAM and Security Group changes (from CDK's specialized summarizers)
  h += renderPolicyTable('IAM Statement Changes', diff.iamStatements);
  h += renderPolicyTable('Security Group Rule Changes', diff.securityGroupRules);

  if (notable.length > 0) {
    h += '<div class="sd-section">';
    h += '<div class="sd-section-title sd-section-toggle"><span class="sd-sec-chevron">\u25bc</span> Resources (' + notable.length + ')</div>';
    h += '<div class="sd-section-body">';
    for (var i = 0; i < notable.length; i++) h += renderResourceCard(notable[i], i);
    h += '</div></div>';
  }

  h += renderSectionTable('Outputs', diff.outputs);

  if (noise.length > 0) {
    h += '<div class="sd-section sd-collapsed">';
    h += '<div class="sd-section-title sd-section-toggle"><span class="sd-sec-chevron">\u25b6</span> Noise (' + noise.length + ' resources)</div>';
    h += '<div class="sd-section-body" style="display:none">';
    for (var n = 0; n < noise.length; n++) h += renderResourceCard(noise[n], 'n' + n);
    h += '</div></div>';
  }

  return h;
}

// ── Module runner dry-run rendering ──────────────────────────────────────

/**
 * Decompress the `moduleBlob` global into a ModuleDiff[]. Returns [] when the
 * blob is absent (older payloads) or fails to decode — module output is
 * supplementary, so a decode failure must not block the stack diff view.
 */
async function decompressModuleBlob() {
  if (typeof moduleBlob === 'undefined' || !moduleBlob) return [];
  try {
    return await decompressBlob(moduleBlob);
  } catch (e) {
    return [];
  }
}

/**
 * Build pseudo-stack entries from decompressed module diffs so module runner
 * dry-run output flows through the exact same sidebar / filter / review
 * machinery as CDK stack diffs. Each entry is tagged `module: true` and carries
 * the raw (ANSI-stripped) dry-run text in `content` instead of a structured
 * `diff`. Grouped under the "Modules" sidebar section. Returns [] when there
 * are no module diffs.
 */
function buildModuleStacks(mods) {
  if (!mods || !mods.length) return [];
  return mods.map(function(md) {
    return {
      meta: { section: 'Modules', name: md.name, hasChanges: !!md.hasChanges, account: '', region: '' },
      module: true,
      content: md.content || '',
    };
  });
}

/**
 * Classify a module dry-run line for colorization. Added lines (`[+]` / `+`)
 * render blue, removed lines (`[-]` / `-`) red, everything else muted context.
 * Mirrors the vd-added / vd-removed palette used by structured diffs.
 *
 * NOTE: hand-mirrored copy of classifyModuleLine() in generate-diff-viewer.ts
 * (the canonical, unit-tested implementation). Keep the two in sync — this
 * script is inlined verbatim into the HTML and cannot import the TS module.
 */
function moduleLineClass(line) {
  var t = line.replace(/^\s+/, '');
  if (t.indexOf('[+]') === 0 || t.charAt(0) === '+') return 'module-add';
  if (t.indexOf('[-]') === 0 || t.charAt(0) === '-') return 'module-del';
  return 'module-ctx';
}

/**
 * Render a module pseudo-stack's dry-run output as a colorized <pre> block.
 * Content is already ANSI-stripped server-side; we escape every line and wrap
 * it in a span so `<`, `>`, `&`, quotes cannot break out of the markup.
 */
function renderModuleBody(stackData) {
  var content = stackData.content || '';
  var h = '<div class="sd-section">';
  h += '<div class="sd-section-title">Module Dry-Run Output</div>';
  h += '<div class="sd-section-body">';
  if (!content.trim()) {
    h += '<p class="report-ok">No module dry-run output.</p>';
  } else {
    var lines = content.split('\n');
    var body = '';
    for (var i = 0; i < lines.length; i++) {
      body += '<span class="' + moduleLineClass(lines[i]) + '">' + esc(lines[i]) + '</span>\n';
    }
    h += '<pre class="module-diff">' + body + '</pre>';
  }
  h += '</div></div>';
  return h;
}

// ── Show diff detail ─────────────────────────────────────────────────────

/**
 * Open the full stack detail view for `stackData`. Awaits dataPromise if
 * decompression is still in progress. Ensures the stack is visible in the
 * sidebar (expands its section, switches filter to All if filtered out),
 * builds the detail card lazily (cached in cardCache), and scrolls to top.
 */
async function showDiff(stackData) {
  var m = stackData.meta;
  var key = m.section + '/' + m.name;
  activeKey = key;

  // Expand section
  if (collapsed[m.section]) { collapsed[m.section] = false; renderSidebar(); }

  // If filter hides this stack, switch to 'all'
  // Check whether the stack currently appears in the sidebar list. Iterate rather
  // than build a selector string so special characters in stack names cannot corrupt
  // the CSS selector syntax.
  var matchingItem = null;
  var nameNodes = sidebarList.querySelectorAll('.sidebar-item .name');
  for (var ni = 0; ni < nameNodes.length; ni++) {
    if (nameNodes[ni].title === m.name) { matchingItem = nameNodes[ni]; break; }
  }
  if (!matchingItem) {
    currentFilter = 'all';
    document.querySelectorAll('.filter-option').forEach(function(b) { b.classList.remove('active'); });
    var allBtn = document.querySelector('.filter-option[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');
    document.getElementById('filter-label').textContent = 'All';
    renderSidebar();
  }

  // Highlight active sidebar item
  sidebarList.querySelectorAll('.sidebar-item').forEach(function(el) {
    var nameEl = el.querySelector('.name');
    el.classList.toggle('active', !!(nameEl && nameEl.title === m.name));
  });
  var found = sidebarList.querySelector('.sidebar-item.active');
  if (found) found.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  // Wait for data if needed
  if (!dataReady) await dataPromise;

  // Build card (cached)
  if (!cardCache[key]) {
    var card = document.createElement('div');
    card.className = 'diff-card open';
    var bodyHtml = stackData.module ? renderModuleBody(stackData) : renderDiffBody(stackData.diff);
    card.innerHTML = '<div class="diff-header" role="button" tabindex="0" aria-expanded="true">' +
      '<div class="diff-title"><span class="chevron">\u25b6</span>' + esc(m.name) + '</div>' +
      '<span class="badge ' + (m.hasChanges ? 'changes' : 'no-changes') + '">' + (m.hasChanges ? 'Changes' : 'No Changes') + '</span>' +
      '</div><div class="diff-body">' + bodyHtml + '</div>';

    // Toggle card open/close
    card.querySelector('.diff-header').onclick = function() {
      card.classList.toggle('open');
      this.setAttribute('aria-expanded', card.classList.contains('open'));
    };
    // Expand/collapse resource properties
    card.querySelectorAll('.sd-expandable').forEach(function(hdr) {
      hdr.onclick = function() {
        var idx = this.getAttribute('data-idx');
        var props = document.getElementById('sd-props-' + idx);
        if (!props) return;
        var open = props.style.display !== 'none';
        props.style.display = open ? 'none' : '';
        var chev = this.querySelector('.sd-chevron');
        if (chev) chev.textContent = open ? '\u25b6' : '\u25bc';
      };
    });
    // Section collapse/expand toggles
    card.querySelectorAll('.sd-section-toggle').forEach(function(hdr) {
      hdr.style.cursor = 'pointer';
      hdr.onclick = function() {
        var section = this.closest('.sd-section');
        var body = section.querySelector('.sd-section-body');
        var chev = this.querySelector('.sd-sec-chevron');
        var isHidden = body.style.display === 'none';
        body.style.display = isHidden ? '' : 'none';
        chev.textContent = isHidden ? '\u25bc' : '\u25b6';
      };
    });
    // Copy JSON buttons — use the shared copyText helper for clipboard + fallback
    card.querySelectorAll('.jd-copy').forEach(function(btn) {
      btn.onclick = function() {
        var src = document.getElementById(this.getAttribute('data-copy-id'));
        if (!src) return;
        copyText(src.value).then(function() {
          var orig = btn.textContent;
          btn.textContent = '\u2713';
          setTimeout(function() { btn.textContent = orig; }, 1500);
        });
      };
    });
    cardCache[key] = card;
  }

  container.innerHTML = '';
  var back = document.createElement('a');
  back.href = '#'; back.className = 'back-to-summary'; back.textContent = '\u2190 Back to Summary';
  back.onclick = function(e) { e.preventDefault(); renderImpactReport(); };
  container.appendChild(back);
  container.appendChild(cardCache[key]);
  mainEl.scrollTop = 0;
}

// ── Event listeners ──────────────────────────────────────────────────────

/** Clear the main content area and re-render the sidebar — used whenever the sidebar filter or search changes. */
function applyFilter() { activeKey = null; container.innerHTML = ''; renderSidebar(); }

(function setupEventListeners() {
  document.querySelectorAll('.filter-option').forEach(function(btn) {
    btn.onclick = function() {
      document.querySelectorAll('.filter-option').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active'); currentFilter = btn.dataset.filter;
      document.getElementById('filter-label').textContent = btn.textContent;
      document.getElementById('filter-overlay').classList.remove('open'); applyFilter();
    };
  });
  var filterOverlay = document.getElementById('filter-overlay');
  document.getElementById('filter-toggle').onclick = function() { filterOverlay.classList.add('open'); };
  document.getElementById('filter-close').onclick = function() { filterOverlay.classList.remove('open'); };
  filterOverlay.onclick = function(e) { if (e.target === filterOverlay) filterOverlay.classList.remove('open'); };
  document.getElementById('search').oninput = function() { clearTimeout(searchTimeout); searchTimeout = setTimeout(applyFilter, 200); };
  document.getElementById('summary-link').onclick = function() { activeKey = null; sidebarList.querySelectorAll('.sidebar-item').forEach(function(el) { el.classList.remove('active'); }); renderImpactReport(); };

  var themeBtn = document.getElementById('theme-toggle');
  if (localStorage.getItem('cdk-diff-theme') === 'light') { document.documentElement.setAttribute('data-theme', 'light'); themeBtn.textContent = '\ud83c\udf19'; }
  themeBtn.onclick = function() {
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) { document.documentElement.removeAttribute('data-theme'); themeBtn.textContent = '\u2600\ufe0f'; localStorage.setItem('cdk-diff-theme', 'dark'); }
    else { document.documentElement.setAttribute('data-theme', 'light'); themeBtn.textContent = '\ud83c\udf19'; localStorage.setItem('cdk-diff-theme', 'light'); }
  };

  var helpOverlay = document.getElementById('help-overlay');
  document.getElementById('help-toggle').onclick = function() { helpOverlay.classList.add('open'); };
  document.getElementById('help-close').onclick = function() { helpOverlay.classList.remove('open'); };
  helpOverlay.onclick = function(e) { if (e.target === helpOverlay) helpOverlay.classList.remove('open'); };

  var handle = document.getElementById('resize-handle'), sidebar = document.querySelector('.sidebar'), resizing = false;
  handle.onmousedown = function(e) { resizing = true; handle.classList.add('dragging'); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; e.preventDefault(); };
  document.onmousemove = function(e) { if (resizing) sidebar.style.width = Math.min(Math.max(200, e.clientX), window.innerWidth * 0.6) + 'px'; };
  document.onmouseup = function() { if (resizing) { resizing = false; handle.classList.remove('dragging'); document.body.style.cursor = ''; document.body.style.userSelect = ''; } };

  // Sidebar collapse/expand — persists in localStorage so the preference
  // survives reload. Collapsed mode hides everything except the top-edge
  // expand button (.sidebar-expand-btn) which lives outside .sidebar.
  var collapseBtn = document.getElementById('sidebar-collapse-btn');
  var expandBtn = document.getElementById('sidebar-expand-btn');
  function setSidebarCollapsed(collapsed) {
    sidebar.classList.toggle('collapsed', collapsed);
    if (handle) handle.style.display = collapsed ? 'none' : '';
    if (expandBtn) expandBtn.style.display = collapsed ? 'block' : 'none';
    localStorage.setItem('lza-diff-sidebar-collapsed', collapsed ? '1' : '0');
  }
  if (localStorage.getItem('lza-diff-sidebar-collapsed') === '1') setSidebarCollapsed(true);
  else setSidebarCollapsed(false);
  if (collapseBtn) collapseBtn.onclick = function() { setSidebarCollapsed(true); };
  if (expandBtn) expandBtn.onclick = function() { setSidebarCollapsed(false); };
})();
