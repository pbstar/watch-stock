// webview 入口：消息分发、tab 切换、tab 状态恢复
import type {
  FlowRowItem,
  RankDir,
  RowItem,
  SectorItem,
  Tab,
  ToHost,
  ToView,
} from "../shared/protocol";
import { renderList } from "./list";
import { flowCells, quoteCells } from "./cells";
import { DetailBlock } from "./detail";
import { renderSector } from "./sector";

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
  flow: { inflow: [] as FlowRowItem[], outflow: [] as FlowRowItem[] },
  time: "",
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const content = $("#content");

// 展开行：切 tab 即收起
let expanded: string | null = null;
// 展开行的详情块：展开期间常驻，行情刷新只搬位置不重建
let detail: DetailBlock | null = null;

// 指数无个股指标，详情块按精简模式渲染
function compact(): boolean {
  return state.tab === "index";
}

// 收起展开行：切标签或切换涨跌榜都收起，行状态不跨列表保留
function collapse(): void {
  expanded = null;
  detail = null;
  vscode.postMessage({ type: "expand", code: null });
}

function render(): void {
  document.querySelectorAll<HTMLElement>(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === state.tab);
  });
  document.querySelectorAll<HTMLElement>(".subtab").forEach((el) => {
    el.classList.toggle("active", el.dataset.dir === rankDir);
  });
  // 榜单切换只在排行标签下露出
  document.body.classList.toggle("ranking", state.tab === "rank");
  $("#time").textContent = data.time;
  if (state.tab === "sector") {
    renderSector(content, data.sector);
    return;
  }
  if (state.tab === "rank") {
    renderRank();
  } else {
    renderList(
      content,
      state.tab === "index" ? data.index : data.stocks,
      expanded,
      detail,
      quoteCells,
    );
  }
}

// 排行子榜两套列：涨跌榜是行情行，资金榜是资金行，行内都可展开
function renderRank(): void {
  if (rankDir === "up" || rankDir === "down") {
    renderList(content, data.rank[rankDir], expanded, detail, quoteCells);
  } else {
    renderList(content, data.flow[rankDir], expanded, detail, flowCells);
  }
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
  detail = code ? new DetailBlock(compact()) : null;
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
      data.flow = { inflow: msg.inflow, outflow: msg.outflow };
      break;
    case "detail":
      if (msg.code !== expanded) return;
      detail?.update({ quote: msg.quote, minute: msg.minute });
      return;
  }
  render();
});

vscode.postMessage({ type: "ready", tab: state.tab });
