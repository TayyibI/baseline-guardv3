#!/usr/bin/env node
/**
 * Baseline Guard - ES Module Version
 * Enhanced with better JS detection, reduced false positives, and performance optimizations
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import doiuse from 'doiuse';
import postcss from 'postcss';
import minimist from 'minimist';
import { fileURLToPath } from 'url';
import * as tsParser from "@typescript-eslint/parser";
import jsx from "acorn-jsx";
const AcornParser = acorn.Parser.extend(jsx());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic import for optional @actions/core
let core;
try {
  core = await import('@actions/core');
  core = core.default || core;
} catch {
  core = null;
}

// --- Improved configuration system ---
class Config {
  constructor() {
    this.argv = minimist(process.argv.slice(2));
    this.loadConfig();
  }

  loadConfig() {
    // Try to load from config file first
    const configPath = path.resolve('baseline.config');
    let fileConfig = {};
    if (fs.existsSync(configPath)) {
      try {
        fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('📁 Loaded config from baseline.config');
      } catch (err) {
        this.warn(`Could not parse config file: ${err.message}`);
      }
    }

    


    // Merge sources: file config < env < cli
    this.targetBaseline = this.getInput('target-baseline', fileConfig.targetBaseline || 'widely');
    this.scanFiles = this.getInput('scan-files', fileConfig.scanFiles || 'src/**/*.{js,jsx,ts,tsx,css}');
    this.failOnNewly = this.getInput('fail-on-newly', fileConfig.failOnNewly ?? true) === 'true' || fileConfig.failOnNewly === true;
    this.dryRun = this.getInput('dry-run', fileConfig.dryRun ?? false) === 'true' || fileConfig.dryRun === true;
    this.browsers = this.getInput('browsers', fileConfig.browsers || 'defaults');
    this.ignorePatterns = fileConfig.ignorePatterns || [];
    this.reportDir = fileConfig.reportDir || 'reports/baseline';
    this.jsWhitelist = fileConfig.jsWhitelist;


    // JS-specific settings
    this.jsSettings = {
      ignoreCommonFalsePositives: fileConfig.jsSettings?.ignoreCommonFalsePositives ?? true,
      detectFrameworkFeatures: fileConfig.jsSettings?.detectFrameworkFeatures ?? false,
      ...fileConfig.jsSettings
    };
  }

  getInput(name, defaultValue) {
    // GitHub Actions
    if (core) {
      try {
        const value = core.getInput(name);
        if (value !== undefined && value !== '') return value;
      } catch (_) {}
    }
    
    // CLI args (support both kebab-case and camelCase)
    const cliName = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (this.argv[name] !== undefined) return this.argv[name];
    if (this.argv[cliName] !== undefined) return this.argv[cliName];
    
    // Environment variables
    const envName = name.toUpperCase().replace(/-/g, '_');
    if (process.env[envName] !== undefined) return process.env[envName];
    
    return defaultValue;
  }

  warn(msg) {
    if (core && core.warning) core.warning(msg);
    else console.warn(`⚠️ ${msg}`);
  }
}

const config = new Config();

// --- Logging system ---
class Logger {
  static info(msg) { console.log(`ℹ️ ${msg}`); }
  static warn(msg) { console.warn(`⚠️ ${msg}`); }
  static error(msg) { console.error(`❌ ${msg}`); }
  static success(msg) { console.log(`✅ ${msg}`); }
}

// --- Feature Manager with caching ---
class FeatureManager {
  constructor() {
    this.features = null;
    this.compliantCache = new Map();
    this.falsePositives = new Set(config.jsWhitelist || []);
  }

  loadFeatures() {
    const possiblePaths = [
      path.join(__dirname, '..', 'dist', 'web-features', 'data.json'),
      path.join(__dirname, '..', 'web-features', 'data.json'),
      path.join(process.cwd(), 'node_modules', 'web-features', 'data.json'),
      path.join(process.cwd(), '..', 'web-features', 'data.json')
    ];

    for (const dataPath of possiblePaths) {
      if (fs.existsSync(dataPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
          if (raw.features && typeof raw.features === 'object') {
            this.features = raw.features;
            Logger.info(`Loaded ${Object.keys(this.features).length} features from ${dataPath}`);
            return;
          }
        } catch (err) {
          Logger.warn(`Failed to parse ${dataPath}: ${err.message}`);
        }
      }
    }

    throw new Error('Could not load web-features data.json from any known location');
  }

  isCompliant(featureName) {
    if (!this.features) throw new Error('Features not loaded');
    
    const cacheKey = `${featureName}:${config.targetBaseline}:${config.failOnNewly}`;
    if (this.compliantCache.has(cacheKey)) {
      return this.compliantCache.get(cacheKey);
    }

    const featureData = this.features[featureName];
    if (!featureData) {
      this.compliantCache.set(cacheKey, true); // Unknown features are considered compliant
      return true;
    }

    const status = featureData.status || {};
    const baseline = status.baseline;
    const lowDate = status.baseline_low_date || status.low || null;
    const highDate = status.baseline_high_date || status.high || null;

    let isCompliant = false;
    const target = config.targetBaseline.toLowerCase();

    if (target === 'widely') {
      isCompliant = baseline === 'high';
    } else if (target === 'newly') {
      isCompliant = baseline === 'high' || (baseline === 'low' && !config.failOnNewly);
    } else {
      const targetYear = parseInt(target, 10);
      if (!isNaN(targetYear)) {
        if (lowDate) {
          const year = new Date(lowDate).getFullYear();
          isCompliant = year <= targetYear;
        } else if (highDate) {
          const year = new Date(highDate).getFullYear();
          isCompliant = year <= targetYear;
        } else {
          isCompliant = baseline === 'high';
        }
      } else {
        isCompliant = false; // Unknown target -> conservative
      }
    }

    this.compliantCache.set(cacheKey, isCompliant);
    return isCompliant;
  }


  isFalsePositive(featureName) {
    return config.jsSettings.ignoreCommonFalsePositives && this.falsePositives.has(featureName.toLowerCase());
  }
}

const featureManager = new FeatureManager();


// --- JS Scanner ---
class JSScanner {
  constructor() {
    this.seenKeys = new Set();
  }
  safeParseJS(code, filePath) {
    try {
      if (!code.trim()) {
        Logger.warn(`Skipping empty file: ${filePath}`);
        return null;
      }

      return AcornParser.parse(code, {
        ecmaVersion: "latest",
        sourceType: "module",
        allowAwaitOutsideFunction: true,
        allowImportExportEverywhere: true,
        locations: true,
      });
    } catch (err) {
      Logger.warn(`Failed to parse JS file ${filePath}: ${err.message}`);
      return null;
    }
  }

  safeParseTS(code, filePath) {
    try {
      if (!code.trim()) {
        Logger.warn(`Skipping empty TS file: ${filePath}`);
        return null;
      }

      return tsParser.parse(code, {
        ecmaVersion: "latest",
        sourceType: "module",
        range: true,
        loc: true,
        ecmaFeatures: { jsx: true },
      });
    } catch (err) {
      Logger.warn(`Failed to parse TS file ${filePath}: ${err.message}`);
      return null;
    }
  }
  scanFile(filePath) {
    let code;
    try {
      code = fs.readFileSync(filePath, "utf8");
    } catch (err) {
      Logger.warn(`Unable to read file ${filePath}: ${err.message}`);
      return [];
    }

    const isTS = filePath.endsWith(".ts") || filePath.endsWith(".tsx");
    const isJS = filePath.endsWith(".js") || filePath.endsWith(".jsx");

    let ast = null;
    if (isTS) ast = this.safeParseTS(code, filePath);
    else if (isJS) ast = this.safeParseJS(code, filePath);
    else return []; // Ignore unknown file types

    if (!ast) return [];

    const violations = [];
    const context = {
      inAssignment: false,
      inDeclaration: false,
      currentFunction: null
    };

    const self = this;

    try {
      walk.simple(ast, {
        VariableDeclarator(node) {
          if (!node || !node.type) return;
          context.inDeclaration = true;
          context.inAssignment = true;
        },
        AssignmentExpression(node) {
          if (!node || !node.type) return;
          context.inAssignment = true;
        },
        FunctionDeclaration(node) {
          if (!node || !node.type) return;
          context.currentFunction = node.id?.name || "anonymous";
        },
        FunctionExpression(node) {
          if (!node || !node.type) return;
          context.currentFunction = node.id?.name || "anonymous";
        },
        ArrowFunctionExpression(node) {
          if (!node || !node.type) return;
          context.currentFunction = "arrow";
        },

        "VariableDeclarator:exit": () => { context.inDeclaration = false; context.inAssignment = false; },
        "AssignmentExpression:exit": () => { context.inAssignment = false; },
        "FunctionDeclaration:exit": () => { context.currentFunction = null; },
        "FunctionExpression:exit": () => { context.currentFunction = null; },
        "ArrowFunctionExpression:exit": () => { context.currentFunction = null; },

        Identifier(node) {
          if (!node || !node.type || !node.parent) return;
          if (context.inDeclaration && node.parent?.type === "VariableDeclarator" && node.parent.id === node) return;
          if (context.inAssignment && node.parent?.type === "AssignmentExpression" && node.parent.left === node) return;
          if (node.parent?.type === "MemberExpression" && node.parent.property === node && !node.parent.computed) return;
          if (node.parent?.type === "Property" && node.parent.key === node && !node.parent.computed) return;
          self.checkFeature(node.name, node, filePath, violations);
        },

        MemberExpression(node) {
          if (!node || !node.property || !node.property.type) return;
          if (node.property.type === "Identifier" && !node.computed) {
            self.checkFeature(node.property.name, node, filePath, violations);
          }
        },

        CallExpression(node) {
          if (!node || !node.callee) return;
          if (node.callee.type === "Identifier") {
            self.checkFeature(node.callee.name, node, filePath, violations);
          } else if (node.callee.type === "MemberExpression" && node.callee.property?.type === "Identifier") {
            self.checkFeature(node.callee.property.name, node, filePath, violations);
          }
        },

        ImportDeclaration(node) {
          if (!node) return;
          self.checkFeature("import", node, filePath, violations);
          if (Array.isArray(node.specifiers)) {
            node.specifiers.forEach((spec) => {
              if (spec?.type === "ImportSpecifier" && spec.imported?.name) {
                self.checkFeature(spec.imported.name, node, filePath, violations);
              }
            });
          }
        },

        AwaitExpression(node) { if (node) self.checkFeature("await", node, filePath, violations); },
        YieldExpression(node) { if (node) self.checkFeature("yield", node, filePath, violations); }
      });
    } catch (err) {
      Logger.warn(`Walk error in ${filePath}: ${err.message}`);
    }

    return violations;
  }

// In the JSScanner class
checkFeature(featureName, node, filePath, violations) {
    // Normalize feature name
    const normalizedName = featureName.toLowerCase();

    // Skip false positives
    if (featureManager.isFalsePositive(normalizedName)) return;

    // Skip if feature is compliant
    if (featureManager.isCompliant(normalizedName)) return;

    const line = node.loc?.start?.line || 'unknown';
    const key = `${filePath}:${line}:${normalizedName}`;

    if (!this.seenKeys.has(key)) {
      this.seenKeys.add(key);
      violations.push({ 
        file: filePath, 
        line, 
        feature: normalizedName,
        type: 'js',
        context: this.getNodeContext(node)
      });
    } 
  }

  getNodeContext(node) {
    if (node.type === 'CallExpression') return 'function_call';
    if (node.type === 'MemberExpression') return 'property_access';
    if (node.type === 'ImportDeclaration') return 'import';
    return 'usage';
  }
}

// --- CSS Scanner ---
class CSSScanner {
  async scanFiles(cssFiles) {
    const violations = [];
    for (const filePath of cssFiles) {
      try {
        const css = fs.readFileSync(filePath, "utf8");
        if (!css.trim()) {
          Logger.warn(`Skipping empty CSS file: ${filePath}`);
          continue;
        }

        const processor = postcss([
          doiuse({
            browsers: config.browsers.split(","),
            onFeatureUsage: (usage) => {
              if (!featureManager.isCompliant(usage.feature)) {
                violations.push({
                  file: filePath,
                  line: usage.usage?.start?.line || "unknown",
                  feature: usage.feature,
                  type: "css",
                  message: usage.message,
                });
              }
            },
          }),
        ]);

        await processor.process(css, { from: filePath });
      } catch (err) {
        Logger.warn(`CSS scan failed for ${filePath}: ${err.message}`);
      }
    }
    return violations;
  }
}


// --- Report Generator ---
class ReportGenerator {
  static generateReports(violations, totalFiles) {
    const reportDir = path.resolve(config.reportDir);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const now = new Date().toISOString();
    const htmlPath = path.join(reportDir, 'baseline-report.html');
    const jsonPath = path.join(reportDir, 'baseline-report.json');

    // HTML Report
    const html = this.generateHTMLReport(violations, totalFiles, now);
    fs.writeFileSync(htmlPath, html, 'utf8');

    // JSON Report
    const json = this.generateJSONReport(violations, totalFiles, now);
    fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');

    Logger.info(`Reports generated: ${htmlPath}, ${jsonPath}`);
  }

  static generateHTMLReport(violations, totalFiles, timestamp) {
    const rows = violations.map(v => `
      <tr class="violation">
        <td>${v.file}</td>
        <td>${v.line}</td>
        <td><code>${v.feature}</code></td>
        <td>${v.type}</td>
        <td>${v.message || ''}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Baseline Guard Report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; }
    .summary { background: #f8f9fa; padding: 1rem; border-radius: 0.5rem; margin-bottom: 2rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #e9ecef; }
    .violation { background: #ffeaea; }
    .pass { color: #28a745; }
    .fail { color: #dc3545; }
    code { background: #f1f3f4; padding: 0.2rem 0.4rem; border-radius: 0.25rem; }
  </style>
</head>
<body>
  <h1>🚦 Baseline Guard Report</h1>
  
  <div class="summary">
    <p><strong>Generated:</strong> ${new Date(timestamp).toLocaleString()}</p>
    <p><strong>Baseline Target:</strong> <code>${config.targetBaseline}</code></p>
    <p><strong>Files Scanned:</strong> ${totalFiles}</p>
    <p><strong>Violations Found:</strong> <span class="${violations.length ? 'fail' : 'pass'}">${violations.length}</span></p>
    <p><strong>Dry Run:</strong> ${config.dryRun}</p>
  </div>

  ${violations.length ? `
    <table>
      <thead>
        <tr>
          <th>File</th>
          <th>Line</th>
          <th>Feature</th>
          <th>Type</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  ` : '<div class="pass"><h3>✅ No violations found!</h3></div>'}
</body>
</html>`;
  }

  static generateJSONReport(violations, totalFiles, timestamp) {
    return {
      generated_at: timestamp,
      baseline_target: config.targetBaseline,
      total_files_scanned: totalFiles,
      violations_count: violations.length,
      violations: violations,
      summary: {
        js_violations: violations.filter(v => v.type === 'js').length,
        css_violations: violations.filter(v => v.type === 'css').length
      }
    };
  }
}

// --- Main execution ---
async function main() {
  Logger.info('🚀 Starting Baseline Guard');
  Logger.info(`Target Baseline: ${config.targetBaseline}`);
  Logger.info(`Scan Files: ${config.scanFiles}`);
  Logger.info(`Browsers: ${config.browsers}`);

  try {
    // Load features
    featureManager.loadFeatures();

    // Find files
    const files = await glob(config.scanFiles, { ignore: config.ignorePatterns });
    Logger.info(`Found ${files.length} files to scan`);

    const jsFiles = files.filter(f => /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(f));
    const cssFiles = files.filter(f => f.endsWith('.css'));

    // Scan files
    const jsScanner = new JSScanner();
    let violations = [];

    // Scan JS files
    Logger.info(`Scanning ${jsFiles.length} JavaScript files...`);
    for (const file of jsFiles) {
      const fileViolations = jsScanner.scanFile(file);
      violations.push(...fileViolations);
    }

    // Scan CSS files
    Logger.info(`Scanning ${cssFiles.length} CSS files...`);
    const cssScanner = new CSSScanner();
    const cssViolations = await cssScanner.scanFiles(cssFiles);
    violations.push(...cssViolations);

    // Generate reports
    ReportGenerator.generateReports(violations, files.length);

    // Handle results
    if (violations.length > 0) {
      Logger.warn(`Found ${violations.length} baseline violations`);
      
      if (!config.dryRun && config.failOnNewly) {
        Logger.error(`Build failed due to ${violations.length} baseline violations`);
        if (core) core.setFailed(`Baseline guard: ${violations.length} violations`);
        process.exit(1);
      } else {
        Logger.warn('Continuing (dry run or fail disabled)');
        process.exit(0);
      }
    } else {
      Logger.success('No baseline violations found!');
      process.exit(0);
    }

  } catch (error) {
    Logger.error(`Baseline Guard failed: ${error.message}`);
    if (core) core.setFailed(error.message);
    process.exit(1);
  }
}

const isMainModule = path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  main();
}

export { Config, FeatureManager, JSScanner, CSSScanner };