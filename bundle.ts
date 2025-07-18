import { readFile, writeFile } from "fs/promises";
import { spawn } from "child_process";

// Run tests before building (only if not in CI or if explicitly requested)
const shouldRunTests =
  process.env.SKIP_TESTS !== "true" && process.env.NODE_ENV !== "production";

if (shouldRunTests) {
  console.log("Sterad: running tests before build...");

  const testProcess = spawn("bun", ["run", "test-runner.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-key-32-characters-long-for-testing-purposes",
    },
  });

  const testResult = await new Promise((resolve) => {
    testProcess.on("close", (code) => {
      resolve(code);
    });
    testProcess.on("error", (error) => {
      console.error("Test execution failed:", error);
      resolve(1);
    });
  });

  if (testResult !== 0) {
    console.error("Sterad: Tests failed! Build aborted.");
    console.error("To skip tests, set SKIP_TESTS=true environment variable.");
    process.exit(1);
  }

  console.log("Sterad: All tests passed! Proceeding with build...");
}

// ? This file does a lot of in just few lines thanks to bunjs
console.log("Sterad: compiling...");
await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "bun",
  banner: `
    // Sterad
    // Host your SPAs with SSR experience, no extra work, gain SEO and Fast Content delivery benefits.`,
});
await Bun.build({
  entrypoints: ["src/inject.ts"],
  outdir: "src",
  minify: true,
  target: "browser",
});
let code = await readFile("dist/index.js", {
  encoding: "utf-8",
});
let script_code = await readFile("src/inject.js", {
  encoding: "utf-8",
});
code = code
  // .replaceAll(/(\n|\r|\s{2,})/g, "")
  .replace("{Sterad-SCRIPT}", script_code);
// .replaceAll(/`/g, "\\`")
// .replaceAll(/\${/g, "\\${");
await writeFile("dist/index.js", code);
await Bun.file("src/inject.js").delete();
console.log("Sterad: compiled!");

// [X] npm pack will call npm run prepare which will run this file
