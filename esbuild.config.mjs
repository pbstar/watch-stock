import { build, context } from "esbuild";

const isWatch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  minify: !isWatch,
  treeShaking: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["vscode"],
  sourcemap: false,
  legalComments: "none",
  loader: { ".html": "text", ".txt": "text" },
  drop: isWatch ? [] : ["console", "debugger"],
  logLevel: "info",
};

if (isWatch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
} else {
  await build(buildOptions);
}
