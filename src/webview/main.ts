// webview 入口：消息分发、tab 切换、tab 状态恢复
import type { RowItem, SectorItem, Tab, ToHost, ToView } from "../shared/protocol";
import { renderChart } from "./chart";
import {
  createDetail,
  renderList,
  updateDetailMetrics,
  type DetailData,
} from "./list";
import { renderSector } from "./sector";
import { decOf } from "../shared/format";

// 界面状态只记住 tab，展开行属于纯界面状态，不跨面板重建保留
interface ViewState {
  tab: Tab;
}

declare function acquireVsCodeApi(): {
  postMessage(msg: ToHost): void;
  getState(): ViewState | undefined;
  setState(state: ViewState): void;
};

const vscode = acquireVsCodeApi();
const state: ViewState = vscode.getState() ?? { tab: "mine" };

const data = {
  stocks: [] as RowItem[],
  index: [] as RowItem[],
  sector: [] as SectorItem[],
  detail: undefined as DetailData | undefined,
  time: "",
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const content = $("#content");

// 展开行：切 tab 即收起
let expanded: string | null = null;
// 展开行的详情块：展开期间常驻，行情刷新只搬位置不重建
let detailEl: HTMLElement | null = null;

// 指数无个股指标，详情块按精简模式渲染
function compact(): boolean {
  return state.tab === "index";
}

function render(): void {
  document.querySelectorAll<HTMLElement>(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === state.tab);
  });
  $("#time").textContent = data.time;
  if (state.tab === "sector") renderSector(content, data.sector);
  else {
    const attached = detailEl?.isConnected;
    const items = state.tab === "index" ? data.index : data.stocks;
    renderList(content, items, expanded, true, detailEl);
    // 详情块未挂载期间到达的分时不会绘制，重新挂载（切回列表、列表从空恢复）时补画
    if (!attached) drawChart();
  }
}

// 详情数据到达：只更新指标文字并重画图表，列表与悬停读数不受影响
function renderDetail(): void {
  if (!detailEl) return;
  updateDetailMetrics(detailEl, data.detail);
  drawChart();
}

// 展开行存在且分时已到达时画图
function drawChart(): void {
  const quote = data.detail?.quote;
  if (!detailEl?.isConnected || !data.detail || !quote) return;
  const hover = detailEl.querySelector<HTMLElement>(".hover")!;
  const chart = detailEl.querySelector<HTMLElement>(".chart")!;
  renderChart(chart, data.detail.minute, Number(quote.close), decOf(quote.isETF), (text) => {
    hover.textContent = text ?? "";
  });
}

$(".bar").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest(".refresh")) {
    vscode.postMessage({ type: "refresh" });
    return;
  }
  const tab = target.closest<HTMLElement>(".tab")?.dataset.tab as Tab | undefined;
  if (!tab || tab === state.tab) return;
  // 切 tab 一律收起展开行：各列表的展开状态互不相干，不跨 tab 保留
  state.tab = tab;
  vscode.setState(state);
  expanded = null;
  data.detail = undefined;
  detailEl = null;
  vscode.postMessage({ type: "tab", tab });
  render();
});

content.addEventListener("click", (e) => {
  if (state.tab === "sector") return;
  const row = (e.target as HTMLElement).closest<HTMLElement>(".row");
  if (!row) return;
  const code = row.dataset.code === expanded ? null : row.dataset.code!;
  expanded = code;
  data.detail = undefined;
  detailEl = code ? createDetail(compact()) : null;
  vscode.postMessage({ type: "expand", code });
  render();
});

window.addEventListener("message", (e: MessageEvent<ToView>) => {
  const msg = e.data;
  switch (msg.type) {
    case "stocks":
      data.stocks = msg.items;
      data.time = msg.time;
      document.body.classList.toggle("colorful", msg.colorful);
      break;
    case "index":
      data.index = msg.items;
      break;
    case "sector":
      data.sector = msg.items;
      break;
    case "detail":
      if (msg.code !== expanded) return;
      data.detail = { quote: msg.quote, minute: msg.minute };
      renderDetail();
      return;
  }
  render();
});

vscode.postMessage({ type: "ready", tab: state.tab });
