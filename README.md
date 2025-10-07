
# Baseline Guard Action

GitHub Action to check your project for Web Platform Baseline (browser compatibility) violations.

## Features
- Uses the official `web-features` package for canonical feature data.
- Scans JS files (simple detection) and delegates CSS checking to ESLint's CSS baseline rule if you enable it.
- Bundles `web-features/data.json` into `dist/data.json` at build time (so CI runs offline).
- Generates an HTML report when violations are found and fails the Action.
How It Works

Scans Files: Globs files (e.g., src/**/*.{js,jsx,ts,tsx,css}) using the glob package.

Parses Code:

JS/JSX: Acorn with JSX extension.

TS/TSX: @typescript-eslint/parser.

CSS: PostCSS + doiuse.

Checks Features: Matches identifiers (JS/TS) or properties (CSS) against web-features/data.json. For "widely" baseline, only high status features (stable >30 months across major browsers) pass; low or limited features (e.g., supported since 2025) are flagged.

Avoids False Positives: Whitelists common identifiers (e.g., dirname, has) and skips declarations/assignments.

Reports: Generates baseline-report.html (interactive table) and baseline-report.json in reports/baseline/.

CI Outcome: Exits with code 0 (pass) or 1 (fail if failOnNewly: true).

## Quick start

1. Clone into a repo, or import this repository into GitHub.
2. Install dependencies and build the action (this will copy the real `web-features` JSON into `dist/`):

Installation

Clone the Repo:
```bash
git clone https://github.com/TayyibI/baselinev3.git
cd baseline-guard-demo
```
Or just Copy the Index.js, Action.yml, baseline.config, .github/workflows/test.yml files
Install Dependencies:
```bash
npm init -y
npm install glob acorn acorn-walk doiuse postcss minimist @typescript-eslint/parser acorn-jsx
```


Add Workflow: Create .github/workflows/test.yml:
```bash
name: Baseline Guard
on: [push]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install
      - run: node index.js
```


Configure: Add baseline.config at repo root (JSON):
```bash
{
  "targetBaseline": "widely",
  "scanFiles": "src/**/*.{js,jsx,ts,tsx,css}",
  "failOnNewly": false,
  "dryRun": false,
  "browsers": "defaults",
  "reportDir": "reports/baseline",
  "jsWhitelist": ["dirname", "has"]
}
```
Usage

1. Add code files to src/ (e.g., JS/TS/CSS).
2. As everything is configurable you can add whitelisted features, change where files are scanned from, or the target baseline
3. Push to GitHub to trigger the action.
4. Check the Actions tab for logs and download baseline-report.html/json from artifacts.
5. Purpose: failOnNewly lets you decide how strict the action is:

true: Enforces strict compliance (e.g., for production apps needing wide browser support). Any low-baseline or limited-availability feature (not high in web-features/data.json) fails the build.
false: Allows violations to be reported (in baseline-report.html/json) without failing the CI, useful for testing or gradual adoption (e.g., you want to know about issues but not block PRs).

Changes will still be made but the Github Actions will show which commit passes and which fails

The build step requires `node_modules/web-features/data.json` to exist (it will after `npm install`). The `copyfiles -u 2` in the build script ensures the data is copied to `dist/data.json` (fixes nested path issues).


