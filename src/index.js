
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');



const dataPath = path.join(__dirname, 'web-features', 'data.json');
if (!fs.existsSync(dataPath)) {
    core.setFailed(`data.json not found at ${dataPath}`);
    process.exit(1);
}
features = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
core.info(`Loaded ${Object.keys(features).length} features from ${dataPath}`);
core.info(`Files in dist: ${fs.readdirSync(__dirname).join(', ')}`);


// Robust loader: prefer requiring web-features, fallback to dist/data.json paths
/*
function loadFeatures() {
  // Try require first (works if web-features is installed and bundler includes it)
  try {
    const wf = require('web-features');
    // web-features package sometimes exports an object with `features` array
    if (wf && (wf.features || wf.default && wf.default.features)) {
      const f = wf.features || (wf.default && wf.default.features);
      core.info(`Loaded features from 'web-features' package. Count: ${f.length}`);
      // normalize into map: id -> data
      const map = {};
      f.forEach(item => { if (item && item.id) map[item.id] = item; });
      return map;
    }
    // If web-features exposes a flat object, use it directly
    if (wf && typeof wf === 'object' && !Array.isArray(wf)) {
      core.info(`Loaded web-features as object. Keys: ${Object.keys(wf).length}`);
      return wf;
    }
  } catch (err) {
    core.info('Require web-features failed or not present: ' + err.message);
  }

  // Candidate file locations relative to __dirname and CWD
  const candidates = [
    path.join(__dirname, 'data.json'),
    path.join(__dirname, 'web-features', 'data.json'),
    path.join(process.cwd(), 'dist', 'data.json'),
    path.join(process.cwd(), 'dist', 'web-features', 'data.json')
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const stats = fs.statSync(p);
        const raw = fs.readFileSync(p, 'utf8');
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          core.error(`Failed to parse JSON at ${p}: ${err.message}`);
          continue;
        }
        // If features are nested under .features (array), normalize to map
        if (Array.isArray(parsed)) {
          const map = {};
          parsed.forEach(item => { if (item && item.id) map[item.id] = item; });
          core.info(`Loaded array features from ${p} (count=${parsed.length}, size=${stats.size} bytes)`);
          return map;
        }
        if (parsed && parsed.features && Array.isArray(parsed.features)) {
          const map = {};
          parsed.features.forEach(item => { if (item && item.id) map[item.id] = item; });
          core.info(`Loaded nested features from ${p} (count=${parsed.features.length}, size=${stats.size} bytes)`);
          return map;
        }
        if (parsed && typeof parsed === 'object') {
          core.info(`Loaded object features from ${p} (keys=${Object.keys(parsed).length}, size=${stats.size} bytes)`);
          return parsed;
        }
      }
    } catch (err) {
      core.error(`Error while checking candidate ${p}: ${err.message}`);
    }
  }

  throw new Error('Could not find web-features data.json in any expected location. Run `npm install` and `npm run build` to ensure dist/data.json exists.');
}

let features;
try {
  features = loadFeatures();
} catch (error) {
  core.setFailed('Failed to load web-features: ' + error.message);
  process.exit(1);
}*/

// helper to convert to Date safely
function toDate(s) {
  return s ? new Date(s) : null;
}

function getCompliantFeatureIds(target, failOnNewly) {
  const compliant = new Set();
  const lowerTarget = ('' + target).toLowerCase();

  if (!['widely', 'newly'].includes(lowerTarget) && isNaN(parseInt(lowerTarget))) {
    throw new Error(`Invalid target-baseline: ${target}. Must be 'widely', 'newly', or a year.`);
  }

  for (const [featureId, featureData] of Object.entries(features)) {
    core.info(`Files in dist: ${fs.readdirSync(__dirname).join(', ')}`);

    core.debug(`${featureId}: ${JSON.stringify(featureData.status)}`);
    const status = featureData.status && featureData.status.baseline;
    const lowDate = featureData.status && featureData.status.baseline_low_date;

    let isCompliant = false;
    if (lowerTarget === 'widely') {
      if (status === 'high') isCompliant = true;
    } else if (lowerTarget === 'newly') {
      if (status === 'high' || status === 'low') isCompliant = true;
    } else {
      const targetYear = parseInt(lowerTarget, 10);
      if (!isNaN(targetYear) && lowDate) {
        const y = toDate(lowDate).getFullYear();
        if (y <= targetYear) isCompliant = true;
      }
    }

    if (failOnNewly && status === 'low') isCompliant = false;

    if (isCompliant) compliant.add(featureId);
  }

  if (compliant.size === 0) {
    core.warning(`No features found matching the "${target}" criteria. This might mean your target is too restrictive or the feature data is not as expected.`);
  } else {
    core.debug(`${compliant.size} compliant features found.`);
  }

  return compliant;
}

function generateReport(violations, targetBaseline) {
  let report = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Baseline Guard Report</title><style>body{font-family:Arial,sans-serif;margin:20px}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f2f2f2}</style></head><body>`;
  report += `<h1>Baseline Guard Report</h1><p><strong>Status:</strong> ${violations.length>0?'Failed':'Passed'}</p><p><strong>Target Baseline:</strong> ${targetBaseline}</p><p><strong>Violations Found:</strong> ${violations.length}</p>`;

  if (violations.length>0) {
    report += `<h2>Violations</h2><table><tr><th>File</th><th>Feature</th><th>Reason</th></tr>`;
    for (const v of violations) {
      report += `<tr><td>${v.file}</td><td>${v.feature}</td><td>${v.reason}</td></tr>`;
    }
    report += `</table>`;
  } else {
    report += `<p>All scanned features meet the ${targetBaseline} target criteria.</p>`;
  }
  report += `</body></html>`;
  return report;
}

async function run() {
  try {
    const targetBaseline = core.getInput('target-baseline', { required: true });
    const scanFiles = core.getInput('scan-files', { required: true });
    const failOnNewly = core.getInput('fail-on-newly') === 'true';
    const reportArtifactName = core.getInput('report-name') || 'baseline-report.html';

    core.info('--- Baseline Guard Configuration ---');
    core.info(`Target Baseline: ${targetBaseline}`);
    core.info(`Files to Scan: ${scanFiles}`);
    core.info(`Fail on Newly Available: ${failOnNewly}`);
    core.info(`Report Name: ${reportArtifactName}`);
    core.info('------------------------------------');

    const compliantFeatureIds = getCompliantFeatureIds(targetBaseline, failOnNewly);
    core.info(`Found ${compliantFeatureIds.size} features matching Baseline criteria.`);

    const allFeatureIds = new Set(Object.keys(features));
    const nonCompliantFeatureIds = new Set([...allFeatureIds].filter(id => !compliantFeatureIds.has(id)));

    core.info(`Checking against ${nonCompliantFeatureIds.size} non-compliant features.`);

    const allViolations = [];
    const filePaths = await glob(scanFiles, { ignore: 'node_modules/**' });

    for (const filePath of filePaths) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      if (filePath.endsWith('.css')) {
        // CSS scanning is better handled with ESLint; keep for completeness with doiuse in the future.
        continue;
      } else if (filePath.endsWith('.js')) {
        nonCompliantFeatureIds.forEach(api => {
          if (fileContent.includes(api)) {
            allViolations.push({
              file: filePath,
              line: 'unknown',
              column: 'unknown',
              feature: api,
              reason: `Potential usage of JS feature '${api}' which is not compliant with the '${targetBaseline}' Baseline target.`
            });
          }
        });
      }
    }

    if (allViolations.length > 0) {
      core.warning(`❌ Baseline Guard found ${allViolations.length} violations against the ${targetBaseline} target.`);
      const reportContent = generateReport(allViolations, targetBaseline);
      fs.writeFileSync(reportArtifactName, reportContent);

      core.startGroup('Violation Summary');
      allViolations.forEach(v => core.error(`[${v.file}:${v.line}:${v.column}] ${v.reason}`));
      core.endGroup();

      core.setOutput('violations-found', 'true');
      core.setFailed(`Build failed due to ${allViolations.length} Baseline violations.`);
    } else {
      core.info('✅ Baseline Guard passed! All scanned features meet the target criteria.');
      core.setOutput('violations-found', 'false');
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}\n${error.stack}`);
  }
}

run();
