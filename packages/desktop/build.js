import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const localPkg = resolve(fileURLToPath(import.meta.url), "./node_modules/electron-builder/package.json");
const require = createRequire(localPkg);
const { build } = require("electron-builder");

const __dirname = dirname(fileURLToPath(import.meta.url));

const config = {
  electronVersion: "31.7.7",
  appId: "com.cowxcode.app",
  productName: "CowxCode",
  copyright: "Copyright © 2026 CowxCode Team",
  directories: {
    output: join(__dirname, "dist"),
    buildResources: join(__dirname, "ui"),
  },
  files: [
    "main.js",
    "preload.cjs",
    "ui/**/*",
    "node_modules/@cowxcode/core/**/*",
  ],
  win: {
    target: [
      { target: "nsis", arch: "x64" },
      { target: "portable", arch: "x64" },
    ],
    icon: join(__dirname, "ui", "icon.ico"),
    publisherName: "CowxCode Team",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: "CowxCode-Setup-${version}.${ext}",
  },
  portable: {
    artifactName: "CowxCode-Portable-${version}.${ext}",
  },
};

await build({ config });
console.log("✔ CowxCode Windows build complete.");
