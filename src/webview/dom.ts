// 面板固定的 DOM 节点：脚本在 body 末尾加载，导入时一次性取好，
// 免得各模块各自按 id 查一遍、还都依赖「必须在末尾」这个隐式约定
export const bar = document.querySelector<HTMLElement>(".bar")!;
export const content = document.querySelector<HTMLElement>("#content")!;
export const time = document.querySelector<HTMLElement>("#time")!;
