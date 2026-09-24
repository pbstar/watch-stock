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

// 图表宽度跟随表格宽度（行情数字位数变化也会改变），尺寸变化时重画
let raf = 0;
const resizeObserver = new ResizeObserver(() => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(drawChart);
});

// 展开行的详情行：展开期间常驻，行情刷新只搬位置不重建
let detailRow: HTMLTableRowElement | null = null;

function setDetailRow(row: HTMLTableRowElement | null): void {
  resizeObserver.disconnect();
  detailRow = row;
  if (row) resizeObserver.observe(row.querySelector(".chart")!);
}
setDetailRow(state.expanded ? createDetailRow() : null);

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
    // 详情行重新挂载（切回自选、列表从空恢复）时宽度可能已变，按最新宽度重画
    if (!attached) drawChart();
  }
}

// 详情数据到达：只更新指标文字并重画图表，列表与悬停读数不受影响
function renderDetail(): void {
  if (!detailRow) return;
  updateDetailMetrics(detailRow, data.detail);
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
  setDetailRow(code ? createDetailRow() : null);
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
        setDetailRow(null);
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

vscode.postMessage({ type: "ready", ...state });
