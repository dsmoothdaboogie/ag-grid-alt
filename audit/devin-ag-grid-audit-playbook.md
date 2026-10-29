# Playbook: AG Grid Enterprise usage audit

## Overview

Take an inventory of how the selected repositories use AG Grid Enterprise features. The team will use it to size the work of replacing Enterprise with an in-house library built on AG Grid Community (MIT).

This is read-only analysis:
1. Run the scanner provided in the Appendix.
2. Check its findings by reading the code.
3. Deliver a report.

You do not change any repository.

## What's Needed From User

- The repositories to analyze, selected for this session.
- Optional: repos or paths to skip (e.g. archived apps), and the names of any internal shared grid wrapper libraries.

## Procedure

### 1. Set up

1. Find out which repositories are in this session and where they are cloned (usually under `~/repos/`). List them in your first message.
2. Check that `node --version` is 16 or newer. If Node is missing or older, install a current LTS release (e.g. with nvm). Do not install anything inside the repos.
3. Create `~/ag-grid-audit/`, outside every repo. Save the script from the Appendix there exactly as given, as `~/ag-grid-audit/ag-grid-audit.mjs`. Do not edit it.

### 2. Identify the apps

An "app" is a deployable frontend or a shared library that uses AG Grid. In each repo:

- Find the package.json files that depend on AG Grid:
  `grep -rlE --include=package.json --exclude-dir=node_modules '"(ag-grid|@ag-grid-)' <repo>`
- **Single-app repo:** the repo root is the app.
- **Monorepo** (Nx `apps/` and `libs/`, an Angular workspace with several `projects`, npm/yarn/pnpm workspaces): every app or library that uses AG Grid is its own app. In Nx and Angular workspaces the dependencies usually live only in the root package.json. In that case, pick the `apps/*`, `libs/*` or `projects/*` folders whose source imports AG Grid:
  `grep -rlE --exclude-dir=node_modules "from ['\"](ag-grid|@ag-grid-)" <folder>`
- Label each app `<repo>-<app>` and pass it as `<label>=<path>`, e.g. `billing-web=$HOME/repos/billing/apps/web`.
- Include shared libraries, such as an internal grid wrapper, as apps of their own. They often matter most.
- If a repo contains a vendored copy of AG Grid (e.g. under `vendor/` or `assets/`), exclude it with `--exclude <path-fragment>`. Do not read it.

### 3. Run the scan

Run it once over all apps, so the summary includes the feature × app table:

```bash
cd ~/ag-grid-audit
node ag-grid-audit.mjs <label>=<path> <label>=<path> ... --context --out ~/ag-grid-audit/report
```

This writes `ag-grid-audit-summary.md`, `ag-grid-audit-details.md` and `ag-grid-audit.json` into `~/ag-grid-audit/report/`.

### 4. Check the findings

The scanner matches text patterns line by line. Some hits will be false positives, such as a `pivot:` or `aggFunc:` key on an object that has nothing to do with the grid. Some real usage will be invisible to it.

For each feature in `ag-grid-audit-details.md`, per app:
1. Open up to 5 hits; if there are fewer than 10, open all of them. Classify each hit as confirmed or false positive.
2. If most of the sampled hits are false positives, check every hit for that feature in that app.
3. Record the number of confirmed files for each feature in each app.

Then look for usage the scanner can't see:
- **Shared wrappers:** an internal component, directive or service that wraps AG Grid and sets enterprise options or registers enterprise modules for everything that uses it. Count how many grids and apps consume it. Each consumer inherits those features even though its own code shows none.
- **Options built at runtime:** gridOptions or colDefs built from config files, JSON, server responses, or spread from shared defaults (`...defaultGridOptions`). Check those sources.
- **Options split across lines:** e.g. `rowModelType:` on one line and `'serverSide'` on the next.
- **Enterprise imported but unused:** an app imports `ag-grid-enterprise` or `AllEnterpriseModule` but shows no confirmed feature usage. Mark it "likely Community-ready". Do not remove anything to test this.

### 5. Write the final report

Create `~/ag-grid-audit/report/ag-grid-audit-final.md` with these sections:

1. **Scope:** the repos and apps analyzed (label → repo/path). For each app, give the AG Grid version, taken from the lockfile when package.json uses a range. Also list anything excluded, and why.
2. **Feature usage (checked):** the scanner's feature table plus `Confirmed files` and `Notes` columns. Move features with no confirmed usage to a "Not used" list.
3. **Feature × app table** using confirmed counts.
4. **Migration readiness:** put each app in exactly one bucket:
   - **A:** no enterprise features; can switch to Community now
   - **B:** tier 1 features only
   - **C:** uses at least one tier 2 feature, but no tier 3 features
   - **D:** uses at least one tier 3 feature (row grouping, pivoting, server-side row model, viewport row model, integrated charts)
5. **Shared wrappers and hidden usage** found in step 4.
6. **Upgrade blockers:** apps on AG Grid below v31 or still using `columnApi` (see the scanner's Notes section).
7. **Open questions** for the team.

The report may contain counts, AG Grid option and API names, and repo/app paths. It must not contain source code excerpts.

### 6. Deliver

Attach the four files in `~/ag-grid-audit/report/` to the session. Post a short message covering:
- the number of repos and apps analyzed
- the top 5 features by confirmed files
- how many apps fall in each readiness bucket
- the biggest risk you found

## Specifications

- Every selected repo appears in the Scope section, even if it doesn't use AG Grid.
- Every feature the scanner detected has either a confirmed file count or is marked as a false positive, with the reason.
- Every app is in exactly one readiness bucket.
- `git status` is clean in every repo at the end.

## Advice and Pointers

- Tiers describe how hard a feature is to rebuild on top of AG Grid Community:
  - **1:** a custom component or export hook on Community's public API
  - **2:** needs a coordinating layer around the grid (data transforms, full-width rows, overlays)
  - **3:** replaces a core subsystem (row model, grouping pipeline, charting)
- Test and spec files count as usage, because they will need updating too. Note any feature that appears only in tests.
- If Storybook, demo or example folders inflate the counts, report them separately.
- If you find usage the scanner missed, record it in Notes. Do not change the script; keeping it unchanged makes runs comparable across teams and over time.
- If the script fails on a path, rerun with `--exclude <path-fragment>` and say so in Scope.

## Forbidden Actions

- Do not modify, commit, push, create branches or open PRs in any repository.
- Do not run install, build or test commands in the repos. The scan doesn't need them.
- Do not open, read or analyze AG Grid Enterprise's own source code. That covers `node_modules`, vendored copies, and the enterprise folders of the AG Grid GitHub repo. This is a clean-room requirement: the team building the replacement must stay independent of Enterprise's implementation. Reading the team's own code that *uses* Enterprise is fine, and so are AG Grid's public docs.
- Do not put source code excerpts in the final report.
- Do not send repository contents to any external service.
- Do not edit the audit script.

## Appendix: audit script

Save the script exactly as given, as `~/ag-grid-audit/ag-grid-audit.mjs`.

````js
#!/usr/bin/env node
/**
 * ag-grid-audit.mjs: inventory AG Grid Enterprise feature usage in a codebase.
 *
 * Read-only. No dependencies, no network access. Scans source files under the
 * given directories and writes three reports:
 *   ag-grid-audit-summary.md   counts only: no file paths, no source code
 *   ag-grid-audit-details.md   every hit as path:line (add --context for the source line)
 *   ag-grid-audit.json         machine-readable version of both
 *
 * Usage:
 *   node ag-grid-audit.mjs [<label>=]<app-dir> [...] [--out <dir>] [--context] [--exclude <text>]
 *
 *   <app-dir>        each directory is reported as its own app, labelled by folder name
 *                    unless a label is given (e.g. billing-web=repos/billing/apps/web)
 *   --out <dir>      where to write the reports (default: current directory)
 *   --context        include the matching source line in details.md / json
 *   --exclude <text> skip any file whose relative path contains <text> (repeatable)
 *
 * Matching is pattern-based and line-based, so treat results as leads: check
 * details.md before relying on a low hit count, and expect commented-out code
 * to be counted. Requires Node 16+.
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Enterprise feature catalog
//
// keys:    gridOptions / colDef properties (object keys, Angular inputs, JSX props)
// api:     GridApi methods (matched as `.name(`)
// events:  grid events (matched as `(name)=`, `onName`, or 'name' string)
// strings: built-in component names (matched as quoted strings)
// regex:   anything else
//
// Tier = how hard the feature is to rebuild on top of AG Grid Community:
//   1  custom component or export hook on Community's public API
//   2  needs a coordinating layer around the grid (data transforms, full-width rows, overlays)
//   3  replaces a core subsystem (row model, grouping pipeline, charting)
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    id: 'row-grouping', name: 'Row grouping', tier: 3,
    keys: ['rowGroup', 'rowGroupIndex', 'enableRowGroup', 'autoGroupColumnDef', 'groupDisplayType',
      'groupDefaultExpanded', 'rowGroupPanelShow', 'groupTotalRow', 'groupIncludeFooter',
      'groupIncludeTotalFooter', 'showOpenedGroup', 'groupHideOpenParents', 'groupAllowUnbalanced',
      'groupSelectsChildren', 'groupRowRenderer', 'groupRowRendererParams', 'isGroupOpenByDefault',
      'initialGroupOrderComparator', 'groupHideParentOfSingleChild', 'groupLockGroupColumns',
      'groupMaintainOrder', 'suppressGroupRowsSticky', 'suppressRowGroupHidesColumns',
      'suppressMakeColumnVisibleAfterUnGroup'],
    api: ['setRowGroupColumns', 'addRowGroupColumns', 'removeRowGroupColumns', 'getRowGroupColumns',
      'moveRowGroupColumn'],
    events: ['columnRowGroupChanged'],
    strings: ['agGroupCellRenderer', 'agGroupColumnFilter'],
  },
  {
    id: 'aggregation', name: 'Aggregation', tier: 2,
    keys: ['aggFunc', 'enableValue', 'allowedAggFuncs', 'aggFuncs', 'defaultAggFunc',
      'suppressAggFuncInHeader', 'suppressAggFilteredOnly', 'alwaysAggregateAtRootLevel',
      'grandTotalRow', 'getGroupRowAgg', 'groupAggFiltering'],
    api: ['setValueColumns', 'addValueColumns', 'removeValueColumns', 'getValueColumns',
      'setColumnAggFunc', 'addAggFuncs', 'clearAggFuncs'],
    events: ['columnValueChanged'],
  },
  {
    id: 'pivot', name: 'Pivoting', tier: 3,
    keys: ['pivotMode', 'pivot', 'pivotIndex', 'enablePivot', 'pivotPanelShow', 'pivotDefaultExpanded',
      'pivotColumnGroupTotals', 'pivotRowTotals', 'processPivotResultColDef',
      'processPivotResultColGroupDef', 'suppressExpandablePivotGroups', 'pivotMaxGeneratedColumns',
      'pivotSuppressAutoColumn'],
    api: ['setPivotMode', 'isPivotMode', 'setPivotColumns', 'addPivotColumns', 'removePivotColumns',
      'getPivotColumns', 'getPivotResultColumns', 'setPivotResultColumns', 'getPivotResultColumn'],
    events: ['columnPivotModeChanged', 'columnPivotChanged'],
  },
  {
    id: 'tree-data', name: 'Tree data', tier: 2,
    keys: ['treeData', 'getDataPath', 'treeDataChildrenField', 'treeDataParentIdField'],
  },
  {
    id: 'master-detail', name: 'Master / detail', tier: 2,
    keys: ['masterDetail', 'detailCellRenderer', 'detailCellRendererParams', 'isRowMaster',
      'detailRowHeight', 'detailRowAutoHeight', 'keepDetailRows', 'keepDetailRowsCount'],
    api: ['getDetailGridInfo', 'forEachDetailGridInfo', 'addDetailGridInfo', 'removeDetailGridInfo'],
    strings: ['agDetailCellRenderer'],
  },
  {
    id: 'server-side', name: 'Server-side row model', tier: 3,
    keys: ['serverSideDatasource', 'serverSideInitialRowCount', 'isServerSideGroup',
      'getServerSideGroupKey', 'isServerSideGroupOpenByDefault', 'getChildCount',
      'serverSideSortAllLevels', 'serverSideOnlyRefreshFilteredGroups',
      'serverSideEnableClientSideSort', 'purgeClosedRowNodes', 'serverSidePivotResultFieldSeparator',
      'getServerSideGroupLevelParams'],
    api: ['setServerSideDatasource', 'refreshServerSide', 'retryServerSideLoads',
      'applyServerSideTransaction', 'applyServerSideTransactionAsync',
      'flushServerSideAsyncTransactions', 'getServerSideGroupLevelState',
      'getServerSideSelectionState', 'setServerSideSelectionState', 'applyServerSideRowData'],
    regex: [{ label: "rowModelType 'serverSide'", re: /rowModelType\]?['"]?\s*[:=]\s*[{"']?\s*['"]serverSide['"]|rowModelType\s*=\s*"serverSide"/ }],
  },
  {
    id: 'viewport', name: 'Viewport row model', tier: 3,
    keys: ['viewportDatasource', 'viewportRowModelPageSize', 'viewportRowModelBufferSize'],
    regex: [{ label: "rowModelType 'viewport'", re: /rowModelType\]?['"]?\s*[:=]\s*[{"']?\s*['"]viewport['"]|rowModelType\s*=\s*"viewport"/ }],
  },
  {
    id: 'set-filter', name: 'Set filter', tier: 1,
    strings: ['agSetColumnFilter', 'agSetColumnFloatingFilter'],
  },
  {
    id: 'multi-filter', name: 'Multi filter', tier: 2,
    strings: ['agMultiColumnFilter', 'agMultiColumnFloatingFilter'],
  },
  {
    id: 'advanced-filter', name: 'Advanced filter', tier: 2,
    keys: ['enableAdvancedFilter', 'advancedFilterParams', 'advancedFilterBuilderParams',
      'includeHiddenColumnsInAdvancedFilter', 'advancedFilterParent'],
    api: ['getAdvancedFilterModel', 'setAdvancedFilterModel', 'showAdvancedFilterBuilder',
      'hideAdvancedFilterBuilder'],
    events: ['advancedFilterBuilderVisibleChanged'],
  },
  {
    id: 'excel-export', name: 'Excel export', tier: 1,
    keys: ['excelStyles', 'defaultExcelExportParams', 'suppressExcelExport'],
    api: ['exportDataAsExcel', 'getDataAsExcel', 'getSheetDataForExcel', 'getMultipleSheetsAsExcel',
      'exportMultipleSheetsAsExcel'],
  },
  {
    id: 'clipboard', name: 'Clipboard', tier: 1,
    keys: ['processCellForClipboard', 'processCellFromClipboard', 'processHeaderForClipboard',
      'processGroupHeaderForClipboard', 'processDataFromClipboard', 'sendToClipboard',
      'copyHeadersToClipboard', 'copyGroupHeadersToClipboard', 'clipboardDelimiter',
      'suppressClipboardPaste', 'suppressCutToClipboard', 'suppressCopyRowsToClipboard',
      'suppressCopySingleCellRanges', 'suppressClipboardApi', 'suppressLastEmptyLineOnPaste'],
    api: ['copyToClipboard', 'cutToClipboard', 'pasteFromClipboard', 'copySelectedRowsToClipboard',
      'copySelectedRangeToClipboard', 'copySelectedRangeDown'],
    events: ['pasteStart', 'pasteEnd', 'cutStart', 'cutEnd'],
  },
  {
    id: 'cell-selection', name: 'Cell / range selection & fill handle', tier: 2,
    keys: ['cellSelection', 'enableRangeSelection', 'enableRangeHandle', 'enableFillHandle',
      'fillHandleDirection', 'fillOperation', 'suppressMultiRangeSelection',
      'suppressClearOnFillReduction'],
    api: ['getCellRanges', 'addCellRange', 'clearRangeSelection', 'clearCellSelection'],
    events: ['rangeSelectionChanged', 'cellSelectionChanged', 'rangeDeleteStart', 'rangeDeleteEnd',
      'fillStart', 'fillEnd'],
  },
  {
    id: 'context-menu', name: 'Context menu', tier: 1,
    keys: ['getContextMenuItems', 'contextMenuItems', 'allowContextMenuWithControlKey',
      'preventDefaultOnContextMenu'],
    api: ['showContextMenu'],
  },
  {
    id: 'column-menu', name: 'Enterprise column menu & column chooser', tier: 1,
    keys: ['getMainMenuItems', 'mainMenuItems', 'menuTabs', 'columnChooserParams'],
    api: ['showColumnChooser', 'hideColumnChooser'],
  },
  {
    id: 'side-bar', name: 'Side bar & tool panels', tier: 2,
    keys: ['sideBar', 'suppressColumnsToolPanel', 'suppressFiltersToolPanel'],
    api: ['openToolPanel', 'closeToolPanel', 'getToolPanelInstance', 'refreshToolPanel',
      'isToolPanelShowing', 'getOpenedToolPanel', 'setSideBarVisible', 'isSideBarVisible',
      'setSideBarPosition', 'getSideBar'],
    events: ['toolPanelVisibleChanged', 'toolPanelSizeChanged'],
    strings: ['agColumnsToolPanel', 'agFiltersToolPanel', 'agNewFiltersToolPanel'],
  },
  {
    id: 'status-bar', name: 'Status bar', tier: 1,
    keys: ['statusBar'],
    api: ['getStatusPanel'],
    strings: ['agTotalRowCountComponent', 'agTotalAndFilteredRowCountComponent',
      'agFilteredRowCountComponent', 'agSelectedRowCountComponent', 'agAggregationComponent'],
  },
  {
    id: 'charts', name: 'Integrated charts', tier: 3,
    keys: ['enableCharts', 'chartThemes', 'customChartThemes', 'chartThemeOverrides',
      'chartToolPanelsDef', 'getChartToolbarItems', 'createChartContainer', 'chartMenuItems',
      'suppressChartToolPanelsButton'],
    api: ['createRangeChart', 'createPivotChart', 'createCrossFilterChart', 'getChartModels',
      'getChartRef', 'restoreChart', 'updateChart', 'getChartImageDataURL', 'downloadChart',
      'openChartToolPanel', 'closeChartToolPanel'],
    events: ['chartCreated', 'chartRangeSelectionChanged', 'chartOptionsChanged', 'chartDestroyed'],
  },
  {
    id: 'sparklines', name: 'Sparklines', tier: 1,
    strings: ['agSparklineCellRenderer'],
  },
  {
    id: 'rich-select', name: 'Rich select editor', tier: 1,
    strings: ['agRichSelectCellEditor'],
  },
  {
    id: 'row-numbers', name: 'Row numbers', tier: 1,
    keys: ['rowNumbers'],
  },
];

const TIER_TEXT = {
  1: 'custom component or export hook on Community\'s public API',
  2: 'needs a coordinating layer around the grid (data transforms, full-width rows, overlays)',
  3: 'replaces a core subsystem (row model, grouping pipeline, charting)',
};

const ENTERPRISE_PKG = /^(ag-grid-enterprise|ag-grid-charts-enterprise|@ag-grid-enterprise\/.+)$/;
const AG_PKG = /^(ag-grid|@ag-grid-|ag-charts)/;
const GRID_INSTANCE = [/<ag-grid-angular\b/, /<AgGridReact\b/, /\bcreateGrid\s*\(/, /\bnew\s+Grid\s*\(/];
const LEGACY_COLUMN_API = /\bcolumnApi\b|\bColumnApi\b/;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.angular',
  '.next', '.nx', '.cache', '.turbo', 'tmp', 'storybook-static']);
const CODE_EXT = new Set(['.ts', '.js', '.mjs', '.cjs']);
const JSX_EXT = new Set(['.tsx', '.jsx']);
const MARKUP_EXT = new Set(['.html']);
const MAX_FILE_BYTES = 1.5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Signal compilation: each signal gets one regex per file kind
// ---------------------------------------------------------------------------

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const any = (...parts) => new RegExp(parts.join('|'));

function compileSignal(kind, name) {
  const n = esc(name);
  const quoted = `['"\`]${n}['"\`]`;
  switch (kind) {
    case 'key': {
      const objectKey = `(?<![\\w$.])['"]?${n}['"]?\\s*\\??\\s*:(?!:)`;
      const setOption = `setGridOption\\(\\s*['"]${n}['"]`;
      const boundInput = `\\[${n}\\]\\s*=`;
      return {
        label: name,
        code: any(objectKey, setOption, boundInput),
        // JSX props: `name={...}` / `name="..."`, or a bare boolean prop `<AgGridReact name />`
        jsx: any(objectKey, setOption, `(?<![\\w$.-])${n}\\s*=\\s*[{"']`, `(?<=\\s)${n}(?=\\s|/?>|$)`),
        markup: any(boundInput, `(?<![\\w$.\\-\\[(])${n}\\s*=\\s*["']`),
      };
    }
    case 'api': {
      const call = new RegExp(`\\.${n}\\s*\\(`);
      return { label: `${name}()`, code: call, jsx: call, markup: call };
    }
    case 'event': {
      const on = esc('on' + name[0].toUpperCase() + name.slice(1));
      const objectKey = `(?<![\\w$.])['"]?${on}['"]?\\s*\\??\\s*:`;
      const outputBinding = `\\(${n}\\)\\s*=`;
      return {
        label: `(${name})`,
        code: any(objectKey, quoted, outputBinding),
        jsx: any(objectKey, quoted, `\\b${on}\\s*=\\s*\\{`),
        markup: new RegExp(outputBinding),
      };
    }
    case 'string': {
      const re = new RegExp(quoted);
      return { label: `'${name}'`, code: re, jsx: re, markup: re };
    }
    default:
      throw new Error(`unknown signal kind ${kind}`);
  }
}

const COMPILED = FEATURES.map((f) => ({
  ...f,
  signals: [
    ...(f.keys ?? []).map((n) => compileSignal('key', n)),
    ...(f.api ?? []).map((n) => compileSignal('api', n)),
    ...(f.events ?? []).map((n) => compileSignal('event', n)),
    ...(f.strings ?? []).map((n) => compileSignal('string', n)),
    ...(f.regex ?? []).map(({ label, re }) => ({ label, code: re, jsx: re, markup: re })),
  ],
}));

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { roots: [], out: process.cwd(), context: false, exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--context') opts.context = true;
    else if (a === '--exclude') opts.exclude.push(argv[++i]);
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else opts.roots.push(parseRoot(a));
  }
  const seen = new Set();
  for (const { label } of opts.roots) {
    if (seen.has(label)) throw new Error(`duplicate app label "${label}"; pass <label>=<app-dir> to disambiguate`);
    seen.add(label);
  }
  return opts;
}

// `<label>=<app-dir>` sets the app label explicitly; a bare `<app-dir>` is labelled by folder name
function parseRoot(arg) {
  const eq = arg.indexOf('=');
  if (eq > 0 && !fs.existsSync(arg)) return { label: arg.slice(0, eq), dir: arg.slice(eq + 1) };
  return { label: path.basename(path.resolve(arg)), dir: arg };
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function fileKind(file) {
  if (file.endsWith('.d.ts') || file.endsWith('.min.js')) return null;
  const ext = path.extname(file);
  if (CODE_EXT.has(ext)) return 'code';
  if (JSX_EXT.has(ext)) return 'jsx';
  if (MARKUP_EXT.has(ext)) return 'markup';
  return null;
}

const IMPORT_RE = /\b(?:import|export)\s+(?:type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g;

function importedNames(clause) {
  if (!clause) return ['(side-effect import)'];
  const braces = clause.match(/\{([^}]*)\}/);
  if (braces) {
    return braces[1].split(',')
      .map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
  }
  if (clause.includes('*')) return ['*'];
  return [clause.trim()];
}

function scanImports(text, app) {
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(text))) {
    const pkg = m[2] ?? m[3] ?? m[4];
    if (!AG_PKG.test(pkg)) continue;
    app.importFiles[pkg] = (app.importFiles[pkg] ?? 0) + 1;
    if (ENTERPRISE_PKG.test(pkg)) {
      for (const name of importedNames(m[1])) app.enterpriseImports.add(name);
    }
  }
}

function scanPackageJson(file, app) {
  try {
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const [name, version] of Object.entries(pkg[section] ?? {})) {
        if (AG_PKG.test(name)) app.packages.push({ file: path.relative(app.root, file), name, version });
      }
    }
  } catch {
    // unreadable or invalid package.json: not our concern
  }
}

function scanApp({ label, dir }, opts) {
  const app = {
    name: label,
    root: path.resolve(dir),
    filesScanned: 0,
    agGridFiles: 0,
    gridInstances: 0,
    legacyColumnApiFiles: 0,
    licenseManagerFiles: 0,
    importFiles: {},
    enterpriseImports: new Set(),
    packages: [],
    hits: [],
  };

  for (const file of walk(app.root)) {
    const rel = path.relative(app.root, file);
    if (opts.exclude.some((x) => rel.includes(x))) continue;
    if (path.basename(file) === 'package.json') { scanPackageJson(file, app); continue; }
    const kind = fileKind(file);
    if (!kind || fs.statSync(file).size > MAX_FILE_BYTES) continue;

    const text = fs.readFileSync(file, 'utf8');
    app.filesScanned++;
    const touchesAgGrid = /ag-grid|AgGrid|agGrid/.test(text);
    if (touchesAgGrid) app.agGridFiles++;
    if (kind !== 'markup') scanImports(text, app);
    if (touchesAgGrid && LEGACY_COLUMN_API.test(text)) app.legacyColumnApiFiles++;
    if (/\bLicenseManager\b/.test(text)) app.licenseManagerFiles++;

    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const re of GRID_INSTANCE) {
        if (re.test(line) && (re.source.startsWith('<') || touchesAgGrid)) app.gridInstances++;
      }
      for (const feature of COMPILED) {
        for (const signal of feature.signals) {
          if (!signal[kind].test(line)) continue;
          app.hits.push({
            feature: feature.id,
            signal: signal.label,
            file: rel,
            line: i + 1,
            ...(opts.context ? { text: line.trim().slice(0, 160) } : {}),
          });
        }
      }
    });
  }
  return app;
}

// ---------------------------------------------------------------------------
// Aggregation & reporting
// ---------------------------------------------------------------------------

function summarise(apps) {
  return COMPILED.map((f) => {
    const hits = apps.flatMap((a) => a.hits.filter((h) => h.feature === f.id).map((h) => ({ ...h, app: a.name })));
    const files = new Set(hits.map((h) => `${h.app}\0${h.file}`));
    const perApp = Object.fromEntries(apps.map((a) => [
      a.name, new Set(hits.filter((h) => h.app === a.name).map((h) => h.file)).size,
    ]));
    const signals = {};
    for (const h of hits) signals[h.signal] = (signals[h.signal] ?? 0) + 1;
    return { id: f.id, name: f.name, tier: f.tier, hits: hits.length, files: files.size, perApp, signals, hitList: hits };
  }).sort((a, b) => b.files - a.files || b.hits - a.hits || a.tier - b.tier);
}

const cell = (s) => String(s).replace(/\|/g, '\\|');
const table = (head, rows) => [
  `| ${head.join(' | ')} |`,
  `| ${head.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
].join('\n');

function summaryMarkdown(apps, features) {
  const used = features.filter((f) => f.hits > 0);
  const unused = features.filter((f) => f.hits === 0);
  const featuresPerApp = (a) => used.filter((f) => f.perApp[a.name] > 0).length;
  const out = [];

  out.push('# AG Grid usage audit: summary', '');
  out.push(`Generated ${new Date().toISOString().slice(0, 10)} · ${apps.length} app(s) · ` +
    `${apps.reduce((n, a) => n + a.filesScanned, 0)} source files scanned`, '');
  out.push('_This file contains counts and AG Grid API names only: no file paths, no source code._', '');

  out.push('## At a glance', '');
  out.push(table(
    ['App', 'Grid instances', 'Files using AG Grid', 'Enterprise features used', 'AG Grid packages'],
    apps.map((a) => [
      a.name, a.gridInstances, a.agGridFiles, featuresPerApp(a),
      [...new Set(a.packages.map((p) => `${p.name}@${p.version}`))].join(', ') || '(none found)',
    ]),
  ), '');

  const ready = apps.filter((a) => featuresPerApp(a) === 0);
  if (ready.length) {
    out.push(`**No enterprise feature usage detected in:** ${ready.map((a) => a.name).join(', ')}. ` +
      'These can likely move to Community as-is (verify by removing the enterprise package and running tests).', '');
  }

  out.push('## Enterprise features in use', '');
  out.push('Ranked by number of files. Tier = how hard the feature is to rebuild on top of Community (see below).', '');
  out.push(used.length ? table(
    ['Feature', 'Tier', 'Files', 'Hits', 'Apps', 'Signals seen'],
    used.map((f) => [
      f.name, f.tier, f.files, f.hits, Object.values(f.perApp).filter(Boolean).length,
      Object.entries(f.signals).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ×${n}`).join(', '),
    ]),
  ) : '_None detected._', '');

  if (apps.length > 1 && used.length) {
    out.push('## Feature × app (files)', '');
    out.push(table(['Feature', ...apps.map((a) => a.name)], used.map((f) => [f.name, ...apps.map((a) => f.perApp[a.name] || '')])), '');
  }

  out.push('## Not detected', '');
  out.push(unused.length ? unused.map((f) => `- ${f.name}`).join('\n') : '_All catalogued features were detected._', '');

  out.push('## Enterprise modules imported', '');
  out.push('Registering a module is not the same as using it; the feature table above is the better guide.', '');
  out.push(apps.map((a) => `- **${a.name}:** ${[...a.enterpriseImports].sort().join(', ') || '(none)'}`).join('\n'), '');

  const notes = [];
  for (const a of apps) {
    if (a.legacyColumnApiFiles) {
      notes.push(`- **${a.name}:** \`columnApi\` used in ${a.legacyColumnApiFiles} file(s). ColumnApi was removed in AG Grid v31, so this app needs an upgrade before it can adopt a library built on current Community.`);
    }
    if (a.licenseManagerFiles) notes.push(`- **${a.name}:** \`LicenseManager\` referenced in ${a.licenseManagerFiles} file(s).`);
  }
  if (notes.length) out.push('## Notes', '', ...notes, '');

  out.push('## Tiers', '');
  for (const [tier, text] of Object.entries(TIER_TEXT)) out.push(`- **${tier}**: ${text}`);
  out.push('');
  return out.join('\n');
}

function detailsMarkdown(features, opts) {
  const out = ['# AG Grid usage audit: details', ''];
  out.push('_Contains file paths' + (opts.context ? ' and source lines' : '') + '. Review before sharing outside your organisation._', '');
  for (const f of features.filter((x) => x.hits)) {
    out.push(`## ${f.name} (tier ${f.tier}): ${f.files} file(s), ${f.hits} hit(s)`, '');
    const head = ['Location', 'Signal', ...(opts.context ? ['Line'] : [])];
    out.push(table(head, f.hitList.map((h) => [
      `${h.app}/${h.file}:${h.line}`, h.signal, ...(opts.context ? ['`' + h.text.replace(/`/g, "'") + '`'] : []),
    ])), '');
  }
  return out.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.roots.length) {
    console.log('Usage: node ag-grid-audit.mjs [<label>=]<app-dir> [...] [--out <dir>] [--context] [--exclude <text>]');
    process.exit(opts.help ? 0 : 1);
  }
  for (const { dir } of opts.roots) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`not a directory: ${dir}`);
  }

  const apps = opts.roots.map((r) => scanApp(r, opts));
  const features = summarise(apps);
  fs.mkdirSync(opts.out, { recursive: true });

  const files = {
    summary: path.join(opts.out, 'ag-grid-audit-summary.md'),
    details: path.join(opts.out, 'ag-grid-audit-details.md'),
    json: path.join(opts.out, 'ag-grid-audit.json'),
  };
  fs.writeFileSync(files.summary, summaryMarkdown(apps, features));
  fs.writeFileSync(files.details, detailsMarkdown(features, opts));
  fs.writeFileSync(files.json, JSON.stringify({
    generatedAt: new Date().toISOString(),
    apps: apps.map(({ hits, root, enterpriseImports, ...a }) => ({ ...a, enterpriseImports: [...enterpriseImports] })),
    features: features.map(({ hitList, ...f }) => f),
    hits: features.flatMap((f) => f.hitList),
  }, null, 2));

  const used = features.filter((f) => f.hits);
  console.log(`Scanned ${apps.length} app(s). ${used.length} enterprise feature(s) detected:`);
  for (const f of used) console.log(`  tier ${f.tier}  ${f.name.padEnd(40)} ${f.files} file(s)`);
  console.log(`\nReports:\n  ${files.summary}\n  ${files.details}\n  ${files.json}`);
}

try {
  main();
} catch (err) {
  console.error(`ag-grid-audit: ${err.message}`);
  process.exit(1);
}
````
