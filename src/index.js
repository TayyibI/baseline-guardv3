const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const dataPath = path.join(__dirname, 'web-features', 'data.json');

// Load features from data.json
let features;
try {
  const raw = fs.readFileSync(dataPath, 'utf-8');
  const parsed = JSON.parse(raw);

  if (!parsed.features) throw new Error('data.json does not have a "features" property.');

  // Flatten features into a map: id -> featureData
  features = {};
  Object.entries(parsed.features).forEach(([id, f]) => {
    features[id] = f;
  });

  core.info(`Loaded ${Object.keys(features).length} features from ${dataPath}`);
} catch (err) {
  core.setFailed(`Failed to load features: ${err.message}`);
  process.exit(1);
}

// Helper: safe date parsing
function toDate(s) {
  return s ? new Date(s) : null;
}

// Get compliant feature IDs based on baseline target
function getCompliantFeatureIds(target, failOnNewly) {
  const compliant = new Set();
  const lowerTarget = ('' + target).toLowerCase();

  if (!['widely', 'newly'].includes(lowerTarget) && isNaN(parseInt(lowerTarget))) {
    throw new Error(`Invalid target-baseline: ${target}. Must be 'widely', 'newly', or a year.`);
  }

  for (const [featureId, featureData] of Object.entries(features)) {
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

  return compliant;
}

// Generate HTML report
function generateReport(violations, targetBaseline) {
  let report = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Baseline Guard Report</title><style>body{font-family:Arial,sans-serif;margin:20px}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f2f2f2}</style></head><body>`;
  report += `<h1>Baseline Guard Report</h1><p><strong>Status:</strong> ${violations.length>0?'Failed':'Passed'}</p><p><strong>Target Baseline:</strong> ${targetBaseline}</p><p><strong>Violations Found:</strong> ${violations.length}</p>`;

  if (violations.length > 0) {
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

// Main
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
    const allFeatureIds = new Set(Object.keys(features));
    const nonCompliantFeatureIds = new Set([...allFeatureIds].filter(id => !compliantFeatureIds.has(id)));

    //core.info(`Found ${compliantFeatureIds.size} compliant features.`);
    //core.info(`Non-compliant features (${nonCompliantFeatureIds.size}): ${[...nonCompliantFeatureIds].join(', ')}`);

    const allViolations = [];
    const filePaths = await glob(scanFiles, { ignore: 'node_modules/**' });

    for (const filePath of filePaths) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');

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
