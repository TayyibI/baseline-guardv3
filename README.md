
# Baseline Guard Action

GitHub Action to check your project for Web Platform Baseline (browser compatibility) violations.

## Features
- Uses the official `web-features` package for canonical feature data.
- Scans JS files (simple detection) and delegates CSS checking to ESLint's CSS baseline rule if you enable it.
- Bundles `web-features/data.json` into `dist/data.json` at build time (so CI runs offline).
- Generates an HTML report when violations are found and fails the Action.

## Quick start

1. Clone into a repo, or import this repository into GitHub.
2. Install dependencies and build the action (this will copy the real `web-features` JSON into `dist/`):

```bash
npm install
npm run build
```

3. Use the Action in a workflow:

```yaml
- name: Baseline Guard
  uses: ./  # or uses: your-org/baseline-guard@v1 when published
  with:
    target-baseline: 'widely'
    scan-files: 'src/**/*.{js,css}'
    fail-on-newly: 'true'
```

The build step requires `node_modules/web-features/data.json` to exist (it will after `npm install`). The `copyfiles -u 2` in the build script ensures the data is copied to `dist/data.json` (fixes nested path issues).


