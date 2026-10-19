// webview 入口：tab 切换、消息分发与面板状态
import type { RankDir, Tab, ToHost, ToView } from "../shared/protocol";
import { DetailBlock } from "./detail";
import { bar, content } from "./dom";
import { render } from "./render";
import { createViewState, type PersistentState } from "./viewState";

declare function acquireVsCodeApi(): {
  postMessage(msg: ToHost): void;
  getState(): PersistentState | undefined;
  setState(state: PersistentState): void;
};

const vscode = acquireVsCodeApi();
const state = createViewState(vscode.getState()?.tab ?? "mine");

// 收起展开行：切标签或切换涨跌榜都收起，行状态不跨列表保留
function collapse(): void {
  state.open = null;
  vscode.postMessage({ type: "expand", code: null });
}

bar.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest(".refresh")) {
    vscode.postMessage({ type: "refresh" });
    return;
  }
  // 榜单切换：先切到该榜上次的数据，再由扩展端单独刷新这一份
  const dir = target.closest<HTMLElement>(".subtab")?.dataset.dir as
    | RankDir
    | undefined;
  if (dir) {
    if (dir === state.rankDir) return;
    state.rankDir = dir;
    collapse();
    // 先展示该榜上次的数据与时间，扩展端取回新数据后再覆盖
    render(state);
    vscode.postMessage({ type: "rank", dir });
    return;
  }
  const tab = target.closest<HTMLElement>(".tab")?.dataset.tab as Tab | undefined;
  if (!tab || tab === state.tab) return;
  state.tab = tab;
  vscode.setState({ tab });
  state.rankDir = "up";
  collapse();
  vscode.postMessage({ type: "tab", tab, dir: state.rankDir });
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
    case "mine":
      state.data.mine = { items: msg.items, time: msg.time };
      break;
    case "index":
      state.data.index = { items: msg.items, time: msg.time };
      break;
    case "sector":
      state.data.sector = { items: msg.items, time: msg.time };
      break;
    case "rank":
      // 行情行与资金行分两支赋值，保持消息与列表数据的类型收窄
      if (msg.dir === "up" || msg.dir === "down") {
        state.data.rank[msg.dir] = { items: msg.items, time: msg.time };
      } else {
        state.data.rank[msg.dir] = { items: msg.items, time: msg.time };
      }
      break;
    case "colorful":
      document.body.classList.toggle("colorful", msg.value);
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

vscode.postMessage({ type: "tab", tab: state.tab, dir: state.rankDir });
