// webview 运行环境注入的全局 API（由 VS Code 提供）
import type { WebviewRequest } from "./protocol";

declare global {
  function acquireVsCodeApi(): {
    postMessage(message: WebviewRequest): void;
    getState(): unknown;
    setState(state: unknown): void;
  };
}

export {};
