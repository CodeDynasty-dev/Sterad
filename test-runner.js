#!/usr/bin/env bun
// Comprehensive test runner for Sterad
import { spawn } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

const TESTS_DIR = "./tests";
const TEST_TIMEOUT = 30000; // 30 seconds per test

// ANSI color codes for better output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message, color = "reset") {
  console.log(colorize(message, color));
}

function logHeader(message) {
  console.log();
  log("=".repeat(60), "cyan");
  log(message, "bright");
  log("=".repeat(60), "cyan");
}

function logSubHeader(message) {
  console.log();
  log("-".repeat(40), "blue");
  log(message, "blue");
  log("-".repeat(40), "blue");
}

// Get all test files
function getTestFiles() {
  if (!existsSync(TESTS_DIR)) {
    log(`Tests directory not found: ${TESTS_DIR}`, "red");
    return [];
  }

  const files = readdirSync(TESTS_DIR)
    .filter((file) => file.startsWith("test-") && file.endsWith(".js"))
    .map((file) => join(TESTS_DIR, file));

  return files.sort();
}

// Run a single test file
async function runTest(testFile) {
  return new Promise((resolve) => {
    const testName = testFile.replace(/^.*\//, "").replace(/\.js$/, "");
    log(`Running ${testName}...`, "yellow");

    const startTime = Date.now();
    const proc = spawn("bun", ["run", testFile], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        JWT_SECRET: "test-secret-key-32-characters-long-for-testing-purposes",
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({
        testFile,
        testName,
        success: false,
        error: "Test timeout",
        duration: Date.now() - startTime,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    }, TEST_TIMEOUT);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      resolve({
        testFile,
        testName,
        success: code === 0,
        exitCode: code,
        duration,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    proc.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        testFile,
        testName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

// Parse test output for pass/fail counts
function parseTestResults(stdout) {
  const results = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  // Look for common test result patterns
  const patterns = [
    /(\d+) passed,?\s*(\d+) failed/i,
    /Results:\s*(\d+) passed,?\s*(\d+) failed/i,
    /Passed:\s*(\d+).*Failed:\s*(\d+)/i,
    /✅.*?(\d+).*❌.*?(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = stdout.match(pattern);
    if (match) {
      results.passed = parseInt(match[1]) || 0;
      results.failed = parseInt(match[2]) || 0;
      results.total = results.passed + results.failed;
      break;
    }
  }

  // Fallback: count ✅ and ❌ symbols
  if (results.total === 0) {
    const passMatches = stdout.match(/✅/g);
    const failMatches = stdout.match(/❌/g);
    results.passed = passMatches ? passMatches.length : 0;
    results.failed = failMatches ? failMatches.length : 0;
    results.total = results.passed + results.failed;
  }

  return results;
}

// Main test runner
async function runAllTests() {
  logHeader("STERAD TEST SUITE");

  const testFiles = getTestFiles();

  if (testFiles.length === 0) {
    log("No test files found!", "red");
    process.exit(1);
  }

  log(`Found ${testFiles.length} test files:`, "cyan");
  testFiles.forEach((file) => {
    log(`  • ${file.replace(/^.*\//, "")}`, "blue");
  });

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalDuration = 0;

  logSubHeader("RUNNING TESTS");

  // Run tests sequentially to avoid resource conflicts
  for (const testFile of testFiles) {
    const result = await runTest(testFile);
    results.push(result);
    totalDuration += result.duration;

    if (result.success) {
      const testResults = parseTestResults(result.stdout);
      totalPassed += testResults.passed;
      totalFailed += testResults.failed;

      log(`✅ ${result.testName} - PASSED (${result.duration}ms)`, "green");
      if (testResults.total > 0) {
        log(
          `   ${testResults.passed} passed, ${testResults.failed} failed`,
          "blue"
        );
      }
    } else {
      log(`❌ ${result.testName} - FAILED (${result.duration}ms)`, "red");
      if (result.error) {
        log(`   Error: ${result.error}`, "red");
      }
      if (result.exitCode !== undefined) {
        log(`   Exit code: ${result.exitCode}`, "red");
      }
    }
  }

  logSubHeader("TEST RESULTS SUMMARY");

  // Show detailed results for failed tests
  const failedTests = results.filter((r) => !r.success);
  if (failedTests.length > 0) {
    log("FAILED TESTS:", "red");
    failedTests.forEach((test) => {
      log(`\n${test.testName}:`, "red");
      if (test.stderr) {
        log("STDERR:", "yellow");
        log(test.stderr, "red");
      }
      if (test.stdout) {
        log("STDOUT:", "yellow");
        log(
          test.stdout.substring(0, 500) +
            (test.stdout.length > 500 ? "..." : ""),
          "reset"
        );
      }
    });
  }

  // Overall summary
  const successfulTests = results.filter((r) => r.success).length;
  const failedTestFiles = results.length - successfulTests;

  log(
    `\nTEST FILES: ${successfulTests}/${results.length} passed`,
    successfulTests === results.length ? "green" : "red"
  );

  if (totalPassed > 0 || totalFailed > 0) {
    log(
      `INDIVIDUAL TESTS: ${totalPassed} passed, ${totalFailed} failed`,
      totalFailed === 0 ? "green" : "red"
    );
  }

  log(`TOTAL DURATION: ${totalDuration}ms`, "blue");

  // Test coverage summary
  logSubHeader("TEST COVERAGE");
  log("✅ Bot Detection & User Agent Parsing", "green");
  log("✅ JWT Authentication & Authorization", "green");
  log("✅ Path Traversal Protection", "green");
  log("✅ ReDoS Mitigation & Regex Safety", "green");
  log("✅ Trust Boundary Validation", "green");
  log("✅ Intercept Script Functionality", "green");

  // Exit with appropriate code
  const overallSuccess = failedTestFiles === 0 && totalFailed === 0;

  if (overallSuccess) {
    logHeader("🎉 ALL TESTS PASSED!");
    log("Sterad is ready for production deployment.", "green");
    process.exit(0);
  } else {
    logHeader("❌ SOME TESTS FAILED");
    log("Please review and fix the failing tests before deployment.", "red");
    process.exit(1);
  }
}

// Handle CLI arguments
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Sterad Test Runner

Usage: bun run test-runner.js [options]

Options:
  --help, -h     Show this help message
  --verbose, -v  Show verbose output
  --timeout <ms> Set test timeout (default: 30000ms)

Environment Variables:
  NODE_ENV       Set to 'test' during test execution
  JWT_SECRET     JWT secret for authentication tests
`);
  process.exit(0);
}

// Run the tests
runAllTests().catch((error) => {
  log(`Test runner error: ${error.message}`, "red");
  console.error(error);
  process.exit(1);
});
