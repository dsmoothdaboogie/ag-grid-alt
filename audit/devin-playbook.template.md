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
{{AUDIT_SCRIPT}}
````
