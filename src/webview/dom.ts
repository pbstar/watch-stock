// 面板固定的 DOM 节点，导入时一次取好（脚本在 body 末尾加载，此时节点已就绪）
export const bar = document.querySelector<HTMLElement>(".bar")!;
export const content = document.querySelector<HTMLElement>("#content")!;
export const time = document.querySelector<HTMLElement>("#time")!;
