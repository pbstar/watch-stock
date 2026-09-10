// 查看面板的状态机与渲染编排
// 通过 deps 注入 DOM 元素与宿主能力，不直接引用 document / acquireVsCodeApi，
// 浏览器相关的接线全部收敛在 main.ts。
import type {
  IndustryItem,
  MinutePoint,
  Stock,
  StockOverview,
  StockQuote,
} from "../types";
import { renderChart } from "./chart";
import { renderDetailHeader } from "./detail";
import { ELEMENT_IDS } from "./elements";
import { INDENT } from "./format";
import { renderIndexTable, renderIndustryFlow } from "./overview";
import {
  OVERVIEW_TAB,
  type HostMessage,
  type WebviewRequest,
} from "./protocol";

const INDEX_TITLE = "❯ overview — 大盘指数";
const INDUSTRY_TITLE = "❯ 行业板块（涨幅排序）";
const FETCHING_TEXT = INDENT + "正在获取数据…";

/** 面板持有的全部元素，键与 ELEMENT_IDS 一一对应 */
export type AppElements = { [K in keyof typeof ELEMENT_IDS]: HTMLElement };

export interface AppDeps {
  elements: AppElements;
  /** 向扩展宿主发消息 */
  post(message: WebviewRequest): void;
  createElement(tag: "div"): HTMLElement;
  /** 按当前面板宽度折算走势图列数（等宽字体宽度只能在浏览器里量） */
  measureChart(): number;
  /** 面板尺寸变化订阅（实现方自行做 rAF 节流） */
  onResize(listener: () => void): void;
}

export interface App {
  /** 处理来自扩展宿主的消息 */
  receive(message: HostMessage): void;
}

export function createApp(deps: AppDeps): App {
  const el = deps.elements;
  let stocks: StockOverview[] = [];
  let indexStocks: Stock[] = [];
  let industryStocks: IndustryItem[] = [];
  let quoteData: Record<string, StockQuote> = {};
  let activeCode = OVERVIEW_TAB;
  let activeInfo: StockOverview | null = null;
  let activeQuote: StockQuote | null = null;
  let minuteData: MinutePoint[] | null = null;

  el.indexTitle.textContent = INDEX_TITLE;
  el.industryTitle.textContent = INDUSTRY_TITLE;

  el.refreshIndex.addEventListener("click", () => {
    el.indexTable.textContent = FETCHING_TEXT;
    deps.post({ type: "refreshIndex" });
  });
  el.refreshIndustry.addEventListener("click", () => {
    el.industryFlow.textContent = FETCHING_TEXT;
    deps.post({ type: "refreshIndustry" });
  });
  el.refreshDetail.addEventListener("click", () => deps.post({ type: "refresh" }));

  deps.onResize(() => {
    if (minuteData) redrawChart();
  });

  function makeTab(code: string, label: string, active: boolean): HTMLElement {
    const tab = deps.createElement("div");
    tab.className = active ? "tab active" : "tab";
    tab.textContent = label;
    tab.addEventListener("click", () => activate(code));
    return tab;
  }

  function renderTabs(): void {
    const tabs = [makeTab(OVERVIEW_TAB, "overview", activeCode === OVERVIEW_TAB)];
    for (const stock of stocks) {
      tabs.push(
        makeTab(
          stock.code,
          stock.displayName || stock.name,
          stock.code === activeCode,
        ),
      );
    }
    el.tabBar.replaceChildren(...tabs);
  }

  function showOverview(): void {
    el.overviewPane.hidden = false;
    el.detailPane.hidden = true;
  }

  function showDetail(): void {
    el.overviewPane.hidden = true;
    el.detailPane.hidden = false;
  }

  function renderOverview(): void {
    el.indexTable.textContent = renderIndexTable(indexStocks);
    el.industryFlow.textContent = renderIndustryFlow(industryStocks);
  }

  function renderDetail(): void {
    el.detailText.textContent = renderDetailHeader(activeInfo, activeQuote);
  }

  function redrawChart(): void {
    if (!activeInfo) return;
    const columns = deps.measureChart();
    const chart = renderChart(minuteData ?? [], {
      columns,
      preClose: Number.parseFloat(activeInfo.preClose),
      digits: activeInfo.isETF ? 3 : 2,
    });
    el.chartPlot.textContent = chart.plot;
    el.chartAxis.textContent = chart.axis;
    el.chartVolume.textContent = chart.volume;
    el.chartSummary.textContent = chart.summary;
    el.chartPlot.classList.toggle("dim", chart.empty);
  }

  function activate(code: string): void {
    if (code === activeCode) return;
    activeCode = code;
    minuteData = null;
    if (code === OVERVIEW_TAB) {
      activeInfo = null;
      activeQuote = null;
      renderTabs();
      showOverview();
      return;
    }
    activeInfo = stocks.find((stock) => stock.code === code) ?? null;
    activeQuote = quoteData[code] ?? null;
    renderTabs();
    renderDetail();
    showDetail();
    // 先画占位（走势区显示「等待分时数据…」），再向宿主请求分时
    redrawChart();
    deps.post({ type: "switchStock", code });
  }

  function receive(message: HostMessage): void {
    switch (message.type) {
      case "init": {
        stocks = message.stocks;
        indexStocks = message.indexStocks;
        industryStocks = message.industryStocks;
        quoteData = message.quoteData;
        activeCode = OVERVIEW_TAB;
        activeInfo = null;
        activeQuote = null;
        minuteData = null;
        renderTabs();
        renderOverview();
        showOverview();
        break;
      }
      case "loading":
        if (message.code === activeCode) {
          minuteData = null;
          showDetail();
          redrawChart();
        }
        break;
      case "minuteData":
        if (message.code !== activeCode) break;
        minuteData = message.data;
        activeInfo =
          message.stockInfo ??
          stocks.find((stock) => stock.code === message.code) ??
          activeInfo;
        activeQuote = message.quoteInfo ?? quoteData[message.code] ?? activeQuote;
        renderDetail();
        redrawChart();
        break;
      case "indexData":
        indexStocks = message.indexStocks;
        el.indexTable.textContent = renderIndexTable(indexStocks);
        break;
      case "industryData":
        industryStocks = message.industryStocks;
        el.industryFlow.textContent = renderIndustryFlow(industryStocks);
        break;
    }
  }

  return { receive };
}
