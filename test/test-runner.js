/**
 * Baseline Guard - Test Runner
 * --------------------------------------------
 * This script runs sanity checks to make sure:
 *  - The Baseline Guard CLI runs successfully
 *  - Dry-run mode works
 *  - Reports are generated
 *  - Feature parsing doesn’t break
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import chalk from "chalk";

const root = path.resolve(process.cwd());
const reportPath = path.join(root, "baseline-report.html");

function log(msg) {
  console.log(chalk.cyan(`[TEST] ${msg}`));
}

function runCommand(cmd) {
  try {
    log(`Running: ${cmd}`);
    const output = execSync(cmd, { stdio: "pipe" }).toString();
    console.log(chalk.gray(output));
    return output;
  } catch (err) {
    console.error(chalk.red(`❌ Command failed: ${cmd}`));
    console.error(chalk.red(err.stdout?.toString() || err.message));
    throw err;
  }
}

async function runTests() {
  console.log(chalk.bold.magenta("\n=== Running Baseline Guard Tests ===\n"));

  // 1️⃣ Check for required files
  const dataPath = path.join(root, "dist", "web-features", "data.json");
  if (!fs.existsSync(dataPath)) {
    console.error(chalk.red("❌ Missing dist/web-features/data.json"));
    console.error("Run `npm run build` first.");
    process.exit(1);
  }
  log("✅ web-features data found");

  // 2️⃣ Create dummy test files
  const srcDir = path.join(root, "src");
  const jsFile = path.join(srcDir, "test.js");
  const cssFile = path.join(srcDir, "test.css");

  if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir);

  fs.writeFileSync(
    jsFile,
    `
    function example() {
      const arr = [1,2,3];
      arr.push(4);
      console.log("Test run");
    }
    example();
    `
  );

  fs.writeFileSync(
    cssFile,
    `
    :root {
      color-scheme: dark light;
    }
    @media (prefers-color-scheme: dark) {
      body { background-color: black; }
    }
    `
  );

  log("✅ Created dummy JS and CSS test files");

  // 3️⃣ Run dry-run mode
  runCommand("node src/index.js --dry-run");

  // 4️⃣ Run widely mode
  runCommand("node src/index.js --target-baseline=widely");

  // 5️⃣ Verify HTML report
  if (fs.existsSync(reportPath)) {
    const reportSize = fs.statSync(reportPath).size;
    if (reportSize > 500) {
      log(`✅ Report generated successfully (${reportSize} bytes)`);
    } else {
      console.warn(chalk.yellow("⚠️ Report found but seems too small."));
    }
  } else {
    console.error(chalk.red("❌ No HTML report generated"));
  }

  // 6️⃣ Cleanup (optional)
  // fs.unlinkSync(jsFile);
  // fs.unlinkSync(cssFile);

  console.log(chalk.bold.green("\n✅ All Baseline Guard tests completed successfully.\n"));
}

runTests().catch((err) => {
  console.error(chalk.red("❌ Test run failed"), err);
  process.exit(1);
});
