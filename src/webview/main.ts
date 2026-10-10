// webview 入口：消息分发、tab 切换、tab 状态恢复
import type {
  RankDir,
  RowItem,
  SectorItem,
  Tab,
  ToHost,
  ToView,
} from "../shared/protocol";
import { renderChart } from "./chart";
import {
  createDetail,
  renderList,
  updateDetailMetrics,
  type DetailData,
} from "./list";
import { renderSector } from "./sector";
import { decOf } from "../shared/format";

// 界面状态只记住 tab；展开行与排行方向属于纯界面状态，不跨面板重建保留
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

// 排行方向不持久化，每次进「排行」都从涨幅榜开始
let rankDir: RankDir = "up";

const data = {
  stocks: [] as RowItem[],
  index: [] as RowItem[],
  sector: [] as SectorItem[],
  rank: { up: [] as RowItem[], down: [] as RowItem[] },
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

// 收起展开行：切标签或切换涨跌榜都收起，行状态不跨列表保留
function collapse(): void {
  expanded = null;
  data.detail = undefined;
  detailEl = null;
  vscode.postMessage({ type: "expand", code: null });
}

function render(): void {
  document.querySelectorAll<HTMLElement>(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === state.tab);
  });
  document.querySelectorAll<HTMLElement>(".subtab").forEach((el) => {
    el.classList.toggle("active", el.dataset.dir === rankDir);
  });
  // 涨跌榜切换只在排行标签下露出
  document.body.classList.toggle("ranking", state.tab === "rank");
  $("#time").textContent = data.time;
  if (state.tab === "sector") {
    renderSector(content, data.sector);
    return;
  }
  const attached = detailEl?.isConnected;
  const items =
    state.tab === "rank"
      ? data.rank[rankDir]
      : state.tab === "index"
        ? data.index
        : data.stocks;
  renderList(content, items, expanded, true, detailEl);
  // 详情块未挂载期间到达的分时不会绘制，重新挂载（切回列表、列表从空恢复）时补画
  if (!attached) drawChart();
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
  // 涨跌榜切换只改本地方向：两份榜单随排行数据一起下发，不需要回扩展端
  const dir = target.closest<HTMLElement>(".subtab")?.dataset.dir as
    | RankDir
    | undefined;
  if (dir) {
    if (dir === rankDir) return;
    rankDir = dir;
    collapse();
    render();
    return;
  }
  const tab = target.closest<HTMLElement>(".tab")?.dataset.tab as Tab | undefined;
  if (!tab || tab === state.tab) return;
  // 切 tab 一律收起展开行：各列表的展开状态互不相干，不跨 tab 保留
  state.tab = tab;
  vscode.setState(state);
  // 排行方向不跨标签保留，下次进「排行」仍是涨幅榜
  rankDir = "up";
  collapse();
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
    case "rank":
      data.rank = { up: msg.up, down: msg.down };
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
