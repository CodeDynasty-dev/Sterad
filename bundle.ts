import { readFile, writeFile } from "fs/promises";
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
