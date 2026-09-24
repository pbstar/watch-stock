import { build } from "esbuild";

const buildOptions = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  minify: true,
  treeShaking: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["vscode"],
  sourcemap: false,
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
  minify: true,
  platform: "browser",
  target: "es2022",
  format: "iife",
  sourcemap: false,
  legalComments: "none",
};

await Promise.all([build(buildOptions), build(webviewOptions)]);
