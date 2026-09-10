// 股票首页 WebviewPanel：宿主侧只负责取数、缓存与消息收发，渲染逻辑全在 src/webview/
import * as crypto from "crypto";
import * as vscode from "vscode";
import {
  INDUSTRY_CODES,
  INDUSTRY_CODE_LIST,
  INDEX_CODES,
  config,
} from "../config";
import {
  getStockList,
  getStockMinute,
  getStockQuoteList,
} from "../services/stockService";
import type {
  IndustryItem,
  MinutePoint,
  Stock,
  StockOverview,
  StockQuote,
} from "../types";
import { sendMsg } from "../utils/msg";
import { miniName } from "../utils/stock";
import {
  type HostMessage,
  type WebviewRequest,
} from "../webview/protocol";
import panelHtml from "../webview/stockHome.html";
import webviewScript from "webview-bundle:js";
import webviewStyle from "webview-bundle:style";

// 分时数据缓存有效期：10 秒，避免切换 tab 时重复请求
const MINUTE_CACHE_TTL = 10_000;
// 面板标题固定为插件名，编辑器 tab 页不暴露「查看股票」字样
const PANEL_TITLE = "watch-stock";
// 行业代码 → 名称索引
const INDUSTRY_NAME_MAP = new Map(INDUSTRY_CODES.map((c) => [c.code, c.name]));

interface MinuteCacheEntry {
  data: MinutePoint[];
  timestamp: number;
}

// 组装 webview 的 HTML：占位符替换必须用函数形式，避免产物中的 $& / $' 被当成替换序列
function buildHtml(): string {
  const nonce = crypto.randomBytes(16).toString("base64url");
  return panelHtml
    .replace(/\{\{NONCE\}\}/g, () => nonce)
    .replace("{{STYLE}}", () => webviewStyle)
    .replace("{{SCRIPT}}", () => webviewScript);
}

export class StockHomePanel {
  static current: StockHomePanel | null = null;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly minuteCache = new Map<string, MinuteCacheEntry>();
  private readonly ready: Promise<void>;
  private markReady: () => void = () => {};
  private quoteMap = new Map<string, StockQuote>();
  private stockMap = new Map<string, StockOverview>();
  private stocks: StockOverview[] = [];
  private indexStocks: Stock[] = [];
  private industryStocks: IndustryItem[] = [];
  private activeCode: string | null = null;
  private disposed = false;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    // ready 握手：HTML 只在构造时构建一次，之后 show() 不再复位 webview
    this.ready = new Promise<void>((resolve) => {
      this.markReady = resolve;
    });
    // 先挂消息监听再塞 HTML，避免 webview 抢先 postMessage("ready") 时没人接
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewRequest) => void this.handleMessage(message),
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.html = buildHtml();
  }

  // 入口：打开面板并推送最新数据
  static async show(): Promise<void> {
    const codes = config.getStocks();
    if (!codes.length) {
      sendMsg("请先添加股票", { type: "warning" });
      return;
    }

    const [quotes, indexData, industryData] = await Promise.all([
      getStockQuoteList(codes),
      getStockList(INDEX_CODES),
      getStockList(INDUSTRY_CODE_LIST),
    ]);
    if (!quotes.length) {
      sendMsg("获取股票数据失败，请检查网络连接", { type: "error" });
      return;
    }

    const column = vscode.ViewColumn.One;
    let current = StockHomePanel.current;
    if (current) {
      current.panel.reveal(column);
    } else {
      current = new StockHomePanel(
        vscode.window.createWebviewPanel("stockHome", PANEL_TITLE, column, {
          enableScripts: true,
          retainContextWhenHidden: true,
        }),
      );
      StockHomePanel.current = current;
    }
    await current.load(quotes, indexData, industryData);
  }

  private post(message: HostMessage): void {
    if (this.disposed) return;
    void this.panel.webview.postMessage(message);
  }

  private async handleMessage(message: WebviewRequest): Promise<void> {
    switch (message.type) {
      case "ready":
        this.markReady();
        break;
      case "switchStock":
        this.activeCode = message.code;
        await this.fetchAndSend(message.code);
        break;
      case "refresh":
        if (this.activeCode) await this.fetchAndSend(this.activeCode, true);
        break;
      case "refreshIndex":
        this.indexStocks = await getStockList(INDEX_CODES);
        this.post({ type: "indexData", indexStocks: this.indexStocks });
        break;
      case "refreshIndustry": {
        const industryData = await getStockList(INDUSTRY_CODE_LIST);
        this.industryStocks = this.mapIndustryData(industryData);
        this.post({ type: "industryData", industryStocks: this.industryStocks });
        break;
      }
    }
  }

  private mapIndustryData(industryData: Stock[]): IndustryItem[] {
    return industryData.map((item) => ({
      code: item.code,
      name: INDUSTRY_NAME_MAP.get(item.code) || item.name,
      changePercent: item.changePercent,
    }));
  }

  private toOverview(quote: StockQuote): StockOverview {
    return {
      name: quote.name,
      code: quote.code,
      current: quote.current,
      changeValue: quote.changeValue,
      changePercent: quote.changePercent,
      preClose: quote.close,
      isETF: quote.isETF,
      dateTime: quote.dateTime,
    };
  }

  private async load(
    quotes: StockQuote[],
    indexData: Stock[],
    industryData: Stock[],
  ): Promise<void> {
    if (this.disposed) return;
    // 简称开关只在这里读一次，webview 端零配置直接消费 displayName
    const enableMiniName = config.getEnableMiniName();
    const miniNames = config.getStockMiniNames();
    this.quoteMap = new Map();
    this.stockMap = new Map();
    this.stocks = quotes.map((quote) => {
      const info = this.toOverview(quote);
      info.displayName = enableMiniName
        ? miniName(quote.code, quote.name, miniNames)
        : quote.name;
      this.quoteMap.set(quote.code, quote);
      this.stockMap.set(quote.code, info);
      return info;
    });
    this.indexStocks = indexData;
    this.industryStocks = this.mapIndustryData(industryData);
    this.activeCode = null;

    await this.ready;
    this.post({
      type: "init",
      stocks: this.stocks,
      indexStocks: this.indexStocks,
      industryStocks: this.industryStocks,
      quoteData: Object.fromEntries(this.quoteMap),
    });
  }

  private async fetchAndSend(
    code: string,
    forceRefresh = false,
  ): Promise<void> {
    const now = Date.now();
    const cached = this.minuteCache.get(code);
    if (!forceRefresh && cached && now - cached.timestamp < MINUTE_CACHE_TTL) {
      this.post({
        type: "minuteData",
        code,
        data: cached.data,
        stockInfo: this.stockMap.get(code) ?? null,
        quoteInfo: this.quoteMap.get(code) ?? null,
        cached: true,
      });
      return;
    }

    this.post({ type: "loading", code });
    const data = await getStockMinute(code);
    if (this.disposed) return;
    this.minuteCache.set(code, { data, timestamp: Date.now() });
    this.post({
      type: "minuteData",
      code,
      data,
      stockInfo: this.stockMap.get(code) ?? null,
      quoteInfo: this.quoteMap.get(code) ?? null,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (StockHomePanel.current === this) StockHomePanel.current = null;
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
    this.panel.dispose();
  }
}
