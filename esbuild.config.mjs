import { build } from "esbuild";

// --dev：调试构建，不压缩并输出 sourcemap，便于在 TS 源码上打断点
const dev = process.argv.includes("--dev");

const buildOptions = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  minify: !dev,
  treeShaking: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["vscode"],
  sourcemap: dev,
  legalComments: "none",
};

// webview 浏览器端脚本与样式，运行时通过 asWebviewUri 引用
const webviewOptions = {
  entryPoints: {
    webview: "src/webview/main.ts",
    "webview-style": "src/webview/style.css",
  },
  outdir: "dist",
  bundle: true,
  minify: !dev,
  platform: "browser",
  target: "es2022",
  format: "iife",
  sourcemap: dev,
  legalComments: "none",
};

await Promise.all([build(buildOptions), build(webviewOptions)]);
