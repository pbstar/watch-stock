import { build } from "esbuild";

const WEBVIEW_SCRIPT_ENTRY = "src/webview/main.ts";
const WEBVIEW_STYLE_ENTRY = "src/webview/style.css";

// 把 webview 源码打成浏览器可直接执行的产物（留在内存里，由扩展侧内联进 HTML）
async function bundleForWebview(entryPoint, extraOptions = {}) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    minify: true,
    legalComments: "none",
    logLevel: "silent",
    ...extraOptions,
  });
  return result.outputFiles[0].text;
}

const webviewAssets = {
  "webview-bundle:js": await bundleForWebview(WEBVIEW_SCRIPT_ENTRY, {
    format: "iife",
    platform: "browser",
    target: "es2021",
  }),
  "webview-bundle:style": await bundleForWebview(WEBVIEW_STYLE_ENTRY),
};

// 让扩展侧能 import 到 webview 产物字符串；HTML 模板本身走 text loader
const webviewAssetsPlugin = {
  name: "webview-assets",
  setup(build) {
    build.onResolve({ filter: /^webview-bundle:/ }, (args) => ({
      path: args.path,
      namespace: "webview-asset",
    }));
    build.onLoad({ filter: /.*/, namespace: "webview-asset" }, (args) => ({
      contents: webviewAssets[args.path] ?? "",
      loader: "text",
    }));
  },
};

await build({
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
  loader: { ".html": "text" },
  plugins: [webviewAssetsPlugin],
});
