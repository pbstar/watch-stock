// webview 入口：消息分发、tab 切换、界面状态恢复
import type { RowItem, SectorItem, Tab, ToHost, ToView } from "../shared/protocol";
import { renderChart } from "./chart";
import { renderList, type DetailData } from "./list";
import { renderSector } from "./sector";

interface ViewState {
  tab: Tab;
  expanded: string | null;
}

declare function acquireVsCodeApi(): {
  postMessage(msg: ToHost): void;
  getState(): ViewState | undefined;
  setState(state: ViewState): void;
};

const vscode = acquireVsCodeApi();
const state: ViewState = vscode.getState() ?? { tab: "mine", expanded: null };

const data = {
  stocks: [] as RowItem[],
  index: [] as RowItem[],
  sector: [] as SectorItem[],
  detail: undefined as DetailData | undefined,
  time: "",
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const content = $("#content");

function render(): void {
  document.querySelectorAll<HTMLElement>(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === state.tab);
  });
  $("#time").textContent = data.time;
  if (state.tab === "sector") renderSector(content, data.sector);
  else if (state.tab === "index") renderList(content, data.index, null, undefined, false);
  else {
    renderList(content, data.stocks, state.expanded, data.detail, true);
    drawChart();
  }
}

// 展开行存在且分时已到达时画图
function drawChart(): void {
  const el = content.querySelector<HTMLElement>(".chart");
  const quote = data.detail?.quote;
  if (!el || !data.detail || !quote) return;
  const hover = content.querySelector<HTMLElement>(".hover")!;
  renderChart(el, data.detail.minute, Number(quote.close), quote.isETF ? 3 : 2, (text) => {
    hover.textContent = text ?? "";
  });
}

function setState(patch: Partial<ViewState>): void {
  Object.assign(state, patch);
  vscode.setState(state);
}

$(".bar").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest(".refresh")) {
    vscode.postMessage({ type: "refresh" });
    return;
  }
  const tab = target.closest<HTMLElement>(".tab")?.dataset.tab as Tab | undefined;
  if (!tab || tab === state.tab) return;
  setState({ tab });
  vscode.postMessage({ type: "tab", tab });
  render();
});

content.addEventListener("click", (e) => {
  if (state.tab !== "mine") return;
  const row = (e.target as HTMLElement).closest<HTMLElement>("tr.row");
  if (!row) return;
  const code = row.dataset.code === state.expanded ? null : row.dataset.code!;
  setState({ expanded: code });
  data.detail = undefined;
  vscode.postMessage({ type: "expand", code });
  render();
});

window.addEventListener("message", (e: MessageEvent<ToView>) => {
  const msg = e.data;
  switch (msg.type) {
    case "stocks":
      data.stocks = msg.items;
      data.time = msg.time;
      // 行情为空多为拉取失败，不据此收起展开行
      const gone =
        msg.items.length > 0 && !msg.items.some((s) => s.code === state.expanded);
      if (state.expanded && gone) {
        setState({ expanded: null });
      }
      document.body.classList.toggle("colorful", msg.colorful);
      break;
    case "index":
      data.index = msg.items;
      break;
    case "sector":
      data.sector = msg.items;
      break;
    case "detail":
      if (msg.code !== state.expanded) return;
      data.detail = { quote: msg.quote, minute: msg.minute };
      break;
  }
  render();
});

// 宽度变化时重画分时图
let raf = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(drawChart);
}).observe(content);

vscode.postMessage({ type: "ready", ...state });
