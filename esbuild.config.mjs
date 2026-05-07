import { build } from "esbuild";
import { readFile } from "fs/promises";

// 简单的 HTML 压缩：移除注释、多余空白和换行
function minifyHtml(html) {
  return (
    html
      // 移除 HTML 注释 <!-- ... -->
      .replace(/<!--[\s\S]*?-->/g, "")
      // 移除 CSS / JS 注释 /* ... */
      .replace(/\/\*[\s\S]*?\*\/\//g, "")
      // 移除多余空白（保留单个空格）
      // .replace(/\s{2,}/g, " ")
      // 移除标签间的空白
      .replace(/>\s+</g, "><")
      // 移除首尾空白
      .trim()
  );
}

// esbuild 插件：压缩 HTML 文件
const htmlMinifyPlugin = {
  name: "html-minify",
  setup(build) {
    build.onLoad({ filter: /\.html$/ }, async (args) => {
      const text = await readFile(args.path, "utf8");
      return {
        contents: minifyHtml(text),
        loader: "text",
      };
    });
  },
};

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
  loader: { ".txt": "text" },
  plugins: [htmlMinifyPlugin],
  logLevel: "info",
};

await build(buildOptions);
