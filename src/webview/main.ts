// webview 入口：tab 切换、消息分发与面板状态
import type { RankDir, Tab, ToHost, ToView } from "../shared/protocol";
import { DetailBlock } from "./detail";
import { render } from "./render";
import { createViewState, type PersistentState } from "./viewState";

declare function acquireVsCodeApi(): {
  postMessage(msg: ToHost): void;
  getState(): PersistentState | undefined;
  setState(state: PersistentState): void;
};

const vscode = acquireVsCodeApi();
const state = createViewState(vscode.getState()?.tab ?? "mine");

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const content = $("#content");

// 收起展开行：切标签或切换涨跌榜都收起，行状态不跨列表保留
function collapse(): void {
  state.open = null;
  vscode.postMessage({ type: "expand", code: null });
}

$(".bar").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest(".refresh")) {
    vscode.postMessage({ type: "refresh" });
    return;
  }
  // 榜单切换只改本地方向：四份榜单随排行数据一起下发，不需要回扩展端
  const dir = target.closest<HTMLElement>(".subtab")?.dataset.dir as
    | RankDir
    | undefined;
  if (dir) {
    if (dir === state.rankDir) return;
    state.rankDir = dir;
    collapse();
    render(state);
    return;
  }
  const tab = target.closest<HTMLElement>(".tab")?.dataset.tab as Tab | undefined;
  if (!tab || tab === state.tab) return;
  // 切 tab 一律收起展开行：各列表的展开状态互不相干，不跨 tab 保留
  state.tab = tab;
  vscode.setState({ tab });
  state.rankDir = "up";
  collapse();
  vscode.postMessage({ type: "tab", tab });
  render(state);
});

content.addEventListener("click", (e) => {
  if (state.tab === "sector") return;
  const row = (e.target as HTMLElement).closest<HTMLElement>(".row");
  if (!row) return;
  const code = row.dataset.code === state.open?.code ? null : row.dataset.code!;
  // 指数无个股指标，详情块按精简模式渲染
  state.open = code
    ? { code, block: new DetailBlock(state.tab === "index") }
    : null;
  vscode.postMessage({ type: "expand", code });
  render(state);
});

window.addEventListener("message", (e: MessageEvent<ToView>) => {
  const msg = e.data;
  switch (msg.type) {
    case "stocks":
      state.data.stocks = msg.items;
      state.data.time = msg.time;
      document.body.classList.toggle("colorful", msg.colorful);
      break;
    case "index":
      state.data.index = msg.items;
      break;
    case "sector":
      state.data.sector = msg.items;
      break;
    case "rank":
      state.data.rank = { up: msg.up, down: msg.down };
      state.data.flow = { inflow: msg.inflow, outflow: msg.outflow };
      break;
    case "detail": {
      const open = state.open;
      if (!open || msg.code !== open.code) return;
      open.block.update({ quote: msg.quote, minute: msg.minute });
      return;
    }
  }
  render(state);
});

vscode.postMessage({ type: "tab", tab: state.tab });
