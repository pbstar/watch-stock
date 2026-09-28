// webview 入口：消息分发、tab 切换、界面状态恢复
import type { RowItem, SectorItem, Tab, ToHost, ToView } from "../shared/protocol";
import { renderChart } from "./chart";
import {
  createDetailRow,
  renderList,
  updateDetailMetrics,
  type DetailData,
} from "./list";
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

// 详情区宽度 = 面板可用宽度，行情行与分时图都按这个宽度铺满，
// 指标放不下时换行，不会撑出横向滚动条
function applyDetailWidth(): void {
  const body = detailRow?.querySelector<HTMLElement>(".detail-body");
  if (!body) return;
  const pad = parseFloat(getComputedStyle(body.parentElement!).paddingLeft) || 0;
  const width = Math.max(0, content.clientWidth - pad);
  body.style.setProperty("--detail-w", `${width}px`);
}

// 展开行的详情行：展开期间常驻，行情刷新只搬位置不重建
let detailRow: HTMLTableRowElement | null = state.expanded ? createDetailRow() : null;

function render(): void {
  document.querySelectorAll<HTMLElement>(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === state.tab);
  });
  $("#time").textContent = data.time;
  if (state.tab === "sector") renderSector(content, data.sector);
  else if (state.tab === "index") renderList(content, data.index, null, false);
  else {
    const attached = detailRow?.isConnected;
    renderList(content, data.stocks, state.expanded, true, detailRow);
    applyDetailWidth();
      // 详情行未挂载期间到达的分时不会绘制，重新挂载（切回自选、列表从空恢复）时补画
    if (!attached) drawChart();
  }
}

// 详情数据到达：只更新指标文字并重画图表，列表与悬停读数不受影响
function renderDetail(): void {
  if (!detailRow) return;
  updateDetailMetrics(detailRow, data.detail);
  applyDetailWidth();
  drawChart();
}

// 展开行存在且分时已到达时画图
function drawChart(): void {
  const quote = data.detail?.quote;
  if (!detailRow?.isConnected || !data.detail || !quote) return;
  const hover = detailRow.querySelector<HTMLElement>(".hover")!;
  const chart = detailRow.querySelector<HTMLElement>(".chart")!;
  renderChart(chart, data.detail.minute, Number(quote.close), quote.isETF ? 3 : 2, (text) => {
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
  detailRow = code ? createDetailRow() : null;
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
        detailRow = null;
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
      renderDetail();
      return;
  }
  render();
});

// 面板宽度变化时重新定宽并重画（详情区宽度、图表宽度都随之变化）
let raf = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    applyDetailWidth();
    drawChart();
  });
});

vscode.postMessage({ type: "ready", ...state });
