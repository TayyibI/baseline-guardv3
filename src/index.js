const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Load the data.json properly
const dataPath = path.join(__dirname, 'web-features', 'data.json');
if (!fs.existsSync(dataPath)) {
    core.setFailed(`data.json not found at ${dataPath}`);
    process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
if (!rawData.features) {
    core.setFailed(`data.json does not have a "features" key!`);
    process.exit(1);
}

// Normalize features map: featureName -> featureData
const features = rawData.features;
core.info(`Loaded ${Object.keys(features).length} features from ${dataPath}`);

function toDate(s) {
    return s ? new Date(s) : null;
}

function getCompliantFeatureIds(target, failOnNewly) {
    const compliant = new Set();
    const lowerTarget = ('' + target).toLowerCase();

    if (!['widely', 'newly'].includes(lowerTarget) && isNaN(parseInt(lowerTarget))) {
        throw new Error(`Invalid target-baseline: ${target}. Must be 'widely', 'newly', or a year.`);
    }

    for (const [featureName, featureData] of Object.entries(features)) {
        const status = featureData.status;
        if (!status) continue;

        const baseline = status.baseline;
        const baselineLowDate = status.baseline_low_date;

        let isCompliant = false;

        if (lowerTarget === 'widely') {
            if (baseline === 'high') isCompliant = true;
        } else if (lowerTarget === 'newly') {
            if (baseline === 'high' || baseline === 'low') isCompliant = true;
        } else {
            const targetYear = parseInt(lowerTarget, 10);
            if (!isNaN(targetYear) && baselineLowDate) {
                const y = toDate(baselineLowDate).getFullYear();
                if (y <= targetYear) isCompliant = true;
            }
        }

        if (failOnNewly && baseline === 'low') isCompliant = false;

        if (isCompliant) compliant.add(featureName);
    }

    if (compliant.size === 0) {
        core.warning(`No features found matching the "${target}" criteria.`);
    } else {
        core.info(`Compliant features: ${[...compliant].join(', ')}`);
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

        core.info(`Checking against ${nonCompliantFeatureIds.size} non-compliant features: ${[...nonCompliantFeatureIds].join(', ')}`);

        const allViolations = [];
        const filePaths = await glob(scanFiles, { ignore: 'node_modules/**' });

        for (const filePath of filePaths) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            if (filePath.endsWith('.css')) continue; // CSS scanning can be done separately
            else if (filePath.endsWith('.js')) {
                nonCompliantFeatureIds.forEach(featureName => {
                    if (fileContent.includes(featureName)) {
                        allViolations.push({
                            file: filePath,
                            line: 'unknown',
                            column: 'unknown',
                            feature: featureName,
                            reason: `Potential usage of JS feature '${featureName}' which is not compliant with the '${targetBaseline}' Baseline target.`
                        });
                    }
                });
            }
        }

        if (allViolations.length > 0) {
            core.warning(`❌ Baseline Guard found ${allViolations.length} violations.`);
            const reportContent = generateReport(allViolations, targetBaseline);
            fs.writeFileSync(reportArtifactName, reportContent);

            core.startGroup('Violation Summary');
            allViolations.forEach(v => core.error(`[${v.file}:${v.line}:${v.column}] ${v.reason}`));
            core.endGroup();

            core.setOutput('violations-found', 'true');
            core.setFailed(`Build failed due to ${allViolations.length} Baseline violations.`);
        } else {
            core.info('✅ Baseline Guard passed!');
            core.setOutput('violations-found', 'false');
        }
    } catch (error) {
        core.setFailed(`Action failed with error: ${error.message}\n${error.stack}`);
    }
}

run();
