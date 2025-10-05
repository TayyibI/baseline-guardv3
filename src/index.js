import fs from "fs";
import path from "path";
import fg from "fast-glob";
import { features } from "web-features";
import postcss from "postcss";
import doiuse from "doiuse";
import minimist from "minimist";

const args = minimist(process.argv.slice(2));

// 🧩 Load config file if present
const configPath = path.resolve("baseline.config.json");
let fileConfig = {};

if (fs.existsSync(configPath)) {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    fileConfig = JSON.parse(raw);
    console.log("Loaded config from baseline.config.json");
  } catch (err) {
    console.warn("⚠️ Could not parse baseline.config.json:", err.message);
  }
}

// 🎛️ Merge CLI args with file config (CLI takes precedence)
const options = {
  targetBaseline: args["target-baseline"] || fileConfig.targetBaseline || "widely",
  scanFiles: args["scan-files"] || fileConfig.scanFiles || "src/**/*.{js,css}",
  failOnNewly:
    args["fail-on-newly"] !== undefined
      ? args["fail-on-newly"] === "true"
      : fileConfig.failOnNewly ?? true,
  dryRun:
    args["dry-run"] !== undefined
      ? args["dry-run"] === "true"
      : fileConfig.dryRun ?? false,
  browsers: args["browsers"] || fileConfig.browsers || "defaults",
};

console.log("\n--- Baseline Guard Configuration ---");
console.log(options);
console.log("------------------------------------\n");

console.log("\n--- Baseline Guard start ---");
console.log("Target baseline:", options.targetBaseline);
console.log("Files glob:", options.scanFiles);
console.log("Dry run:", options.dryRun);
console.log("Browsers (CSS):", options.browsers);

const baselineFeatures = Object.values(features).filter(
  f => f.status.baseline === options.targetBaseline
);

const baselineFeatureNames = new Set(
  baselineFeatures.map(f => f.name.toLowerCase())
);

const files = fg.sync(options.scanFiles, { dot: false });
console.log(`Files matched by glob: ${files.length}`);

let violations = [];

for (const file of files) {
  const ext = path.extname(file);
  const content = fs.readFileSync(file, "utf8");

  if (ext === ".js") {
    baselineFeatureNames.forEach(f => {
      if (content.includes(f)) {
        violations.push({ file, feature: f });
      }
    });
  } else if (ext === ".css") {
    const processor = postcss([
      doiuse({
        browsers: options.browsers.split(","),
        onFeatureUsage: usage => {
          violations.push({
            file,
            feature: usage.feature,
            message: usage.message,
          });
        },
      }),
    ]);
    try {
      processor.process(content, { from: file });
    } catch (err) {
      console.warn(`::warning::Failed to parse ${file}: ${err.message}`);
    }
  }
}

if (violations.length) {
  console.log(`Found ${violations.length} non-compliant usages.`);
  const grouped = {};
  violations.forEach(v => {
    grouped[v.file] = grouped[v.file] || [];
    grouped[v.file].push(v.feature);
  });

  const jsonReport = {
    targetBaseline: options.targetBaseline,
    violations,
  };
  fs.writeFileSync("baseline-report.json", JSON.stringify(jsonReport, null, 2));

  const htmlReport = `
<html><head><title>Baseline Report</title></head>
<body><h1>Baseline Guard Report</h1>
<p>Target baseline: <b>${options.targetBaseline}</b></p>
<p>Total violations: <b>${violations.length}</b></p>
<ul>${Object.entries(grouped)
    .map(([file, feats]) => `<li><b>${file}</b>: ${feats.join(", ")}</li>`)
    .join("")}</ul>
</body></html>`;
  fs.writeFileSync("baseline-report.html", htmlReport);

  console.log("Reports written: baseline-report.html and baseline-report.json");
  console.log(`::warning::Found ${violations.length} violations (dry-run or fail disabled).`);
} else {
  console.log("✅ No violations found.");
}

console.log("--- Baseline Guard end ---\n");
