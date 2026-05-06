// 由 esbuild 的 text loader 内联，作为字符串导入
declare module "*.html" {
  const content: string;
  export default content;
}

declare module "*.txt" {
  const content: string;
  export default content;
}
