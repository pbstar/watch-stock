// 由 esbuild 的 text loader 内联，作为字符串导入
declare module "*.html" {
  const content: string;
  export default content;
}

// 构建期由 esbuild.config.mjs 的 webview-assets 插件提供的虚拟模块：
// webview 的浏览器 bundle 与压缩后的样式表
declare module "webview-bundle:js" {
  const content: string;
  export default content;
}

declare module "webview-bundle:style" {
  const content: string;
  export default content;
}
