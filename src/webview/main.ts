// webview 浏览器入口：只做环境接线（真实 DOM / postMessage / 尺寸测量），
// 业务逻辑全在 app.ts，便于在 Node 里单测。
import { createApp, type AppElements } from "./app";
import { columnsFor } from "./chart";
import { ELEMENT_IDS } from "./elements";
import type { HostMessage, WebviewRequest } from "./protocol";

const vscode = acquireVsCodeApi();

// 元素 id 由 ELEMENT_IDS 单一来源给出，缺失即报错（模板漏写 id 会立刻暴露）
const elements = Object.fromEntries(
  Object.entries(ELEMENT_IDS).map(([key, id]) => {
    const found = document.getElementById(id);
    if (!found) throw new Error("webview 缺少元素 #" + id);
    return [key, found];
  }),
) as AppElements;

/** 量一个等宽字符宽度：用与走势区同一套字体设置，避免比例字体主题下算错列数 */
function measureCharWidth(): number {
  const ruler = document.createElement("span");
  ruler.textContent = "0".repeat(10);
  ruler.style.cssText =
    "position:absolute;visibility:hidden;white-space:pre;font:inherit";
  elements.chartWrap.appendChild(ruler);
  const width = ruler.getBoundingClientRect().width / 10;
  ruler.remove();
  return width;
}

const app = createApp({
  elements,
  post: (message: WebviewRequest) => vscode.postMessage(message),
  createElement: (tag) => document.createElement(tag),
  measureChart: () =>
    columnsFor(elements.chartWrap.clientWidth, measureCharWidth()),
  // 尺寸变化合并到一帧内重绘，避免拖拽面板时反复重排
  onResize: (listener) => {
    let frame = 0;
    new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        listener();
      });
    }).observe(elements.chartWrap);
  },
});

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  app.receive(event.data);
});

// 通知扩展宿主：webview 已就绪，可以下发 init
vscode.postMessage({ type: "ready" });
